"""Loopback HTTP server for optional DSPy-backed GKOS proposals."""

from __future__ import annotations

import argparse
import hmac
import importlib.util
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse

from . import CONTRACT_VERSION, PROGRAM_VERSION
from .contracts import ContractError, validate_request
from .programs import run_request

MAX_BODY = 1_100_000


def health_payload() -> dict[str, Any]:
    model_configured = bool(os.environ.get("DSPY_MODEL"))
    dspy_installed = importlib.util.find_spec("dspy") is not None
    ready = model_configured and dspy_installed
    return {
        "status": "ready" if ready else "needs_configuration",
        "contractVersion": CONTRACT_VERSION,
        "programVersion": PROGRAM_VERSION,
        "authoritative": False,
        "modelConfigured": model_configured,
        "dspyInstalled": dspy_installed,
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "GKOSIntelligence/1.0"

    def _send(self, status: int, value: dict[str, Any]) -> None:
        payload = json.dumps(value, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def _authorized(self) -> bool:
        expected = os.environ.get("GKOS_INTELLIGENCE_TOKEN")
        if not expected:
            return True
        actual = self.headers.get("Authorization", "")
        return hmac.compare_digest(actual, f"Bearer {expected}")

    def do_GET(self) -> None:  # noqa: N802
        if urlparse(self.path).path != "/health":
            self._send(404, {"error": "not found"})
            return
        self._send(200, health_payload())

    def do_POST(self) -> None:  # noqa: N802
        if urlparse(self.path).path != "/v1/proposals":
            self._send(404, {"error": "not found"})
            return
        if not self._authorized():
            self._send(401, {"error": "unauthorized"})
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size < 1 or size > MAX_BODY:
                raise ContractError("invalid request size")
            request = validate_request(json.loads(self.rfile.read(size)))
            self._send(200, run_request(request))
        except (ContractError, json.JSONDecodeError) as exc:
            self._send(400, {"error": str(exc)})
        except Exception as exc:
            self._send(503, {"error": str(exc), "proposals": []})

    def log_message(self, format: str, *args: Any) -> None:
        if os.environ.get("GKOS_INTELLIGENCE_LOG") == "1":
            super().log_message(format, *args)


def main() -> None:
    parser = argparse.ArgumentParser(description="Optional DSPy proposal sidecar for GKOS")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    if args.host not in {"127.0.0.1", "::1", "localhost"}:
        raise SystemExit("Refusing non-loopback bind")
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
