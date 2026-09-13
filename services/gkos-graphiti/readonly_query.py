"""Private query driver for already published, indexed Graphiti projections."""
import asyncio
import copy
import importlib.metadata
import json
import re
import weakref
from time import monotonic
from ledger import Refused

_groups = weakref.WeakKeyDictionary()


async def _await_before_deadline(operation, seconds):
    deadline = monotonic() + seconds
    result = await asyncio.wait_for(operation, seconds)
    # wait_for can return after expiry when a provider blocks the loop or
    # suppresses cancellation. Never accept that late result. Retain the await
    # until physical cleanup finishes; this is not a hard process deadline.
    if monotonic() >= deadline:
        raise TimeoutError("query-deadline-exceeded")
    return result


def create_readonly_driver(group, client):
    if not isinstance(group, str) or not re.fullmatch(r"gkos_[0-9a-f]{32}", group):
        raise Refused("projection-invalid")
    if importlib.metadata.version("graphiti-core") != "0.30.2":
        raise Refused("graphiti-version-unsupported")
    # These conversion helpers belong to the explicitly pinned driver version.
    from graphiti_core.driver.falkordb_driver import FalkorDriver, convert_datetimes_to_strings, _strip_nul_bytes

    class ReadGraph:
        async def query(self, query, params=None):
            return await _await_before_deadline(client.select_graph(group).ro_query(
                query, params=params, timeout=30000), 30)

    class ReadClient:
        def select_graph(self, name):
            if name != group:
                raise Refused("projection-mismatch")
            return ReadGraph()

        async def aclose(self):
            await _await_before_deadline(client.aclose(), 10)

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
    result = await _await_before_deadline(graphiti.search_(query, config=config, group_ids=[group], driver=driver), 30)
    return result.edges


def _bounded_text(value, limit):
    if type(value) is not str or not value.strip() or re.search(r"[\x00-\x1f\x7f]", value):
        return False
    try:
        return len(value.encode("utf-8")) <= limit
    except UnicodeEncodeError:
        return False


async def query_published(ledger, job, current, graphiti, driver, request):
    """Host-only boundary: current derives fresh authority, never request fields.

    Return bounded UTF-8 draft-contract bytes. Authentication and complete source
    scope belong to the caller; a published ledger alone is not a user grant.
    """
    version = "gkos-graphiti-query/1.0.0-draft.1"
    if type(request) is not dict or set(request) != {"contract_version", "request_id", "binding", "query", "limit"} or \
            request["contract_version"] != version or type(request["binding"]) is not dict or not _bounded_text(request["request_id"], 128) or \
            not _bounded_text(request["query"], 4096) or type(request["limit"]) is not int or not 1 <= request["limit"] <= 50:
        raise Refused("query-invalid")
    request_id, query, limit = request["request_id"], request["query"], request["limit"]
    initial = ledger.read(job, current())
    if request["binding"] != initial["binding"] or _groups.get(driver) != initial["binding"]["projection_id"]:
        raise Refused("query-binding-mismatch")
    try:
        edges = await search_readonly(graphiti, driver, query, limit)
    except Exception:
        raise Refused("query-backend-unavailable") from None
    if ledger.read(job, current()) != initial:
        raise Refused("query-authority-changed")
    if type(edges) is not list or len(edges) > limit:
        raise Refused("query-result-invalid")
    mappings = {item["projection_episode_id"]: item for item in initial["mappings"]}
    hits = []
    for edge in edges:
        try:
            fact, episodes, group = edge.fact, edge.episodes, edge.group_id
        except Exception:
            raise Refused("query-result-invalid") from None
        if group != initial["binding"]["projection_id"] or not _bounded_text(fact, 4096) or \
                type(episodes) is not list or not 1 <= len(episodes) <= 16 or \
                any(type(uid) is not str or uid not in mappings for uid in episodes) or len(set(episodes)) != len(episodes):
            raise Refused("query-result-invalid")
        hits.append({"fact": fact, "semantic_support": "unverified", "citations": [dict(mappings[uid]) for uid in episodes]})
    body = json.dumps({"contract_version": version, "request_id": request_id, "binding": initial["binding"], "hits": hits},
                      ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode("utf-8")
    if len(body) > 128 * 1024:
        raise Refused("query-response-too-large")
    if ledger.read(job, current()) != initial:
        raise Refused("query-authority-changed")
    return body
