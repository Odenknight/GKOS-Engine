"""Explicit synthetic qualification of an Engine-generated service manifest.

Host selects the local model factory and isolated database socket. Never supply
vault input. Exact ledger-generated groups are removed after the writer stops.
"""
import argparse
import asyncio
import importlib
import json
import tempfile
from types import SimpleNamespace
from pathlib import Path
from redis.asyncio import Redis
from falkordb.asyncio.graph import AsyncGraph
from graphiti_core import Graphiti
from backend import GraphitiBackend
from ledger import Ledger
from worker import Worker
from readonly_query import create_readonly_driver, search_readonly, query_published


async def qualify(payload, factory, socket):
    bound, manifest, episodes = payload['binding'], payload['manifest'], payload['episodes']
    if bound['corpus_id'] != 'synthetic-service-host-qualification':
        raise ValueError('synthetic-corpus-required')
    groups, writers = [], []
    report = {'synthetic_only': True, 'production_qualified': False, 'checks': {}}
    def client():
        connection = Redis(unix_socket_path=socket, decode_responses=True, socket_timeout=30, socket_connect_timeout=10)
        return SimpleNamespace(select_graph=lambda name: AsyncGraph(connection, name), aclose=connection.aclose)
    def backend(group):
        groups.append(group)
        value = GraphitiBackend(group, factory, client())
        writers.append(value.graphiti)
        return value
    reader = None
    writer_finished = False
    with tempfile.TemporaryDirectory(prefix='gkos-service-ledger-') as directory:
        ledger = Ledger(Path(directory).resolve(), create=True)
        try:
            result = await Worker(ledger).run(lambda: (bound, manifest, episodes), backend)
            writer_finished = True
            report['checks']['observed_before_publish'] = ledger.status(result['job'])['state'] == 'observed'
            prior = writers[0]
            driver = create_readonly_driver(groups[0], client())
            reader = Graphiti(graph_driver=driver, llm_client=prior.llm_client, embedder=prior.embedder,
                              cross_encoder=prior.cross_encoder, max_coroutines=2)
            query = 'Where is the synthetic relay?'
            hits = await search_readonly(reader, driver, query, 5)
            report['checks']['search_gate_before_publish'] = bool(hits) and all(hit.group_id == groups[0] for hit in hits)
            if not report['checks']['search_gate_before_publish']:
                raise ValueError('search-gate-failed')
            ledger.publish(result['job'], bound)
            publication = ledger.read(result['job'], bound)
            request = {'contract_version': 'gkos-graphiti-query/1.0.0-draft.1', 'request_id': 'service-host-live',
                       'binding': publication['binding'], 'query': query, 'limit': 5}
            responses = []
            for _ in range(5):
                response = json.loads(await query_published(ledger, result['job'], lambda: bound, reader, driver, request))
                if not response['hits']:
                    raise ValueError('empty-published-query')
                responses.append(response)
            report['checks']['five_published_queries_with_citations'] = True
            report.update(publication=publication, request=request, response=responses[-1])
            ledger.revoke(bound['corpus_id'])
            try:
                await query_published(ledger, result['job'], lambda: bound, reader, driver, request)
            except ValueError:
                report['checks']['revoked_query_denied'] = True
        except Exception as error:
            report['error_type'] = type(error).__name__
        finally:
            if reader:
                try:
                    await reader.close()
                except Exception as error:
                    report['error_type'] = type(error).__name__
            ledger.close()
            cleanup = Redis(unix_socket_path=socket, decode_responses=True, socket_timeout=30)
            try:
                existing = await cleanup.execute_command('GRAPH.LIST')
                for group in groups:
                    if writer_finished and group in existing:
                        await cleanup.execute_command('GRAPH.DELETE', group)
                remaining = await cleanup.execute_command('GRAPH.LIST')
                report['cleanup_verified'] = all(group not in remaining for group in groups)
                if not writer_finished and groups:
                    report['cleanup_deferred_writer_unconfirmed'] = True
            finally:
                await cleanup.aclose()
    report['passed'] = len(report['checks']) == 4 and all(report['checks'].values()) and report.get('cleanup_verified', False) and 'error_type' not in report
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--factory-module', required=True)
    parser.add_argument('--socket', required=True)
    args = parser.parse_args()
    factory = importlib.import_module(args.factory_module).make_graphiti
    result = asyncio.run(qualify(json.loads(Path(args.input).read_text()), factory, args.socket))
    print(json.dumps(result), flush=True)
    raise SystemExit(0 if result['passed'] else 1)
