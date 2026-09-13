"""Synthetic FalkorDB read-only recovery qualification; no extraction/model calls.

Supply RUNNER_SOURCE or its filename. Uses the existing hive's backend factory.
Only the two exact randomly named fixture graphs may be removed in cleanup.
"""
import asyncio
import contextlib
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
from uuid import uuid4
from hive import graph_client, HOST

if 'RUNNER_SOURCE' not in globals():
    RUNNER_SOURCE = Path(sys.argv[1]).read_text()
namespace = {'__name__': 'qualified_reconciliation'}
exec(compile(RUNNER_SOURCE, 'graphiti-runner.py', 'exec'), namespace)

def forbidden_graphiti(**kwargs):
    raise AssertionError('reconciliation invoked Graphiti/model initialization')

namespace['Graphiti'] = forbidden_graphiti
os.environ['FALKORDB_HOST'] = HOST
os.environ['GRAPHITI_DB'] = 'falkordb'
client = graph_client()
group, missing = ('gkos_' + uuid4().hex for _ in range(2))
episode_id = str(uuid4())
body = json.dumps({'fact': 'Synthetic relay is in the test chamber.'})
episode = dict(uuid=str(uuid4()), name='Recovery fixture', episode_body=body,
               source='json', source_description='synthetic qualification',
               reference_time='2026-09-13T00:00:00Z', group_id='synthetic-recovery')
raw = json.dumps([episode]).encode()
checks = {}
try:
    graph = client.select_graph(group)
    graph.query('CREATE (:Episodic {uuid: $uuid, content: $body, group_id: $group})',
                params={'uuid': episode_id, 'body': body, 'group': group})
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / 'episodes.json'
        path.write_bytes(raw)
        receipt_path = path.with_name('graphiti-ingestion-report.json')
        receipt = {'schema': 'gkos-graphiti-run/1', 'graphiti_core': '0.30.2',
                   'manifest_sha256': hashlib.sha256(raw).hexdigest(),
                   'source_group': episode['group_id'], 'projection_group': group,
                   'state': 'failed-needs-reconciliation', 'episodes_completed': 0,
                   'episodes': [{'canonical_uuid': episode['uuid'], 'projection_uuid': episode_id,
                                 'episode_body_sha256': hashlib.sha256(body.encode()).hexdigest(),
                                 'state': 'ingestion-returned'}]}

        def observe():
            receipt_path.write_text(json.dumps(receipt))
            before = receipt_path.read_bytes()
            with contextlib.redirect_stdout(io.StringIO()):
                result = asyncio.run(namespace['main'](path, reconcile=True))
            assert receipt_path.read_bytes() == before
            assert not result['retry_allowed'] and not result['generation_published']
            assert result['searchability'] == 'unverified'
            return result

        checks['returned_mapping_observed'] = observe()['state'] == 'persistence-observed'
        graph.query('MATCH (e:Episodic {uuid:$uuid}) SET e.content=$body',
                    params={'uuid': episode_id, 'body': 'changed synthetic content'})
        checks['mismatch_refused'] = observe()['state'] == 'requires-operator-reconciliation'
        receipt['projection_group'] = missing
        checks['missing_graph_refused'] = observe()['state'] == 'requires-operator-reconciliation'
        checks['readonly_did_not_create_missing_graph'] = missing not in client.list_graphs()
        receipt['episodes'][0].update(projection_uuid=None, state='in-flight')
        checks['ambiguous_write_not_retried'] = observe()['episodes'][0]['state'] == 'ambiguous-write'
        checks['original_receipt_unchanged'] = True
        checks['no_graphiti_or_model_initialization'] = True
        checks['separate_observation_receipts'] = len(list(path.parent.glob('graphiti-reconciliation-*.json'))) == 4
    assert all(checks.values()), checks
finally:
    for name in (group, missing):
        assert name.startswith('gkos_') and len(name) == 37
        if name in client.list_graphs():
            client.select_graph(name).delete()
    checks['exact_fixture_cleanup'] = all(name not in client.list_graphs() for name in (group, missing))

assert all(checks.values())
print(json.dumps({'schema': 'gkos-graphiti-reconciliation-qualification/1',
                  'recorded_at': datetime.now(timezone.utc).isoformat(), 'graphiti_core': '0.30.2',
                  'runner_sha256': hashlib.sha256(RUNNER_SOURCE.encode()).hexdigest(),
                  'synthetic_only': True, 'checks': checks, 'production_qualified': False}, indent=2))
