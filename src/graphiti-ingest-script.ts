import { GRAPHITI_CORE_VERSION } from "./graphiti";

/** Optional external runner. No Python/database/model work occurs in the core. */
export const GRAPHITI_INGEST_SCRIPT = String.raw`#!/usr/bin/env python3
# Explicitly run only on an authorized GKOS export. Never runs during navigation.
# pip install "graphiti-core[falkordb]==${GRAPHITI_CORE_VERSION}"
# Configure Graphiti's model credentials and GRAPHITI_DB=falkordb|neo4j.
# A fresh projection group and durable receipt are created for each new export.
# An existing receipt blocks reprocessing; reconcile it before retrying.
import argparse, asyncio, hashlib, importlib.metadata, json, os, re, sys, time
from datetime import datetime
from pathlib import Path
from uuid import uuid4
from graphiti_core import Graphiti
from graphiti_core.nodes import EpisodeType, EpisodicNode

def sync_directory(path):
    # Windows has no portable directory-fsync API. Atomic replacement there
    # does not constitute a power-loss durability guarantee.
    if os.name != "nt":
        fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)

def save_report(path, report):
    temporary = path.with_name(path.name + "." + uuid4().hex + ".tmp")
    with temporary.open("x", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(temporary, path)
    sync_directory(path.parent)

def bounded_bytes(path, limit=64 * 1024 * 1024):
    with path.open("rb") as f:
        raw = f.read(limit + 1)
    if len(raw) > limit:
        raise ValueError("Input exceeds the 64 MiB runner limit")
    return raw

async def reconcile_run(source, raw, episodes, source_group):
    # Observation only: never replay add_episode, initialize indexes, rewrite
    # the ingestion receipt, grant retry permission or publish a generation.
    if os.environ.get("GRAPHITI_DB", "falkordb") != "falkordb":
        raise ValueError("Reconciliation currently supports FalkorDB only")
    receipt_path = source.with_name("graphiti-ingestion-report.json")
    receipt_bytes = bounded_bytes(receipt_path)
    prior = json.loads(receipt_bytes)
    digest = hashlib.sha256(raw).hexdigest()
    if not isinstance(prior, dict) or prior.get("schema") != "gkos-graphiti-run/1" or \
       prior.get("graphiti_core") != "${GRAPHITI_CORE_VERSION}" or prior.get("manifest_sha256") != digest or \
       prior.get("source_group") != source_group or not isinstance(prior.get("projection_group"), str) or \
       not re.fullmatch(r"gkos_[0-9a-f]{32}", prior["projection_group"]):
        raise ValueError("Receipt identity/manifest mismatch")
    items = prior.get("episodes")
    if not isinstance(items, list) or len(items) > len(episodes):
        raise ValueError("Invalid receipt episode prefix")
    mapped = set()
    for index, item in enumerate(items):
        expected = episodes[index]
        if not isinstance(item, dict) or item.get("canonical_uuid") != expected["uuid"] or \
           item.get("episode_body_sha256") != hashlib.sha256(expected["episode_body"].encode("utf-8")).hexdigest():
            raise ValueError("Receipt episode identity/body mismatch")
        uid = item.get("projection_uuid")
        if item.get("state") == "in-flight":
            if uid is not None:
                raise ValueError("Invalid ambiguous receipt mapping")
        elif item.get("state") in ("ingestion-returned", "persistence-verified"):
            if not isinstance(uid, str) or not uid or len(uid) > 128 or uid in mapped:
                raise ValueError("Invalid or duplicate projection UUID")
            mapped.add(uid)
        else:
            raise ValueError("Unknown receipt episode state")
        if index < len(items) - 1 and item["state"] != "persistence-verified":
            raise ValueError("Receipt contains an unfinished predecessor")
    verified = sum(item["state"] == "persistence-verified" for item in items)
    if type(prior.get("episodes_completed")) is not int or prior["episodes_completed"] != verified or \
       prior.get("state") not in ("accepted", "failed-needs-reconciliation", "persistence-verified") or \
       (prior["state"] == "persistence-verified" and verified != len(episodes)):
        raise ValueError("Inconsistent receipt completion state")
    output = source.with_name("graphiti-reconciliation-" + uuid4().hex + ".json")
    report = {"schema": "gkos-graphiti-reconciliation/1", "graphiti_core": "${GRAPHITI_CORE_VERSION}",
              "manifest_sha256": digest, "source_receipt_sha256": hashlib.sha256(receipt_bytes).hexdigest(),
              "projection_group": prior["projection_group"], "state": "observing",
              "observed_at": datetime.now().astimezone().isoformat(), "episodes": [],
              "unattempted_episodes": len(episodes) - len(items), "retry_allowed": False,
              "generation_published": False, "searchability": "unverified"}
    with output.open("x", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
        f.flush()
        os.fsync(f.fileno())
    sync_directory(output.parent)
    client = None
    try:
        if mapped:
            from falkordb.asyncio import FalkorDB
            client = FalkorDB(host=os.environ.get("FALKORDB_HOST", "localhost"),
                port=int(os.environ.get("FALKORDB_PORT", "6379")),
                username=os.environ.get("FALKORDB_USER"), password=os.environ.get("FALKORDB_PASSWORD"),
                socket_connect_timeout=10, socket_timeout=30)
            graph = client.select_graph(prior["projection_group"])
        for index, item in enumerate(items):
            observation = {"canonical_uuid": item["canonical_uuid"], "projection_uuid": item["projection_uuid"],
                           "state": "ambiguous-write"}
            if item["projection_uuid"] is not None:
                # RO_QUERY cannot create a missing graph. Parameterized equality
                # returns bounded booleans rather than source or backend content.
                result = await asyncio.wait_for(graph.ro_query(
                    "MATCH (e:Episodic {uuid: $uuid}) RETURN e.content = $body, e.group_id = $group LIMIT 2",
                    params={"uuid": item["projection_uuid"], "body": episodes[index]["episode_body"],
                            "group": prior["projection_group"]}, timeout=30000), 30)
                observation["state"] = "persistence-observed" if result.result_set == [[True, True]] else "missing-or-mismatched"
            report["episodes"].append(observation)
            save_report(output, report)
        if bounded_bytes(source) != raw or bounded_bytes(receipt_path) != receipt_bytes:
            raise RuntimeError("Source or receipt changed during observation")
        complete = len(items) == len(episodes) and all(item["state"] == "persistence-observed" for item in report["episodes"])
        report["state"] = "persistence-observed" if complete else "requires-operator-reconciliation"
    except BaseException as exc:
        report["state"] = "requires-operator-reconciliation"
        report["error_type"] = type(exc).__name__
    finally:
        if client is not None:
            try:
                await asyncio.wait_for(client.aclose(), 10)
            except BaseException as exc:
                report["state"] = "requires-operator-reconciliation"
                report["error_type"] = type(exc).__name__
        # Also recheck after closing the async transport, before publishing the
        # observation. This detects changed bytes, not an active-writer lease.
        try:
            if bounded_bytes(source) != raw or bounded_bytes(receipt_path) != receipt_bytes:
                report["state"] = "requires-operator-reconciliation"
                report["error_type"] = "SourceChanged"
        except (OSError, ValueError):
            report["state"] = "requires-operator-reconciliation"
            report["error_type"] = "SourceUnavailable"
        save_report(output, report)
    print("reconciliation observation:", output)
    return report

async def main(path, reconcile=False):
    actual = importlib.metadata.version("graphiti-core")
    if actual != "${GRAPHITI_CORE_VERSION}":
        raise RuntimeError("Graphiti version mismatch: " + actual)
    source = Path(path)
    raw = bounded_bytes(source)
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
    if reconcile:
        return await reconcile_run(source, raw, episodes, next(iter(groups)))
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
    sync_directory(report_path.parent)
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
    parser = argparse.ArgumentParser(description="Ingest an authorized export or observe its existing receipt without retrying")
    parser.add_argument("path", nargs="?", default="graphiti-episodes.json")
    parser.add_argument("--reconcile", action="store_true")
    args = parser.parse_args()
    result = asyncio.run(main(args.path, args.reconcile))
    if args.reconcile and result["state"] != "persistence-observed":
        sys.exit(1)
`;
