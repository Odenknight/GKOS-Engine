import asyncio
import copy
import json
import tempfile
import time
import types
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch
from aiohttp.test_utils import TestClient, TestServer
from query_http import QuerySession, create_query_app
from ledger import Ledger, digest


class QueryHttpTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.token = "x" * 64
        self.session = QuerySession(None, "host-job", lambda: {}, None, None)
        self.live = self.session
        self.client = TestClient(TestServer(create_query_app(lambda token: self.live if token == self.token else None, timeout=.1)))
        await self.client.start_server()
        self.headers = {"Authorization": "Bearer " + self.token}

    async def asyncTearDown(self):
        await self.client.close()

    async def test_authentication_precedes_dispatch_and_valid_request_uses_host_session(self):
        with patch("query_http.query_published", new_callable=AsyncMock, return_value=b'{"hits":[]}') as query:
            response = await self.client.post('/query', json={})
            self.assertEqual(response.status, 401)
            query.assert_not_awaited()
            response = await self.client.post('/query', headers=self.headers, json={"binding": "untrusted"})
            self.assertEqual(response.status, 200)
            self.assertEqual(query.call_args.args[:3], (None, "host-job", self.session.current))

    async def test_revocation_and_backend_diagnostics_do_not_escape(self):
        async def revoke(*args):
            self.live = None
            return b'{"private":"fact"}'
        with patch("query_http.query_published", side_effect=revoke):
            response = await self.client.post('/query', headers=self.headers, json={})
            self.assertEqual(response.status, 401)
            self.assertNotIn('fact', await response.text())
        self.live = self.session
        with patch("query_http.query_published", side_effect=RuntimeError('PRIVATE_DIAGNOSTIC')):
            response = await self.client.post('/query', headers=self.headers, json={})
            self.assertEqual(response.status, 503)
            self.assertNotIn('PRIVATE_DIAGNOSTIC', await response.text())

    async def test_body_bounds_and_stalled_query(self):
        with patch("query_http.query_published", new_callable=AsyncMock) as query:
            response = await self.client.post('/query', headers={**self.headers, 'Content-Type':'application/json'}, data=b'x' * 16385)
            self.assertEqual(response.status, 413)
            query.assert_not_awaited()
        async def stall(*args):
            await asyncio.Future()
        with patch("query_http.query_published", side_effect=stall):
            response = await self.client.post('/query', headers=self.headers, json={})
            self.assertEqual(response.status, 503)

    async def test_duplicate_keys_and_late_synchronous_success_are_rejected(self):
        with patch("query_http.query_published", new_callable=AsyncMock) as query:
            response = await self.client.post('/query', headers={**self.headers, 'Content-Type':'application/json'},
                                              data=b'{"binding":{"scope":1,"scope":2}}')
            self.assertEqual(response.status, 400)
            query.assert_not_awaited()
        async def late(*args):
            time.sleep(.12)
            return b'{"private":"late fact"}'
        with patch("query_http.query_published", side_effect=late):
            response = await self.client.post('/query', headers=self.headers, json={})
            self.assertEqual(response.status, 503)
            self.assertNotIn('late fact', await response.text())

    async def test_http_query_uses_real_published_ledger_and_rejects_forged_binding(self):
        with tempfile.TemporaryDirectory() as directory:
            ledger = Ledger(Path(directory).resolve(), create=True)
            try:
                manifest = [{"source_id":"note", "source_digest":digest("source"), "episode_digest":digest("episode")}]
                bound = {"corpus_id":"synthetic", "scope_digest":digest("scope"), "policy_digest":digest("policy"),
                         "configuration_digest":digest("config"), "source_snapshot_digest":digest(manifest)}
                job = ledger.enqueue(bound, manifest)
                lease = ledger.claim(job, bound)
                mapping = {"source_id":"note", "source_digest":digest("source"), "projection_episode_id":"episode"}
                ledger.observe(job, lease["token"], bound, [mapping], digest("receipt"))
                ledger.publish(job, bound)
                binding = ledger.read(job, bound)["binding"]
                driver = object()
                self.live = QuerySession(ledger, job, lambda: copy.deepcopy(bound), None, driver)
                body = {"contract_version":"gkos-graphiti-query/1.0.0-draft.1", "request_id":"real-ledger",
                        "binding":binding, "query":"relay", "limit":5}
                with patch('readonly_query._groups', {driver:binding['projection_id']}), \
                     patch('readonly_query.search_readonly', new_callable=AsyncMock) as search:
                    search.return_value = [types.SimpleNamespace(fact='synthetic relay', episodes=['episode'], group_id=binding['projection_id'])]
                    response = await self.client.post('/query', headers=self.headers, json=body)
                    self.assertEqual(response.status, 200)
                    self.assertEqual((await response.json())['hits'][0]['citations'], [mapping])
                    search.reset_mock()
                    body['binding'] = {**binding, 'scope_digest':digest('other scope')}
                    response = await self.client.post('/query', headers=self.headers, json=body)
                    self.assertEqual(response.status, 503)
                    search.assert_not_awaited()
            finally:
                ledger.close()
