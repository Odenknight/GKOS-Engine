import copy
import asyncio
import json
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch
from ledger import Ledger, Refused, digest
from readonly_query import query_published


class PublishedQueryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.ledger = Ledger(Path(self.temp.name).resolve(), create=True)
        manifest = [{"source_id": "note", "source_digest": digest("source"), "episode_digest": digest("episode")}]
        self.bound = {"corpus_id": "fixture", "scope_digest": digest("scope"), "policy_digest": digest("policy"),
                      "configuration_digest": digest("config"), "source_snapshot_digest": digest(manifest)}
        self.mapping = {"source_id": "note", "source_digest": digest("source"), "projection_episode_id": "episode"}
        self.job = self.ledger.enqueue(self.bound, manifest)
        lease = self.ledger.claim(self.job, self.bound)
        self.ledger.observe(self.job, lease["token"], self.bound, [self.mapping], digest("receipt"))
        self.ledger.publish(self.job, self.bound)
        self.group = self.ledger.status(self.job)["projection_id"]
        self.request = {"contract_version": "gkos-graphiti-query/1.0.0-draft.1", "request_id": "request",
                        "binding": self.ledger.read(self.job, self.bound)["binding"], "query": "relay", "limit": 5}
        self.driver = object()
        self.groups = patch("readonly_query._groups", {self.driver: self.group})
        self.groups.start()
        self.search_patch = patch("readonly_query.search_readonly", new_callable=AsyncMock)
        self.search = self.search_patch.start()
        self.search.return_value = [types.SimpleNamespace(fact="The relay is in the chamber.", episodes=["episode"], group_id=self.group)]

    async def asyncTearDown(self):
        self.search_patch.stop()
        self.groups.stop()
        self.ledger.close()
        self.temp.cleanup()

    async def query(self):
        return await query_published(self.ledger, self.job, lambda: copy.deepcopy(self.bound), None, self.driver, self.request)

    async def test_result_binds_exact_source_mapping_and_original_request(self):
        async def search(*args):
            self.request["request_id"] = "changed-during-await"
            return [types.SimpleNamespace(fact="The relay is in the chamber.", episodes=["episode"], group_id=self.group)]
        self.search.side_effect = search
        body = await self.query()
        result = json.loads(body)
        self.assertLessEqual(len(body), 128 * 1024)
        self.assertEqual(result, {"contract_version": self.request["contract_version"], "request_id": "request",
                                 "binding": self.request["binding"], "hits": [{"fact": "The relay is in the chamber.",
                                 "semantic_support": "unverified", "citations": [self.mapping]}]})

    async def test_revoked_generation_never_reaches_backend(self):
        self.ledger.revoke("fixture")
        with self.assertRaisesRegex(Refused, "unavailable"):
            await self.query()
        self.search.assert_not_awaited()

    async def test_policy_change_during_provider_call_denies_result(self):
        async def search(*args):
            self.bound["policy_digest"] = digest("new policy")
            return []
        self.search.side_effect = search
        with self.assertRaisesRegex(Refused, "authorization-stale"):
            await self.query()

    async def test_revocation_during_result_conversion_denies_result(self):
        owner = self
        class Edge:
            fact = "fixture"
            group_id = self.group
            @property
            def episodes(self):
                owner.ledger.revoke("fixture")
                return ["episode"]
        self.search.return_value = [Edge()]
        with self.assertRaisesRegex(Refused, "unavailable"):
            await self.query()

    async def test_forged_binding_and_malformed_request_refuse_before_backend(self):
        for field, value in (("binding", {}), ("limit", True), ("query", "a\n"), ("request_id", ""), ("extra", 1)):
            original = copy.deepcopy(self.request)
            self.request[field] = value
            with self.assertRaises(Refused):
                await self.query()
            self.request = original
        self.search.assert_not_awaited()

    async def test_invalid_or_unmapped_provider_results_are_not_partially_returned(self):
        valid = self.search.return_value[0]
        for changes in ({"episodes": []}, {"episodes": ["unknown"]}, {"episodes": ["episode", "episode"]},
                        {"group_id": "other"}, {"fact": "a\n"}, {"fact": "a" * 4097}):
            self.search.return_value = [valid, types.SimpleNamespace(**{**vars(valid), **changes})]
            with self.assertRaisesRegex(Refused, "query-result-invalid"):
                await self.query()
        self.search.return_value = [None]
        with self.assertRaisesRegex(Refused, "query-result-invalid"):
            await self.query()

    async def test_encoded_response_budget_and_backend_error_redaction(self):
        self.request["limit"] = 50
        self.search.return_value = [types.SimpleNamespace(fact="a" * 4096, episodes=["episode"], group_id=self.group)] * 50
        with self.assertRaisesRegex(Refused, "query-response-too-large"):
            await self.query()
        self.search.side_effect = RuntimeError("private query canary")
        with self.assertRaisesRegex(Refused, "^query-backend-unavailable$"):
            await self.query()

    async def test_outage_preserves_published_generation_and_explicit_retry(self):
        before = self.ledger.read(self.job, self.bound)
        for error in (ConnectionError("private endpoint"), TimeoutError("private query")):
            self.search.side_effect = error
            with self.assertRaisesRegex(Refused, "^query-backend-unavailable$"):
                await self.query()
            self.assertEqual(self.ledger.read(self.job, self.bound), before)
        self.assertEqual(self.search.await_count, 2)  # No automatic retries.
        self.search.side_effect = None
        self.assertEqual(len(json.loads(await self.query())["hits"]), 1)

    async def test_cancellation_returns_no_response_and_preserves_ledger(self):
        before = self.ledger.read(self.job, self.bound)
        self.search.side_effect = asyncio.CancelledError()
        with self.assertRaises(asyncio.CancelledError):
            await self.query()
        self.assertEqual(self.ledger.read(self.job, self.bound), before)
