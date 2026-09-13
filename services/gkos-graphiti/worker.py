"""Trusted single-worker adapter; never import this into the deterministic core."""
import asyncio
import copy
from ledger import Refused, binding, canonical, digest, validate_manifest
from backend import validate_episode


class Worker:
    def __init__(self, ledger):
        self.ledger = ledger
        self.active = False

    async def run(self, current, backend_factory):
        """current rereads authorized bytes/config; backend_factory is host-owned.

        current returns (binding, manifest, episodes). Episode digests cover the
        complete canonical input envelope. No source text is stored in SQLite.
        Backend calls must have finite transport deadlines. Cancellation waits
        for backend cleanup; a caller must not start a replacement process until
        it establishes that this worker stopped.
        """
        if self.active:
            raise Refused("worker-busy")
        self.active = True
        backend, job, lease = None, None, None
        try:
            initial, manifest, episodes = current()
            binding(initial)
            if type(episodes) is not list or type(manifest) is not list or not 1 <= len(episodes) <= 50000 or len(episodes) != len(manifest):
                raise Refused("episodes-invalid")
            validate_manifest(initial, manifest)
            encoded_size = 1
            for episode in episodes:
                validate_episode(episode)
                encoded_size += len(canonical(episode)) + 1
                if encoded_size > 64 * 1024 * 1024:
                    raise Refused("episode-export-too-large")
            initial, manifest, episodes = copy.deepcopy((initial, manifest, episodes))
            if any(digest(episode) != source["episode_digest"] for episode, source in zip(episodes, manifest)):
                raise Refused("episode-binding-mismatch")
            job = self.ledger.enqueue(initial, manifest)
            lease = self.ledger.claim(job, initial)

            def check():
                fresh, sources, inputs = current()
                if fresh != initial or sources != manifest or inputs != episodes:
                    raise Refused("source-authority-changed")
                self.ledger.renew(job, lease["token"], fresh)

            check()
            backend = backend_factory(lease["projection_id"])
            await backend.initialize()
            check()
            mappings = []
            for source, episode in zip(manifest, episodes):
                check()
                uid = await backend.add(copy.deepcopy(episode))
                check()
                if not await backend.matches(uid, episode):
                    raise Refused("persistence-mismatch")
                check()
                mappings.append({"source_id": source["source_id"], "source_digest": source["source_digest"],
                                 "projection_episode_id": uid})
            await backend.close()
            backend = None
            check()
            receipt = {"binding": initial, "projection_id": lease["projection_id"], "mappings": mappings,
                       "milestone": "persistence-verified", "searchability": "unverified"}
            self.ledger.observe(job, lease["token"], initial, mappings, digest(receipt))
            # Publication is a separate host step, after its search/config gate.
            return {"job": job, "receipt": receipt}
        except BaseException:
            if job is not None and lease is not None:
                try:
                    self.ledger.quarantine(job, lease["token"])
                except Refused:
                    pass  # already revoked/expired/otherwise fenced
            raise
        finally:
            try:
                if backend is not None:
                    await backend.close()
            finally:
                self.active = False


async def purge_job(ledger, job, *, writer_stopped, delete_graph, graph_absent):
    """Physical cleanup after the host establishes writer quiescence.

    Never infer process death from lease expiry alone: a timed-out model request
    can still finish. Callbacks operate on this exact ledger-owned group only.
    """
    status = ledger.status(job)
    if status["state"] not in ("revoked", "quarantined") or writer_stopped(job) is not True:
        raise Refused("purge-not-authorized")
    group = status["projection_id"]
    await delete_graph(group)
    if writer_stopped(job) is not True or not await graph_absent(group):
        raise Refused("purge-unverified")
    if writer_stopped(job) is not True:
        raise Refused("purge-unverified")
    ledger.mark_purged(job)
