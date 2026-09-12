"""Standard-library tests of the generated runner; pass its .py path as argv[1]."""
import asyncio
import importlib.metadata
import json
from pathlib import Path
import sys
import tempfile
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch

SCRIPT = Path(sys.argv.pop(1)).read_text(encoding='utf-8')


class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / 'episodes.json'
        self.calls = []
        self.nodes = {}
        self.fail = False
        self.mismatch = False
        owner = self

        class Graphiti:
            def __init__(self, graph_driver):
                self.driver = graph_driver
            async def build_indices_and_constraints(self):
                pass
            async def add_episode(self, **kwargs):
                owner.calls.append(kwargs)
                if owner.fail:
                    raise TimeoutError('ambiguous ingestion')
                assert 'uuid' not in kwargs, 'new-UUID lookup regression'
                uid = 'derived-' + str(len(owner.calls))
                owner.nodes[uid] = SimpleNamespace(uuid=uid, content=kwargs['episode_body'], group_id=kwargs['group_id'])
                return SimpleNamespace(episode=owner.nodes[uid])
            async def close(self):
                pass

        class EpisodicNode:
            @staticmethod
            async def get_by_uuid(driver, uid):
                node = owner.nodes[uid]
                if owner.mismatch:
                    node.content = 'wrong content'
                return node

        core = ModuleType('graphiti_core'); core.Graphiti = Graphiti
        nodes = ModuleType('graphiti_core.nodes')
        nodes.EpisodeType = SimpleNamespace(json='json'); nodes.EpisodicNode = EpisodicNode
        driver = ModuleType('graphiti_core.driver.falkordb_driver')
        driver.FalkorDriver = lambda **kwargs: SimpleNamespace(**kwargs)
        self.module_patch = patch.dict(sys.modules, {'graphiti_core': core, 'graphiti_core.nodes': nodes,
            'graphiti_core.driver.falkordb_driver': driver})
        self.module_patch.start(); self.addCleanup(self.module_patch.stop)
        self.version_patch = patch.object(importlib.metadata, 'version', return_value='0.30.2')
        self.version_patch.start(); self.addCleanup(self.version_patch.stop)
        self.runner = {'__name__': 'tested_runner'}
        exec(compile(SCRIPT, 'generated-graphiti-ingest.py', 'exec'), self.runner)
        self.episodes = [dict(uuid='canonical-1', name='Synthetic', episode_body='{"fact":"A operates B"}',
            source='json', source_description='synthetic', reference_time='2026-09-12T00:00:00Z', group_id='authorized')]

    def run_runner(self):
        self.path.write_text(json.dumps(self.episodes), encoding='utf-8')
        asyncio.run(self.runner['main'](self.path))

    def receipt(self):
        return json.loads(self.path.with_name('graphiti-ingestion-report.json').read_text())

    def test_mapping_readback_and_duplicate_run_refusal(self):
        self.run_runner()
        r = self.receipt()
        self.assertEqual(r['state'], 'persistence-verified')
        self.assertEqual(r['episodes'][0]['canonical_uuid'], 'canonical-1')
        self.assertEqual(r['episodes'][0]['projection_uuid'], 'derived-1')
        self.assertFalse(r['accepted_is_searchable'])
        self.assertEqual(r['searchability'], 'unverified')
        self.assertNotEqual(r['projection_group'], 'authorized')
        with self.assertRaises(FileExistsError): self.run_runner()
        self.assertEqual(len(self.calls), 1)

    def test_triplets_use_structured_extraction(self):
        self.episodes[0]['source'] = 'fact_triple'
        self.run_runner()
        self.assertEqual(self.calls[0]['source'], 'json')

    def test_mixed_corpora_rejected_before_model(self):
        self.episodes.append({**self.episodes[0], 'uuid': 'canonical-2', 'group_id': 'other'})
        with self.assertRaises(ValueError): self.run_runner()
        self.assertFalse(self.calls)

    def test_unknown_version_rejected(self):
        with patch.object(importlib.metadata, 'version', return_value='0.29.0'):
            with self.assertRaises(RuntimeError): self.run_runner()
        self.assertFalse(self.calls)

    def test_oversized_manifest_rejected_before_parsing_or_backend(self):
        self.path.write_bytes(b' ' * (64 * 1024 * 1024 + 1))
        with self.assertRaisesRegex(ValueError, '64 MiB'):
            asyncio.run(self.runner['main'](self.path))
        self.assertFalse(self.calls)

    def test_ambiguous_failure_retains_inflight_and_refuses_retry(self):
        self.fail = True
        with self.assertRaises(TimeoutError): self.run_runner()
        r = self.receipt()
        self.assertEqual(r['state'], 'failed-needs-reconciliation')
        self.assertEqual(r['episodes'][0]['state'], 'in-flight')
        with self.assertRaises(FileExistsError): self.run_runner()
        self.assertEqual(len(self.calls), 1)

    def test_bad_readback_cannot_claim_persistence(self):
        self.mismatch = True
        with self.assertRaises(RuntimeError): self.run_runner()
        r = self.receipt()
        self.assertEqual(r['state'], 'failed-needs-reconciliation')
        self.assertEqual(r['episodes'][0]['state'], 'ingestion-returned')
        self.assertEqual(r['episodes_completed'], 0)


if __name__ == '__main__':
    unittest.main()
