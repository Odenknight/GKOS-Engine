"""Synthetic subprocess fixture for check-graphiti-http-chain.mjs; no vault data."""
import asyncio
import copy
import json
import secrets
import sys
import tempfile
import types
from pathlib import Path
from unittest.mock import patch
from aiohttp import web
from ledger import Ledger, digest
from query_http import QuerySession, create_query_app


async def main():
    with tempfile.TemporaryDirectory(prefix="gkos-http-chain-") as directory:
        ledger = Ledger(Path(directory).resolve(), create=True)
        runner = None
        try:
            manifest = [{"source_id":"note", "source_digest":digest("synthetic source"), "episode_digest":digest("episode")}]
            bound = {"corpus_id":"synthetic", "scope_digest":digest("scope"), "policy_digest":"sha256:" + "b" * 64,
                     "configuration_digest":digest("config"), "source_snapshot_digest":digest(manifest)}
            job = ledger.enqueue(bound, manifest)
            lease = ledger.claim(job, bound)
            mapping = {"source_id":"note", "source_digest":manifest[0]["source_digest"], "projection_episode_id":"episode"}
            ledger.observe(job, lease["token"], bound, [mapping], digest("synthetic receipt"))
            ledger.publish(job, bound)
            binding = ledger.read(job, bound)["binding"]
            driver, token = object(), secrets.token_hex(32)
            session = QuerySession(ledger, job, lambda: copy.deepcopy(bound), None, driver)
            async def search(*args):
                return [types.SimpleNamespace(fact="Synthetic relay connects chamber", episodes=["episode"], group_id=binding["projection_id"])]
            with patch("readonly_query._groups", {driver:binding["projection_id"]}), patch("readonly_query.search_readonly", side_effect=search):
                runner = web.AppRunner(create_query_app(lambda value: session if secrets.compare_digest(value, token) else None), access_log=None)
                await runner.setup()
                site = web.TCPSite(runner, "127.0.0.1", 0)
                await site.start()
                # Dedicated child stdout is consumed privately by the test parent.
                print(json.dumps({"port":runner.addresses[0][1], "token":token, "binding":binding, "mapping":mapping}), flush=True)
                while True:
                    command = (await asyncio.to_thread(sys.stdin.readline)).strip()
                    if command == "revoke":
                        ledger.revoke("synthetic")
                        print('{"revoked":true}', flush=True)
                    elif command in ("stop", ""):
                        break
        finally:
            if runner is not None:
                await runner.cleanup()
            ledger.close()


if __name__ == "__main__":
    asyncio.run(main())
