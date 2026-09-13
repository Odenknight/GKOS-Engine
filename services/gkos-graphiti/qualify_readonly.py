"""Synthetic read-only driver probe in the existing Hive lab; no model calls."""
import asyncio
import hashlib
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from falkordb.asyncio import FalkorDB
from redis.exceptions import ResponseError
from hive import graph_client, HOST
from ledger import Refused
from readonly_query import create_readonly_driver


async def main():
    group = "gkos_" + uuid.uuid4().hex
    fixture = graph_client()
    client = FalkorDB(host=HOST, socket_timeout=30, socket_connect_timeout=10)
    checks, calls = {}, []
    driver = None
    error_type = None

    class AuditGraph:
        async def ro_query(self, query, **kwargs):
            calls.append("GRAPH.RO_QUERY")
            return await client.select_graph(group).ro_query(query, **kwargs)

        async def query(self, *args, **kwargs):
            raise AssertionError("write-capable transport attempted")

    class AuditClient:
        def select_graph(self, name):
            assert name == group
            return AuditGraph()

        async def aclose(self):
            await client.aclose()

    try:
        fixture.select_graph(group).query("CREATE (:ReadonlyFixture {value: 7})", timeout=10000)
        driver = create_readonly_driver(group, AuditClient())
        await driver._init_task
        checks["constructor_issued_no_commands"] = calls == []
        query = "MATCH (n:ReadonlyFixture) RETURN n.value AS value"
        records, header, _ = await driver.execute_query(query)
        checks["actual_readonly_readback"] = records == [{"value": 7}] and header == ["value"]
        try:
            await driver.execute_query("CREATE (:ReadonlyFixture {value: 8})")
        except ResponseError:
            checks["database_refused_mutation"] = True
        records, _, _ = await driver.execute_query(query)
        checks["fixture_unchanged_after_refusal"] = records == [{"value": 7}]
        try:
            driver.client.select_graph("unowned")
        except Refused:
            checks["cross_graph_selection_refused"] = True
        try:
            driver.clone("unowned")
        except Refused:
            checks["cross_graph_clone_refused"] = True
    except Exception as error:
        error_type = type(error).__name__
    finally:
        if driver is not None:
            await driver.close()
        else:
            await client.aclose()
        if group in fixture.list_graphs():
            fixture.select_graph(group).delete()
        checks["fixture_cleanup"] = group not in fixture.list_graphs()
    passed = error_type is None and len(checks) == 7 and all(checks.values()) and calls == ["GRAPH.RO_QUERY"] * 3
    receipt = {"schema": "gkos-graphiti-readonly-probe/1", "timestamp": datetime.now(timezone.utc).isoformat(),
               "status": "PASS" if passed else "FAIL", "checks": checks, "error_type": error_type,
               "query_commands": calls, "source_sha256": {name: hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest()
                   for name in ("ledger.py", "readonly_query.py", "qualify_readonly.py")},
               "scope": "synthetic SDK/database read-only transport probe; not semantic relevance or product authorization"}
    print(json.dumps(receipt, indent=2))
    if not passed:
        raise RuntimeError("read-only probe failed")


if __name__ == "__main__":
    asyncio.run(main())
