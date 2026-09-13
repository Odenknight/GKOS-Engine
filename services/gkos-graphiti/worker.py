"""Bounded managed ingestion over injected, trusted adapter operations."""
import asyncio
import hashlib
import json
from ledger import canonical, fields, BINDING_KEYS, JOB_KEYS


class Worker:
    def __init__(self, ledger, concurrency=2, timeout=300):
        if type(concurrency) is not int or not 1 <= concurrency <= 16 or not 0 < timeout <= 600:
            raise ValueError("Invalid worker bounds")
        self.ledger, self.concurrency, self.timeout = ledger, concurrency, timeout
        self.tasks = set()

    async def run(self, binding, job, payload, adapter):
        """Adapter: authorize(binding), ingest(binding, payload), readback(binding, id).

        Authorization is trusted host policy, not a client boolean or group ID.
        Readback returns exact persisted payload bytes for this binding's group.
        Errors return no provider details. A timeout never frees a physical slot
        until the original task settles, even if cancellation is ignored.
        """
        fields(binding, BINDING_KEYS)
        fields(job, JOB_KEYS)
        binding, job = json.loads(canonical(binding)), json.loads(canonical(job))
        if not isinstance(payload, bytes) or len(payload) > 4 * 1024 * 1024 or "sha256:" + hashlib.sha256(payload).hexdigest() != job["payload_digest"]:
            raise ValueError("Payload digest or budget mismatch")
        if len(self.tasks) >= self.concurrency:
            return {"state": "deferred", "reason": "physical-capacity", "searchable": False}
        deadline = asyncio.get_running_loop().time() + self.timeout
        claim = {"id": None, "token": None, "stopped": False}

        def expired():
            return claim["stopped"] or asyncio.get_running_loop().time() >= deadline

        def mark_ambiguous():
            if claim["id"] and claim["token"]:
                try:
                    self.ledger.ambiguous(claim["id"], claim["token"])
                except ValueError:
                    pass  # Already verified/revoked; never undo that transition.

        async def perform():
            try:
                if not await adapter.authorize(dict(binding)) or expired():
                    return {"state": "denied", "searchable": False}
                queued = self.ledger.enqueue(binding, job)
                claim["id"] = queued["id"]
                if queued["state"] != "queued":
                    return self.ledger.status(queued["id"])
                claim["token"] = self.ledger.claim(queued["id"])
                if expired():
                    mark_ambiguous()
                    return {"state": "deadline", "searchable": False}
                episode = await adapter.ingest(dict(binding), payload)
                self.ledger.returned(queued["id"], claim["token"], episode)
                if expired():
                    mark_ambiguous()
                    return {"state": "ambiguous", "searchable": False}
                persisted = await adapter.readback(dict(binding), episode)
                if expired():
                    mark_ambiguous()
                    return {"state": "ambiguous", "searchable": False}
                if not await adapter.authorize(dict(binding)):
                    self.ledger.revoke(binding)
                    return {"state": "revoked", "searchable": False}
                if expired():
                    mark_ambiguous()
                    return {"state": "ambiguous", "searchable": False}
                if persisted != payload:
                    raise ValueError("Persistence mismatch")
                self.ledger.observe(queued["id"], claim["token"], episode, job["payload_digest"])
                return self.ledger.status(queued["id"])
            except BaseException:
                mark_ambiguous()
                return {"state": "ambiguous" if claim["token"] else "unavailable", "searchable": False}

        task = asyncio.create_task(perform())
        self.tasks.add(task)
        task.add_done_callback(self.tasks.discard)
        try:
            done, _ = await asyncio.wait({task}, timeout=self.timeout)
            if done:
                return task.result()
            claim["stopped"] = True
            mark_ambiguous()
            task.cancel()
            return {"state": "deadline", "searchable": False}
        except asyncio.CancelledError:
            claim["stopped"] = True
            mark_ambiguous()
            task.cancel()
            raise
