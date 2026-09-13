"""Private query driver for already published, indexed Graphiti projections."""
import asyncio
import copy
import importlib.metadata
import re
import weakref
from ledger import Refused

_groups = weakref.WeakKeyDictionary()


def create_readonly_driver(group, client):
    if not isinstance(group, str) or not re.fullmatch(r"gkos_[0-9a-f]{32}", group):
        raise Refused("projection-invalid")
    if importlib.metadata.version("graphiti-core") != "0.30.2":
        raise Refused("graphiti-version-unsupported")
    # These conversion helpers belong to the explicitly pinned driver version.
    from graphiti_core.driver.falkordb_driver import FalkorDriver, convert_datetimes_to_strings, _strip_nul_bytes

    class ReadGraph:
        async def query(self, query, params=None):
            return await asyncio.wait_for(client.select_graph(group).ro_query(
                query, params=params, timeout=30000), 30)

    class ReadClient:
        def select_graph(self, name):
            if name != group:
                raise Refused("projection-mismatch")
            return ReadGraph()

        async def aclose(self):
            await asyncio.wait_for(client.aclose(), 10)

    class ReadDriver(FalkorDriver):
        def clone(self, database):
            if database != group:
                raise Refused("projection-mismatch")
            return self

        async def build_indices_and_constraints(self):
            # The SDK constructor schedules this method. Query construction must
            # never build indexes; ingestion/publication owns index readiness.
            return None

        async def execute_query(self, cypher_query_, **kwargs):
            params = _strip_nul_bytes(convert_datetimes_to_strings(dict(kwargs)))
            # Do not inherit the SDK's exception logger, which includes query
            # text and parameters. Database errors propagate without that log.
            result = await self._get_graph(self._database).query(cypher_query_, params)
            header = [item[1] for item in result.header]
            records = [{key: row[index] if index < len(row) else None for index, key in enumerate(header)}
                       for row in result.result_set]
            return records, header, None

    driver = ReadDriver(falkor_db=ReadClient(), database=group)
    _groups[driver] = group
    return driver


async def search_readonly(graphiti, driver, query, limit=10):
    """Return untrusted SDK edges; host ledger/citation authorization is separate."""
    group = _groups.get(driver)
    if group is None or graphiti.driver is not driver or getattr(getattr(graphiti, "clients", None), "driver", None) is not driver:
        raise Refused("readonly-driver-required")
    if not isinstance(query, str) or not query.strip() or re.search(r"[\x00-\x1f\x7f]", query):
        raise Refused("query-invalid")
    try:
        size = len(query.encode("utf-8"))
    except UnicodeEncodeError as error:
        raise Refused("query-invalid") from error
    if size > 4096 or type(limit) is not int or not 1 <= limit <= 50:
        raise Refused("query-invalid")
    from graphiti_core.search.search_config_recipes import EDGE_HYBRID_SEARCH_RRF
    # Graphiti.search mutates the shared recipe's limit. Use its advanced public
    # API with a detached recipe for every request, including concurrent calls.
    config = copy.deepcopy(EDGE_HYBRID_SEARCH_RRF)
    config.limit = limit
    result = await asyncio.wait_for(graphiti.search_(query, config=config, group_ids=[group], driver=driver), 30)
    return result.edges
