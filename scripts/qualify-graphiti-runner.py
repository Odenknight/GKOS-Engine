"""Execute the exported runner with existing local models and a synthetic export.

Caller supplies RUNNER_SOURCE and EPISODES globals (or two file arguments).
The injected client factory changes model configuration only; runner validation,
receipt locking, Graphiti calls, and readback execute without replacement.
"""
import asyncio
import json
import os
from pathlib import Path
import sys
import tempfile
from hive import make_graphiti, graph_client, HOST

os.environ['FALKORDB_HOST'] = HOST

if 'RUNNER_SOURCE' not in globals():
    RUNNER_SOURCE = Path(sys.argv[1]).read_text()
    EPISODES = json.loads(Path(sys.argv[2]).read_text())
namespace = {'__name__': 'qualified_runner'}
exec(compile(RUNNER_SOURCE, 'graphiti-ingest-generated.py', 'exec'), namespace)
clients = []


def local_client(graph_driver):
    # Same database as the runner selected; the hive factory only provides its
    # existing local extraction/embedding/reranking configuration.
    database = graph_driver._database
    clients.append(database)
    return make_graphiti(database)


namespace['Graphiti'] = local_client
receipt = None
try:
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / 'episodes.json'
        path.write_text(json.dumps(EPISODES), encoding='utf-8')
        asyncio.run(namespace['main'](path))
        receipt = json.loads(path.with_name('graphiti-ingestion-report.json').read_text())
        assert receipt['state'] == 'persistence-verified'
        assert receipt['episodes_completed'] == len(EPISODES)
        for changed in (False, True):
            if changed:
                EPISODES[0]['episode_body'] = '{"changed": true}'
                path.write_text(json.dumps(EPISODES))
            try:
                asyncio.run(namespace['main'](path))
                raise AssertionError('duplicate/changed retry was not refused')
            except FileExistsError:
                pass
        assert len(clients) == 1, 'retry reached backend'
        receipt['retry_refusal_verified'] = True
finally:
    client = graph_client()
    for database in clients:
        assert database.startswith('gkos_') and len(database) == 37
        if database in client.list_graphs():
            client.select_graph(database).delete()
    if receipt:
        receipt['cleanup_verified'] = all(database not in client.list_graphs() for database in clients)
        print(json.dumps(receipt, indent=2))
