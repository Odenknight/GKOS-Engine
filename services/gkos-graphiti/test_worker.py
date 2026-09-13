import asyncio
import copy
import tempfile
import unittest
from pathlib import Path
from ledger import Ledger, Refused, digest
from worker import Worker, purge_job


class WorkerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.ledger = Ledger(Path(self.temp.name).resolve())
        self.episodes = [{"name": "fixture", "episode_body": '{"fact":"relay"}', "source_description": "synthetic",
                          "reference_time": "2026-09-13T00:00:00Z"}]
        self.manifest = [{"source_id": "note", "source_digest": digest("source"), "episode_digest": digest(self.episodes[0])}]
        self.bound = {"corpus_id": "test", "scope_digest": digest("scope"), "policy_digest": digest("policy"),
                      "configuration_digest": digest("config"), "source_snapshot_digest": digest(self.manifest)}
        self.events = []
        owner = self
        class Backend:
            async def initialize(self): owner.events.append("initialize")
            async def add(self, episode): owner.events.append("add"); return "projection-episode"
            async def matches(self, uid, episode): owner.events.append("read"); return True
            async def close(self): owner.events.append("close")
        self.backend = Backend()
        self.worker = Worker(self.ledger)

    async def asyncTearDown(self):
        self.ledger.close()
        self.temp.cleanup()

    def current(self):
        return copy.deepcopy((self.bound, self.manifest, self.episodes))

    async def test_success_is_observed_not_automatically_published(self):
        result = await self.worker.run(self.current, lambda group: self.backend)
        self.assertEqual(self.events, ["initialize", "add", "read", "close"])
        self.assertEqual(self.ledger.status(result["job"])["state"], "observed")
        self.assertEqual(result["receipt"]["searchability"], "unverified")
        with self.assertRaises(Refused):
            self.ledger.read(result["job"], self.bound)
        with self.assertRaises(Refused):
            await self.worker.run(self.current, lambda group: self.backend)

    async def test_revocation_after_add_quarantines_without_read_or_publish(self):
        async def add(episode):
            self.events.append("add")
            self.bound["policy_digest"] = digest("new-policy")
            return "episode"
        self.backend.add = add
        with self.assertRaisesRegex(Refused, "authority-changed"):
            await self.worker.run(self.current, lambda group: self.backend)
        self.assertEqual(self.events, ["initialize", "add", "close"])
        self.assertEqual(self.ledger.db.execute("SELECT state FROM jobs").fetchone()[0], "quarantined")

    async def test_cancellation_preserves_ambiguous_effect_and_closes(self):
        entered = asyncio.Event()
        async def add(episode):
            entered.set()
            await asyncio.Future()
        self.backend.add = add
        task = asyncio.create_task(self.worker.run(self.current, lambda group: self.backend))
        await entered.wait()
        with self.assertRaisesRegex(Refused, "worker-busy"):
            await self.worker.run(self.current, lambda group: self.backend)
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertEqual(self.events, ["initialize", "close"])
        self.assertEqual(self.ledger.db.execute("SELECT state FROM jobs").fetchone()[0], "quarantined")

    async def test_close_boundary_authority_change_cannot_be_observed(self):
        async def close(): self.bound["configuration_digest"] = digest("changed")
        self.backend.close = close
        with self.assertRaisesRegex(Refused, "authority-changed"):
            await self.worker.run(self.current, lambda group: self.backend)
        self.assertEqual(self.ledger.db.execute("SELECT state FROM jobs").fetchone()[0], "quarantined")

    async def test_purge_requires_stopped_writer_and_verified_absence(self):
        result = await self.worker.run(self.current, lambda group: self.backend)
        job = result["job"]
        self.ledger.revoke("test")
        deleted = []
        async def delete(group): deleted.append(group)
        async def present(group): return False
        async def absent(group): return True
        with self.assertRaisesRegex(Refused, "purge-not-authorized"):
            await purge_job(self.ledger, job, writer_stopped=lambda _: False, delete_graph=delete, graph_absent=absent)
        self.assertEqual(deleted, [])
        with self.assertRaisesRegex(Refused, "purge-unverified"):
            await purge_job(self.ledger, job, writer_stopped=lambda _: True, delete_graph=delete, graph_absent=present)
        self.assertEqual(self.ledger.status(job)["state"], "revoked")
        await purge_job(self.ledger, job, writer_stopped=lambda _: True, delete_graph=delete, graph_absent=absent)
        self.assertEqual(self.ledger.status(job)["state"], "purged")
        with self.assertRaises(Refused):
            self.ledger.publish(job, self.bound)


if __name__ == "__main__":
    unittest.main()
