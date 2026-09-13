"""Run only inside the existing Hive lab with a synthetic corpus; delete exact fixture groups."""
import asyncio
import hashlib
import importlib.metadata
import json
import platform
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from falkordb.asyncio import FalkorDB
from hive import make_graphiti, graph_client, HOST
from backend import GraphitiBackend
from ledger import Ledger, Refused, digest
from worker import Worker, purge_job


async def main(*, probe_readonly_search=False):
    checks = {}
    error_type = None
    groups = []
    instances = []
    contract_fixture = None
    client = graph_client()
    versions = {name: importlib.metadata.version(name) for name in ("graphiti-core", "falkordb", "redis")}
    episodes = [{"name": "GKOS managed synthetic relay", "episode_body": '{"fact":"The synthetic relay is in the test chamber."}',
                 "source_description": "isolated synthetic qualification", "reference_time": "2026-09-13T00:00:00Z"}]
    manifest = [{"source_id": "synthetic-relay", "source_digest": digest("synthetic source bytes"), "episode_digest": digest(episodes[0])}]
    bound = {"corpus_id": "synthetic-managed-fixture", "scope_digest": digest("synthetic-scope"),
             "policy_digest": digest("synthetic-policy"), "configuration_digest": digest(versions),
             "source_snapshot_digest": digest(manifest)}
    with tempfile.TemporaryDirectory() as directory:
        ledger = Ledger(Path(directory).resolve(), create=True)
        worker = Worker(ledger)
        def backend(group):
            groups.append(group)
            instance = GraphitiBackend(group, make_graphiti, FalkorDB(host=HOST, socket_timeout=30, socket_connect_timeout=10))
            instances.append(instance.graphiti)
            return instance
        try:
            result = await worker.run(lambda: (bound, manifest, episodes), backend)
            job = result["job"]
            checks["actual_ingestion_and_readonly_readback"] = ledger.status(job)["state"] == "observed"
            checks["not_automatically_published"] = result["receipt"]["searchability"] == "unverified"
            ledger.publish(job, bound)
            published = ledger.read(job, bound)
            checks["exact_mapping_published"] = published["mappings"][0]["source_id"] == "synthetic-relay"
            if probe_readonly_search:
                from graphiti_core import Graphiti
                from readonly_query import create_readonly_driver, query_published
                prior = instances[0]
                driver = create_readonly_driver(groups[0], FalkorDB(host=HOST, socket_timeout=30, socket_connect_timeout=10))
                reader = Graphiti(graph_driver=driver, llm_client=prior.llm_client, embedder=prior.embedder,
                                  cross_encoder=prior.cross_encoder, max_coroutines=2)
                request = {"contract_version": "gkos-graphiti-query/1.0.0-draft.1", "request_id": "synthetic-published-query",
                           "binding": published["binding"], "query": "synthetic relay test chamber", "limit": 5}
                try:
                    response = await query_published(ledger, job, lambda: bound, reader, driver, request)
                    decoded = json.loads(response)
                    hits = decoded["hits"]
                    checks["bounded_query_contract_response"] = len(response) <= 128 * 1024 and decoded["binding"] == published["binding"]
                    checks["readonly_semantic_search_returned_facts"] = bool(hits) and len(hits) <= 5 and all(
                        "relay" in hit["fact"].lower() and hit["semantic_support"] == "unverified" for hit in hits)
                    allowed = {mapping["projection_episode_id"] for mapping in ledger.read(job, bound)["mappings"]}
                    checks["readonly_semantic_citations_match_published_mapping"] = bool(hits) and all(
                        hit["citations"] and all(citation["projection_episode_id"] in allowed for citation in hit["citations"]) for hit in hits)
                    contract_fixture = {"request": request, "result": decoded, "authorized_episodes": published["mappings"]}
                finally:
                    await reader.close()
            try:
                ledger.read(job, {**bound, "policy_digest": digest("changed-policy")})
            except Refused:
                checks["stale_policy_denied"] = True
            try:
                await worker.run(lambda: (bound, manifest, episodes), backend)
            except Refused:
                checks["duplicate_did_not_reach_backend"] = len(groups) == 1
            ledger.close()
            ledger = Ledger(Path(directory).resolve())
            checks["ledger_reopen_preserved_generation"] = ledger.read(job, bound) == published
            ledger.revoke(bound["corpus_id"])
            try:
                ledger.read(job, bound)
            except Refused:
                checks["revocation_denied_before_purge"] = True
            if probe_readonly_search:
                try:
                    await query_published(ledger, job, lambda: bound, reader, driver, request)
                except Refused as error:
                    checks["revoked_published_query_refused"] = str(error) == "generation-unavailable"
            async def delete(group):
                assert group in groups
                if group in client.list_graphs():
                    client.select_graph(group).delete()
            async def absent(group): return group not in client.list_graphs()
            await purge_job(ledger, job, writer_stopped=lambda _: not worker.active, delete_graph=delete, graph_absent=absent)
            checks["physical_purge_verified"] = ledger.status(job)["state"] == "purged"
        except Exception as exc:
            error_type = type(exc).__name__
        finally:
            ledger.close()
            for group in groups:
                assert group.startswith("gkos_") and len(group) == 37
                if group in client.list_graphs():
                    client.select_graph(group).delete()
            checks["fixture_cleanup"] = all(group not in client.list_graphs() for group in groups)
    passed = error_type is None and len(checks) == (13 if probe_readonly_search else 9) and all(checks.values())
    sources = ["ledger.py", "worker.py", "backend.py", "qualify_live.py"]
    if probe_readonly_search:
        sources += ["readonly_query.py", "qualify_readonly_search.py"]
    print(json.dumps({"schema": "gkos-graphiti-managed-qualification/1", "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": "PASS" if passed else "FAIL", "error_type": error_type,
        "python": platform.python_version(), "packages": versions, "checks": checks,
        **({"contract_fixture": contract_fixture} if probe_readonly_search else {}),
        "source_sha256": {name: hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest()
                          for name in sources},
        "scope": "synthetic integration smoke; not performance, model-artifact or production qualification"}, indent=2))
    if not passed:
        raise RuntimeError("managed qualification failed; inspect receipt")


if __name__ == "__main__":
    asyncio.run(main())
