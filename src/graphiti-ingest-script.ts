import { GRAPHITI_CORE_VERSION } from "./graphiti";

/** Optional external runner. No Python/database/model work occurs in the core. */
export const GRAPHITI_INGEST_SCRIPT = String.raw`#!/usr/bin/env python3
# Explicitly run only on an authorized GKOS export. Never runs during navigation.
# pip install "graphiti-core[falkordb]==${GRAPHITI_CORE_VERSION}"
# Configure Graphiti's model credentials and GRAPHITI_DB=falkordb|neo4j.
# A fresh projection group and durable receipt are created for each new export.
# An existing receipt blocks reprocessing; reconcile it before retrying.
import asyncio, hashlib, importlib.metadata, json, os, sys, time
from datetime import datetime
from pathlib import Path
from uuid import uuid4
from graphiti_core import Graphiti
from graphiti_core.nodes import EpisodeType, EpisodicNode

def save_report(path, report):
    temporary = path.with_suffix(".tmp")
    with temporary.open("w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(temporary, path)

async def main(path):
    actual = importlib.metadata.version("graphiti-core")
    if actual != "${GRAPHITI_CORE_VERSION}":
        raise RuntimeError("Graphiti version mismatch: " + actual)
    source = Path(path)
    with source.open("rb") as f:
        raw = f.read(64 * 1024 * 1024 + 1)
    if len(raw) > 64 * 1024 * 1024:
        raise ValueError("Export exceeds the 64 MiB runner limit")
    episodes = json.loads(raw)
    if not isinstance(episodes, list) or not episodes or len(episodes) > 10000:
        raise ValueError("Expected 1–10000 authorized episodes")
    groups = set()
    identities = set()
    for e in episodes:
        if not isinstance(e, dict) or e.get("source") not in ("json", "fact_triple"):
            raise ValueError("Only structured GKOS episodes are supported")
        for field in ("uuid", "name", "episode_body", "source_description", "reference_time", "group_id"):
            if not isinstance(e.get(field), str) or not e[field]:
                raise ValueError("Missing episode field: " + field)
        if e["uuid"] in identities:
            raise ValueError("Duplicate canonical episode UUID")
        identities.add(e["uuid"])
        groups.add(e["group_id"])
        json.loads(e["episode_body"])
        datetime.fromisoformat(e["reference_time"].replace("Z", "+00:00"))
    if len(groups) != 1:
        raise ValueError("One authorized corpus per run; mixed groups are refused")
    report_path = source.with_name("graphiti-ingestion-report.json")
    report = {"schema": "gkos-graphiti-run/1", "graphiti_core": actual,
              "manifest_sha256": hashlib.sha256(raw).hexdigest(),
              "source_group": next(iter(groups)), "projection_group": "gkos_" + uuid4().hex,
              "state": "accepted", "accepted_is_searchable": False,
              "searchability": "unverified", "readback_performed": False,
              "episodes_completed": 0, "episodes": [], "combined_extraction_applied": False}
    # Atomic exclusive creation is the run lock; a crash leaves a receipt that
    # must be reconciled, never silently retried with ambiguous external effects.
    with report_path.open("x", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
        f.flush()
        os.fsync(f.fileno())
    g = None
    started = time.perf_counter()
    try:
        backend = os.environ.get("GRAPHITI_DB", "falkordb")
        if backend == "falkordb":
            from graphiti_core.driver.falkordb_driver import FalkorDriver
            driver = FalkorDriver(host=os.environ.get("FALKORDB_HOST", "localhost"),
                port=int(os.environ.get("FALKORDB_PORT", "6379")),
                username=os.environ.get("FALKORDB_USER"), password=os.environ.get("FALKORDB_PASSWORD"),
                database=report["projection_group"])
        elif backend == "neo4j":
            from graphiti_core.driver.neo4j_driver import Neo4jDriver
            driver = Neo4jDriver(uri=os.environ["NEO4J_URI"], user=os.environ["NEO4J_USER"],
                password=os.environ["NEO4J_PASSWORD"], database=os.environ.get("NEO4J_DATABASE", "neo4j"))
        else:
            raise ValueError("GRAPHITI_DB must be falkordb or neo4j")
        g = Graphiti(graph_driver=driver)
        await asyncio.wait_for(g.build_indices_and_constraints(), 60)
        for e in episodes:
            item = {"canonical_uuid": e["uuid"], "episode_body_sha256": hashlib.sha256(e["episode_body"].encode("utf-8")).hexdigest(),
                    "projection_uuid": None, "state": "in-flight"}
            report["episodes"].append(item)
            save_report(report_path, report)
            # uuid= refers to an EXISTING Graphiti episode in 0.30.2. Let it
            # create its own ID, retaining an explicit canonical-to-derived map.
            result = await asyncio.wait_for(g.add_episode(name=e["name"], episode_body=e["episode_body"],
                source=EpisodeType.json, source_description=e["source_description"],
                reference_time=datetime.fromisoformat(e["reference_time"].replace("Z", "+00:00")),
                group_id=report["projection_group"]), 300)
            item.update(projection_uuid=result.episode.uuid, state="ingestion-returned")
            save_report(report_path, report)
            persisted = await asyncio.wait_for(EpisodicNode.get_by_uuid(g.driver, result.episode.uuid), 30)
            if persisted.content != e["episode_body"] or persisted.group_id != report["projection_group"]:
                raise RuntimeError("Persistence content/group mismatch")
            item["state"] = "persistence-verified"
            report["episodes_completed"] += 1
            report["readback_performed"] = True
            save_report(report_path, report)
        report["state"] = "persistence-verified"
    except BaseException as exc:
        report["state"] = "failed-needs-reconciliation"
        report["error_type"] = type(exc).__name__
        raise
    finally:
        report["ingestion_duration_ms"] = round((time.perf_counter() - started) * 1000, 2)
        save_report(report_path, report)
        if g is not None:
            await g.close()
    print("persistence verified; searchability unverified; receipt:", report_path)

if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "graphiti-episodes.json"))
`;
