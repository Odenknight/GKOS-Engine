"""Private adapter HTTP entry point; deployment and scope authority are host-owned."""
import asyncio
import json
import re
from dataclasses import dataclass
from time import monotonic
from aiohttp import web
from readonly_query import query_published


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate-json-key")
        result[key] = value
    return result


@dataclass(frozen=True)
class QuerySession:
    ledger: object
    job: str
    current: object
    graphiti: object
    driver: object


def create_query_app(resolve_session, *, timeout=30, max_active=4):
    """resolve_session(secret) authenticates and derives complete source scope.

    It returns a QuerySession or None, synchronously, without request-selected
    ledger jobs. session.current must recheck that principal's live authority.
    This factory neither binds a port nor selects credentials or corpus data.
    """
    if not callable(resolve_session) or type(timeout) not in (int, float) or not 0 < timeout <= 60 or \
            type(max_active) is not int or not 1 <= max_active <= 16:
        raise ValueError("query-host-configuration-invalid")
    active = 0

    async def query(request):
        nonlocal active
        admitted = False
        deadline = monotonic() + timeout
        header = request.headers.getall("Authorization", [])
        if len(header) != 1 or not re.fullmatch(r"Bearer [A-Za-z0-9._~-]{32,512}", header[0]):
            return web.json_response({"error": "unauthorized"}, status=401)
        try:
            session = resolve_session(header[0][7:])
            if not isinstance(session, QuerySession):
                return web.json_response({"error": "unauthorized"}, status=401)
            if active >= max_active:
                return web.json_response({"error": "query_capacity"}, status=503)
            active += 1
            admitted = True
            async with asyncio.timeout(timeout):
                if request.query_string or request.content_type != "application/json":
                    return web.json_response({"error": "bad_request"}, status=400)
                raw = await request.read()
                try:
                    body = json.loads(raw.decode("utf-8"), object_pairs_hook=unique_object)
                except (UnicodeError, ValueError):
                    return web.json_response({"error": "bad_request"}, status=400)
                # The resolver and current callback are host authority, not the
                # binding supplied in the wire request. Re-resolve after upload.
                if resolve_session(header[0][7:]) is not session:
                    return web.json_response({"error": "unauthorized"}, status=401)
                if request.path == "/search":
                    if type(body) is not dict or set(body) != {"query", "request_id", "limit"}:
                        return web.json_response({"error": "bad_request"}, status=400)
                    publication = session.ledger.read(session.job, session.current())
                    body = {"contract_version": "gkos-graphiti-query/1.0.0-draft.1",
                            "binding": publication["binding"], **body}
                    if resolve_session(header[0][7:]) is not session:
                        return web.json_response({"error": "unauthorized"}, status=401)
                if monotonic() >= deadline:
                    raise TimeoutError("query-deadline")
                response = await query_published(session.ledger, session.job, session.current,
                                                 session.graphiti, session.driver, body)
                if resolve_session(header[0][7:]) is not session:
                    return web.json_response({"error": "unauthorized"}, status=401)
                if monotonic() >= deadline:
                    raise TimeoutError("query-deadline")
                return web.Response(body=response, content_type="application/json")
        except web.HTTPRequestEntityTooLarge:
            return web.json_response({"error": "request_too_large"}, status=413)
        except (UnicodeError, json.JSONDecodeError):
            return web.json_response({"error": "bad_request"}, status=400)
        except Exception:
            # Backend exceptions can contain query text, endpoints or credentials.
            return web.json_response({"error": "semantic_query_unavailable"}, status=503)
        finally:
            # A backend suppressing cancellation retains its slot until its
            # coroutine actually settles; elapsed time cannot release capacity.
            if admitted:
                active -= 1

    app = web.Application(client_max_size=16384)
    app.router.add_post("/query", query)
    app.router.add_post("/search", query)
    return app
