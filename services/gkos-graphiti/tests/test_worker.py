import asyncio
import hashlib
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ledger import Ledger
from worker import Worker
from test_ledger import BINDING, JOB

PAYLOAD = b'{"subject":"Aster","object":"Cobalt"}'
DEFINITION = {**JOB, "payload_digest": "sha256:" + hashlib.sha256(PAYLOAD).hexdigest()}


class Adapter:
    def __init__(self):
        self.allowed = True
        self.ingestions = 0

    async def authorize(self, binding):
        return self.allowed

    async def ingest(self, binding, payload):
        self.ingestions += 1
        return "episode-1"

    async def readback(self, binding, episode):
        return PAYLOAD


class WorkerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.ledger = Ledger(Path(self.temp.name) / "ledger.sqlite", create=True)
        self.worker = Worker(self.ledger)

    async def asyncTearDown(self):
        self.ledger.close()
        self.temp.cleanup()

    async def test_duplicate_delivery_does_not_repeat_extraction(self):
        adapter = Adapter()
        first = await self.worker.run(BINDING, DEFINITION, PAYLOAD, adapter)
        second = await self.worker.run(BINDING, DEFINITION, PAYLOAD, adapter)
        self.assertEqual(first, second)
        self.assertEqual(first["state"], "verified")
        self.assertEqual(adapter.ingestions, 1)

    async def test_preflight_and_mid_ingestion_revocation(self):
        adapter = Adapter()
        adapter.allowed = False
        self.assertEqual((await self.worker.run(BINDING, DEFINITION, PAYLOAD, adapter))["state"], "denied")
        self.assertEqual(adapter.ingestions, 0)
        adapter.allowed = True
        async def revoke(binding, payload):
            adapter.allowed = False
            return "episode"
        adapter.ingest = revoke
        self.assertEqual((await self.worker.run(BINDING, DEFINITION, PAYLOAD, adapter))["state"], "revoked")

    async def test_timeout_quarantines_cancellation_resistant_work(self):
        worker = Worker(self.ledger, concurrency=1, timeout=.02)
        adapter = Adapter()
        release = asyncio.Event()
        async def slow(binding, payload):
            try:
                await release.wait()
            except asyncio.CancelledError:
                await release.wait()
            return "episode"
        adapter.ingest = slow
        self.assertEqual((await worker.run(BINDING, DEFINITION, PAYLOAD, adapter))["state"], "deadline")
        self.assertEqual((await worker.run(BINDING, DEFINITION, PAYLOAD, adapter))["reason"], "physical-capacity")
        release.set()
        await asyncio.gather(*worker.tasks)
        self.assertEqual((await worker.run(BINDING, DEFINITION, PAYLOAD, adapter))["state"], "ambiguous")

    async def test_blocked_event_loop_cannot_verify_after_deadline(self):
        import time
        adapter = Adapter()
        reads = []
        async def blocked(binding, payload):
            time.sleep(.03)
            return "late-episode"
        async def readback(binding, episode):
            reads.append(episode)
            return PAYLOAD
        adapter.ingest, adapter.readback = blocked, readback
        result = await Worker(self.ledger, timeout=.01).run(BINDING, DEFINITION, PAYLOAD, adapter)
        self.assertIn(result["state"], ("ambiguous", "deadline"))
        self.assertEqual(reads, [])

    async def test_mismatched_readback_never_becomes_verified(self):
        adapter = Adapter()
        async def wrong(binding, episode):
            return b"different payload"
        adapter.readback = wrong
        self.assertEqual((await self.worker.run(BINDING, DEFINITION, PAYLOAD, adapter))["state"], "ambiguous")
        self.assertEqual((await self.worker.run(BINDING, DEFINITION, PAYLOAD, adapter))["state"], "ambiguous")
        self.assertEqual(adapter.ingestions, 1)


if __name__ == "__main__":
    unittest.main()
