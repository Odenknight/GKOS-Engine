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
                from readonly_query import create_readonly_driver, search_readonly
                prior = instances[0]
                driver = create_readonly_driver(groups[0], FalkorDB(host=HOST, socket_timeout=30, socket_connect_timeout=10))
                reader = Graphiti(graph_driver=driver, llm_client=prior.llm_client, embedder=prior.embedder,
                                  cross_encoder=prior.cross_encoder, max_coroutines=2)
                try:
                    hits = await search_readonly(reader, driver, "synthetic relay test chamber", 5)
                    checks["readonly_semantic_search_returned_facts"] = bool(hits) and len(hits) <= 5 and all(
                        isinstance(hit.fact, str) and "relay" in hit.fact.lower() for hit in hits)
                    allowed = {mapping["projection_episode_id"] for mapping in ledger.read(job, bound)["mappings"]}
                    checks["readonly_semantic_citations_match_published_mapping"] = bool(hits) and all(
                        hit.group_id == groups[0] and hit.episodes and set(hit.episodes) <= allowed for hit in hits)
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
    passed = error_type is None and len(checks) == (11 if probe_readonly_search else 9) and all(checks.values())
    sources = ["ledger.py", "worker.py", "backend.py", "qualify_live.py"]
    if probe_readonly_search:
        sources += ["readonly_query.py", "qualify_readonly_search.py"]
    print(json.dumps({"schema": "gkos-graphiti-managed-qualification/1", "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": "PASS" if passed else "FAIL", "error_type": error_type,
        "python": platform.python_version(), "packages": versions, "checks": checks,
        "source_sha256": {name: hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest()
                          for name in sources},
        "scope": "synthetic integration smoke; not performance, model-artifact or production qualification"}, indent=2))
    if not passed:
        raise RuntimeError("managed qualification failed; inspect receipt")


if __name__ == "__main__":
    asyncio.run(main())
