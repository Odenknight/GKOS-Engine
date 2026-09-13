import asyncio
import types
import unittest
from unittest.mock import patch
from backend import GraphitiBackend, validate_episode
from ledger import Refused


class BackendTests(unittest.IsolatedAsyncioTestCase):
    async def test_readback_uses_only_bounded_readonly_api_and_closes_both_clients(self):
        group = "gkos_" + "a" * 32
        calls = []
        class Graph:
            async def ro_query(self, query, **kwargs):
                calls.append((query, kwargs))
                return types.SimpleNamespace(result_set=[[True, True]])
        class ReadClient:
            def select_graph(self, name):
                self.assert_group = name
                return Graph()
            async def aclose(self): calls.append("read-close")
        class Graphiti:
            async def close(self): calls.append("graphiti-close")
        read = ReadClient()
        with patch('importlib.metadata.version', return_value='0.30.2'):
            backend = GraphitiBackend(group, lambda _: Graphiti(), read)
        self.assertTrue(await backend.matches("id", {"episode_body": "{}"}))
        self.assertEqual(read.assert_group, group)
        query, options = calls[0]
        self.assertTrue(query.endswith("LIMIT 2"))
        self.assertEqual(options["params"], {"uuid": "id", "body": "{}", "group": group})
        self.assertEqual(options["timeout"], 30000)
        await backend.close()
        self.assertEqual(calls[-2:], ["graphiti-close", "read-close"])

    async def test_unsupported_version_refuses_before_factory(self):
        called = []
        with patch('importlib.metadata.version', return_value='0.29.0'):
            with self.assertRaisesRegex(Refused, 'unsupported'):
                GraphitiBackend('gkos_' + 'a' * 32, lambda group: called.append(group), None)
        self.assertEqual(called, [])

    async def test_episode_requires_json_and_explicit_timezone(self):
        episode = dict(name='test', episode_body='{}', source_description='synthetic', reference_time='2026-09-13T00:00:00Z')
        validate_episode(episode)
        with self.assertRaises(ValueError):
            validate_episode({**episode, 'episode_body': '{invalid'})
        with self.assertRaisesRegex(Refused, 'timezone'):
            validate_episode({**episode, 'reference_time': '2026-09-13T00:00:00'})
        with self.assertRaises(Refused):
            validate_episode({**episode, 'uuid': 'cannot-overwrite-existing'})
