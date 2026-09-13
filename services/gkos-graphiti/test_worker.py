import asyncio
import copy
import json
import tempfile
import sys
import types
import unittest
from unittest.mock import patch
from backend import GraphitiBackend
from pathlib import Path
from ledger import Ledger, Refused, digest
from worker import Worker, purge_job
from readonly_query import query_published


class WorkerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.ledger = Ledger(Path(self.temp.name).resolve(), create=True)
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

    async def test_same_source_episodes_survive_worker_publication_and_query_citations(self):
        self.episodes.append({**self.episodes[0], "name": "relationship", "episode_body": '{"fact":"relay connects chamber"}'})
        self.manifest.append({**self.manifest[0], "episode_digest": digest(self.episodes[1])})
        self.bound["source_snapshot_digest"] = digest(self.manifest)
        added = []
        async def add(episode):
            added.append(copy.deepcopy(episode))
            return f"episode-{len(added)}"
        self.backend.add = add
        result = await self.worker.run(self.current, lambda group: self.backend)
        self.assertEqual(added, self.episodes)
        self.ledger.publish(result["job"], self.bound)
        published = self.ledger.read(result["job"], self.bound)
        self.assertEqual([m["source_id"] for m in published["mappings"]], ["note", "note"])
        request = {"contract_version": "gkos-graphiti-query/1.0.0-draft.1", "request_id": "multi",
                   "binding": published["binding"], "query": "relay", "limit": 5}
        driver = object()
        async def search(*args):
            return [types.SimpleNamespace(fact="relay connects chamber", episodes=["episode-1", "episode-2"],
                                          group_id=published["binding"]["projection_id"])]
        with patch("readonly_query._groups", {driver: published["binding"]["projection_id"]}), \
             patch("readonly_query.search_readonly", side_effect=search):
            body = await query_published(self.ledger, result["job"], lambda: copy.deepcopy(self.bound), None, driver, request)
        self.assertEqual(json.loads(body)["hits"][0]["citations"], published["mappings"])
        self.assertEqual(json.loads(body)["hits"][0]["semantic_support"], "unverified")

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

    async def test_oversized_input_is_refused_before_copy_or_backend_initialization(self):
        class CopyBomb(str):
            def __deepcopy__(self, memo): raise AssertionError('copied before validating size')
        self.episodes[0]['episode_body'] = CopyBomb('x' * 1048577)
        called = []
        with self.assertRaisesRegex(Refused, 'episode-invalid'):
            await self.worker.run(lambda: (self.bound, self.manifest, self.episodes), lambda group: called.append(group))
        self.assertEqual(called, [])
        self.assertEqual(self.ledger.db.execute('SELECT COUNT(*) FROM jobs').fetchone()[0], 0)

    async def test_late_backend_phases_quarantine_and_close_both_clients(self):
        for phase in ("initialize", "add", "read", "close"):
            with self.subTest(phase=phase):
                now, calls = [0.0], []
                self.bound["configuration_digest"] = digest(phase)
                def mark(name):
                    calls.append(name)
                    if name == phase:
                        now[0] += 121  # Simulate provider elapsed time without a slow test.
                class Graphiti:
                    async def build_indices_and_constraints(self): mark("initialize")
                    async def add_episode(self, **kwargs):
                        mark("add")
                        return types.SimpleNamespace(episode=types.SimpleNamespace(uuid="episode"))
                    async def close(self): mark("close")
                class ReadClient:
                    def select_graph(self, group): return self
                    async def ro_query(self, *args, **kwargs):
                        mark("read")
                        return types.SimpleNamespace(result_set=[[True, True]])
                    async def aclose(self): calls.append("read-close")
                def factory(group): return GraphitiBackend(group, lambda _: Graphiti(), ReadClient())
                modules = {"graphiti_core.nodes": types.SimpleNamespace(EpisodeType=types.SimpleNamespace(json="json"))}
                with patch("importlib.metadata.version", return_value="0.30.2"), patch.dict(sys.modules, modules), \
                        patch("deadline.monotonic", lambda: now[0]):
                    with self.assertRaises(TimeoutError):
                        await self.worker.run(self.current, factory)
                self.assertIn("close", calls)
                self.assertEqual(calls[-1], "read-close")
                self.assertFalse(self.worker.active)
                self.assertEqual([row[0] for row in self.ledger.db.execute("SELECT DISTINCT state FROM jobs")], ["quarantined"])
                if phase == "initialize": self.assertNotIn("add", calls)
                if phase == "add": self.assertNotIn("read", calls)
                with self.assertRaises(Refused):
                    await self.worker.run(self.current, lambda _: self.fail("Ambiguous job retried"))


if __name__ == "__main__":
    unittest.main()
