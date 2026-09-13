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
        self.reads = []
        self.read_rows = [[True, True]]
        self.read_error = None
        self.on_read = None
        self.on_close = None
        self.reconciliation_clients = 0
        self.index_calls = 0
        owner = self

        class Graphiti:
            def __init__(self, graph_driver):
                self.driver = graph_driver
            async def build_indices_and_constraints(self):
                owner.index_calls += 1
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
        class FalkorDB:
            def __init__(self, **kwargs):
                owner.reconciliation_clients += 1
            def select_graph(self, group):
                owner.selected_group = group
                return self
            async def ro_query(self, query, params, timeout):
                owner.reads.append((query, params, timeout))
                if owner.on_read: owner.on_read()
                if owner.read_error: raise owner.read_error
                return SimpleNamespace(result_set=owner.read_rows)
            async def aclose(self):
                if owner.on_close: owner.on_close()
        falkor = ModuleType('falkordb.asyncio'); falkor.FalkorDB = FalkorDB
        self.module_patch = patch.dict(sys.modules, {'graphiti_core': core, 'graphiti_core.nodes': nodes,
            'graphiti_core.driver.falkordb_driver': driver, 'falkordb.asyncio': falkor})
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

    def reconcile(self):
        return asyncio.run(self.runner['main'](self.path, reconcile=True))

    def update_receipt(self, change):
        value = self.receipt(); change(value)
        self.path.with_name('graphiti-ingestion-report.json').write_text(json.dumps(value))

    def test_reconcile_observes_readonly_without_rewriting_or_retrying(self):
        self.run_runner()
        original = self.path.with_name('graphiti-ingestion-report.json').read_bytes()
        result = self.reconcile()
        self.assertEqual(result['state'], 'persistence-observed')
        self.assertEqual(self.path.with_name('graphiti-ingestion-report.json').read_bytes(), original)
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.index_calls, 1)
        self.assertEqual(len(self.reads), 1)
        query, params, timeout = self.reads[0]
        self.assertIn('LIMIT 2', query)
        self.assertNotIn(self.episodes[0]['episode_body'], query)
        self.assertEqual(params['body'], self.episodes[0]['episode_body'])
        self.assertEqual(timeout, 30000)
        self.assertFalse(result['retry_allowed'])
        self.assertFalse(result['generation_published'])
        self.assertEqual(result['searchability'], 'unverified')
        self.reconcile()
        self.assertEqual(len(list(self.path.parent.glob('graphiti-reconciliation-*.json'))), 2)
        with self.assertRaises(FileExistsError): self.run_runner()

    def test_reconcile_ambiguous_and_unattempted_episodes_never_reach_backend(self):
        self.fail = True
        self.episodes.append({**self.episodes[0], 'uuid': 'canonical-2'})
        with self.assertRaises(TimeoutError): self.run_runner()
        result = self.reconcile()
        self.assertEqual(result['state'], 'requires-operator-reconciliation')
        self.assertEqual(result['episodes'][0]['state'], 'ambiguous-write')
        self.assertEqual(result['unattempted_episodes'], 1)
        self.assertEqual(self.reconciliation_clients, 0)
        self.assertFalse(self.reads)

    def test_reconcile_rejects_receipt_tampering_before_backend(self):
        self.run_runner()
        good = self.receipt()
        changes = [
            lambda r: r.update(schema='other'), lambda r: r.update(graphiti_core='0.29.0'),
            lambda r: r.update(manifest_sha256='0' * 64), lambda r: r.update(source_group='other'),
            lambda r: r.update(projection_group='production'), lambda r: r.update(episodes_completed=True),
            lambda r: r['episodes'][0].update(canonical_uuid='other'),
            lambda r: r['episodes'][0].update(episode_body_sha256='0' * 64),
            lambda r: r['episodes'][0].update(projection_uuid=None),
            lambda r: r['episodes'][0].update(state='unknown'),
        ]
        for change in changes:
            self.path.with_name('graphiti-ingestion-report.json').write_text(json.dumps(good))
            self.update_receipt(change)
            with self.assertRaises(ValueError): self.reconcile()
        self.assertEqual(self.reconciliation_clients, 0)
        self.assertFalse(list(self.path.parent.glob('graphiti-reconciliation-*.json')))

    def test_reconcile_changed_export_or_unsupported_backend_refused(self):
        self.run_runner()
        self.path.write_text(json.dumps([{**self.episodes[0], 'name': 'changed'}]))
        with self.assertRaises(ValueError): self.reconcile()
        self.path.write_text(json.dumps(self.episodes))
        with patch.dict('os.environ', {'GRAPHITI_DB': 'neo4j'}):
            with self.assertRaises(ValueError): self.reconcile()
        self.assertEqual(self.reconciliation_clients, 0)

    def test_reconcile_missing_duplicate_or_mismatched_rows_do_not_publish(self):
        self.run_runner()
        for rows in ([], [[False, True]], [[True, False]], [[True, True], [True, True]]):
            self.read_rows = rows
            result = self.reconcile()
            self.assertEqual(result['state'], 'requires-operator-reconciliation')
            self.assertFalse(result['retry_allowed'])
            self.assertFalse(result['generation_published'])

    def test_reconcile_transport_failure_is_sanitized_and_preserves_source(self):
        self.run_runner()
        before = self.path.with_name('graphiti-ingestion-report.json').read_bytes()
        self.read_error = TimeoutError('private backend diagnostic')
        result = self.reconcile()
        self.assertEqual(result['state'], 'requires-operator-reconciliation')
        self.assertEqual(result['error_type'], 'TimeoutError')
        self.assertNotIn('private backend diagnostic', json.dumps(result))
        self.assertEqual(self.path.with_name('graphiti-ingestion-report.json').read_bytes(), before)

    def test_reconcile_source_mutation_during_read_or_close_invalidates_observation(self):
        self.run_runner()
        original = self.path.read_bytes()
        for hook in ('on_read', 'on_close'):
            self.path.write_bytes(original)
            setattr(self, hook, lambda: self.path.write_text('[]'))
            result = self.reconcile()
            self.assertEqual(result['state'], 'requires-operator-reconciliation')
            self.assertEqual(result['error_type'], 'SourceChanged')
            setattr(self, hook, None)

    def test_reconcile_returned_mapping_can_be_observed_without_promoting_original(self):
        self.run_runner()
        self.update_receipt(lambda r: (r.update(state='failed-needs-reconciliation', episodes_completed=0),
            r['episodes'][0].update(state='ingestion-returned')))
        result = self.reconcile()
        self.assertEqual(result['state'], 'persistence-observed')
        self.assertEqual(self.receipt()['state'], 'failed-needs-reconciliation')

    def test_reconcile_receipt_mutation_and_close_failure_do_not_claim_complete(self):
        self.run_runner()
        original = self.path.with_name('graphiti-ingestion-report.json').read_bytes()
        self.on_close = lambda: self.update_receipt(lambda r: r.update(state='failed-needs-reconciliation'))
        self.assertEqual(self.reconcile()['error_type'], 'SourceChanged')
        self.path.with_name('graphiti-ingestion-report.json').write_bytes(original)
        def fail_close(): raise OSError('private close diagnostic')
        self.on_close = fail_close
        result = self.reconcile()
        self.assertEqual(result['state'], 'requires-operator-reconciliation')
        self.assertEqual(result['error_type'], 'OSError')
        self.assertNotIn('private close diagnostic', json.dumps(result))

    def test_report_replacement_does_not_truncate_an_old_temporary_file(self):
        old = self.path.with_name('graphiti-ingestion-report.tmp')
        old.write_text('preserve abandoned evidence')
        self.run_runner()
        self.assertEqual(old.read_text(), 'preserve abandoned evidence')


if __name__ == '__main__':
    unittest.main()
