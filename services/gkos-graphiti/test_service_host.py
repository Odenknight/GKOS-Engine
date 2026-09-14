import json
import asyncio
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from aiohttp.test_utils import TestClient, TestServer
from ledger import Ledger, digest, Refused
from service_host import PublishedServiceHost


class ServiceHostTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name).resolve()
        state = self.root / 'ledger'
        state.mkdir()
        self.ledger = Ledger(state, create=True)
        manifest = [dict(source_id='synthetic', source_digest=digest('source'), episode_digest=digest('episode'))]
        self.binding = dict(corpus_id='synthetic', scope_digest=digest('scope'), policy_digest=digest('policy'),
                            configuration_digest=digest('configuration'), source_snapshot_digest=digest(manifest))
        job = self.ledger.enqueue(self.binding, manifest)
        lease = self.ledger.claim(job, self.binding)
        self.ledger.observe(job, lease['token'], self.binding,
                            [dict(source_id='synthetic', source_digest=digest('source'), projection_episode_id='episode')], digest('receipt'))
        self.ledger.publish(job, self.binding)
        self.token = 'x' * 64
        self.token_path = self.root / 'token'
        self.token_path.write_text(self.token)
        self.profile_path = self.root / 'profile.json'
        self.profile = dict(ledger_directory=str(state), job=job, binding=self.binding, token_file=str(self.token_path),
                            factory_module='synthetic_factory', port=8195)
        self.profile_path.write_text(json.dumps(self.profile))
        self.host = PublishedServiceHost(self.profile_path)
        self.host.session = object()

    def tearDown(self):
        self.host.ledger.close()
        self.ledger.close()
        self.directory.cleanup()

    def test_host_selects_one_published_session_and_does_not_accept_other_tokens(self):
        self.assertIs(self.host.resolve(self.token), self.host.session)
        self.assertIsNone(self.host.resolve('y' * 64))
        self.assertIsNone(self.host.resolve('非ascii'))
        self.assertEqual(self.host.current(), self.binding)

    def test_token_rotation_invalidates_inflight_session_and_cannot_restore_it(self):
        self.token_path.write_text('y' * 64)
        self.assertIsNone(self.host.resolve(self.token))
        with self.assertRaises(Refused):
            self.host.current()
        self.token_path.write_text(self.token)
        self.assertIsNone(self.host.resolve(self.token))

    def test_profile_change_or_ledger_revocation_invalidates_authority(self):
        self.profile_path.write_text(json.dumps({**self.profile, 'port':8196}))
        self.assertIsNone(self.host.resolve(self.token))
        self.host.ledger.close()
        self.profile_path.write_text(json.dumps(self.profile))
        self.host = PublishedServiceHost(self.profile_path)
        self.host.session = object()
        self.ledger.revoke('synthetic')
        self.assertIsNone(self.host.resolve(self.token))

    def test_missing_token_and_changed_configuration_fail_closed(self):
        self.host.configuration = lambda: digest('changed')
        self.assertIsNone(self.host.resolve(self.token))
        self.token_path.unlink()
        with self.assertRaises(Refused):
            self.host.current()

    def test_application_closes_reader_and_rechecks_configuration_on_http_requests(self):
        async def run():
            graphiti = SimpleNamespace(close=AsyncMock())
            configuration = self.binding['configuration_digest']
            factory = SimpleNamespace(configuration_digest=lambda: configuration,
                                      open_readonly=lambda group: (graphiti, object()))
            with patch.dict('sys.modules', {'synthetic_factory': factory}), \
                    patch('query_http.query_published', new_callable=AsyncMock, return_value=b'{}') as query:
                client = TestClient(TestServer(await self.host.application()))
                await client.start_server()
                try:
                    headers = {'Authorization': 'Bearer ' + self.token}
                    response = await client.post('/query', headers=headers, json={})
                    self.assertEqual(response.status, 200)
                    configuration = digest('changed-runtime')
                    response = await client.post('/query', headers=headers, json={})
                    self.assertEqual(response.status, 401)
                    self.assertEqual(query.await_count, 1)
                finally:
                    await client.close()
                graphiti.close.assert_awaited_once()
        asyncio.run(run())


if __name__ == '__main__':
    unittest.main()
