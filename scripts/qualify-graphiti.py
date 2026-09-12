"""Bounded synthetic Graphiti smoke qualification; never reads a vault.

Run inside the existing KnightsAI hive container (its local model factory is
reused, but no hive worker/state is started). Uses a unique database and removes
only that database. Results qualify these fixtures, not production retrieval.
"""
import asyncio
import hashlib
import importlib.metadata
import json
import os
import time
from datetime import datetime, timezone
from uuid import uuid4

from graphiti_core.nodes import EpisodeType, EpisodicNode
from hive import make_graphiti, graph_client


async def main():
    version = importlib.metadata.version('graphiti-core')
    assert version == '0.30.2', version
    namespace = 'gkos_qualification_' + uuid4().hex
    episode_id = str(uuid4())
    body = json.dumps({'subject': 'Aster Observatory', 'predicate': 'operates',
                       'object': 'Cobalt Telescope', 'location': 'Lumen Island'})
    report = {
        'schema': 'gkos-graphiti-qualification/1', 'timestamp': datetime.now(timezone.utc).isoformat(),
        'graphiti_core': version, 'synthetic_only': True,
        'fixture_sha256': hashlib.sha256(body.encode()).hexdigest(),
        'model': os.environ.get('LLM_MODEL'), 'embedding_model': os.environ.get('EMBED_MODEL'),
        'budgets': {'ingest_timeout_s': 300, 'query_timeout_s': 30, 'query_runs': 5},
        'checks': {}, 'query_ms': [], 'production_qualified': False,
    }
    g = make_graphiti(namespace)
    try:
        await g.build_indices_and_constraints()
        started = time.perf_counter()
        result = await asyncio.wait_for(g.add_episode(
            name='Synthetic Aster Observatory', episode_body=body,
            source=EpisodeType.json, source_description='Synthetic qualification; non-authoritative',
            reference_time=datetime(2026, 9, 12, tzinfo=timezone.utc), group_id=namespace,
            custom_extraction_instructions='Extract only facts explicitly stated in the JSON.'), 300)
        report['ingestion_ms'] = round((time.perf_counter() - started) * 1000, 2)
        episode_id = result.episode.uuid
        report['identity_mapping'] = 'Graphiti-generated UUID retained after ingestion; canonical IDs remain separate'
        report['extracted'] = {'nodes': len(result.nodes), 'edges': len(result.edges)}
        persisted = await EpisodicNode.get_by_uuid(g.driver, episode_id)
        report['checks']['persistence'] = persisted.uuid == episode_id and persisted.content == body and persisted.group_id == namespace
        query = 'Which telescope does Aster Observatory operate?'
        observations = []
        for _ in range(5):
            started = time.perf_counter()
            hits = await asyncio.wait_for(g.search(query, group_ids=[namespace], num_results=10), 30)
            report['query_ms'].append(round((time.perf_counter() - started) * 1000, 2))
            observations.append(any(episode_id in hit.episodes and 'Cobalt' in hit.fact for hit in hits))
            assert all(hit.group_id == namespace for hit in hits), 'cross-group result'
        report['checks']['search_with_episode_provenance'] = all(observations)
        report['checks']['search_runs'] = observations
        # A different group must not retrieve this episode, even with identical query.
        other = namespace + '_empty'
        denied = await asyncio.wait_for(g.search(query, group_ids=[other], num_results=10), 30)
        report['checks']['other_group_empty'] = len(denied) == 0
        report['checks']['passed'] = report['checks']['persistence'] and all(observations) and not denied
    except Exception as exc:
        report['checks']['passed'] = False
        report['error'] = {'type': type(exc).__name__, 'message': str(exc)[:500]}
    finally:
        await g.close()
        client = graph_client()
        # Exact random names only. Never prefix-delete shared application graphs.
        for name in (namespace, namespace + '_empty'):
            if name in client.list_graphs():
                client.select_graph(name).delete()
        report['cleanup_verified'] = namespace not in client.list_graphs()
    print(json.dumps(report, indent=2), flush=True)
    return report['checks'].get('passed', False) and report['cleanup_verified']


if __name__ == '__main__':
    raise SystemExit(0 if asyncio.run(main()) else 1)
