"""Optional Graphiti job ledger. Standard library only; never imports the model.

Trusted host code supplies authorized identities. This store is not an authority
provider. An unfinished write is ambiguous and is never automatically retried.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
from contextlib import contextmanager
from uuid import uuid4

DIGEST = re.compile(r"sha256:[0-9a-f]{64}\Z")
BINDING_KEYS = {"corpus_id", "scope_digest", "policy_digest", "source_snapshot_digest", "projection_id", "configuration_digest"}
JOB_KEYS = {"source_id", "source_digest", "event", "origin", "adapter_version", "payload_digest"}


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def identity(value):
    return "sha256:" + hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


def fields(value, expected):
    if not isinstance(value, dict) or set(value) != expected:
        raise ValueError("Invalid ledger identity fields")
    for key, item in value.items():
        if not isinstance(item, str) or not item.strip() or len(item.encode("utf-8")) > 256 or any(ord(c) < 32 or ord(c) == 127 for c in item):
            raise ValueError("Invalid ledger identity value")
        if key.endswith("digest") and not DIGEST.fullmatch(item):
            raise ValueError("Invalid ledger digest")


class Ledger:
    def __init__(self, path, capacity=1000, *, create=False):
        if type(capacity) is not int or not 1 <= capacity <= 50000:
            raise ValueError("Invalid ledger queue capacity")
        self.capacity = capacity
        path = Path(path)
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        if path.is_symlink():
            raise ValueError("Ledger symlink refused")
        if not path.exists():
            if not create:
                raise ValueError("Ledger missing; explicit initialization required")
            descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            os.close(descriptor)
        self.db = sqlite3.connect(path, timeout=5, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.execute("PRAGMA synchronous=FULL")
        self.db.execute("PRAGMA journal_mode=WAL")
        version = self.db.execute("PRAGMA user_version").fetchone()[0]
        if version not in (0, 1):
            self.db.close()
            raise ValueError("Unsupported ledger schema")
        if version == 0 and not create:
            self.db.close()
            raise ValueError("Uninitialized ledger; explicit initialization required")
        if version == 0:
            with self.transaction():
                if self.db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchone():
                    raise ValueError("Refusing an unrelated database")
                self.db.execute("CREATE TABLE generations (id TEXT PRIMARY KEY, binding TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0)")
                self.db.execute("CREATE TABLE jobs (id TEXT PRIMARY KEY, generation TEXT NOT NULL REFERENCES generations(id), definition TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('queued','in-flight','ambiguous','verified','revoked')), claim TEXT, observation TEXT, projection_episode_id TEXT, UNIQUE(generation,projection_episode_id))")
                self.db.execute("CREATE INDEX jobs_state ON jobs(state)")
                self.db.execute("PRAGMA user_version=1")

    @contextmanager
    def transaction(self):
        self.db.execute("BEGIN IMMEDIATE")
        try:
            yield
            self.db.execute("COMMIT")
        except BaseException:
            self.db.execute("ROLLBACK")
            raise

    def close(self):
        self.db.close()

    def enqueue(self, binding, job):
        fields(binding, BINDING_KEYS)
        fields(job, JOB_KEYS)
        generation = identity(binding)
        job_id = identity({"binding": binding, "job": job})
        with self.transaction():
            self.db.execute("INSERT OR IGNORE INTO generations(id,binding) VALUES (?,?)", (generation, canonical(binding)))
            if self.db.execute("SELECT revoked FROM generations WHERE id=?", (generation,)).fetchone()[0]:
                raise ValueError("Generation revoked")
            prior = self.db.execute("SELECT state FROM jobs WHERE id=?", (job_id,)).fetchone()
            if prior:
                self.status(job_id)
                return {"id": job_id, "state": prior[0], "duplicate": True}
            queued = self.db.execute("SELECT count(*) FROM jobs WHERE state IN ('queued','in-flight','ambiguous')").fetchone()[0]
            if queued >= self.capacity:
                raise ValueError("Ledger queue capacity exceeded")
            self.db.execute("INSERT INTO jobs(id,generation,definition,state) VALUES (?,?,?,'queued')", (job_id, generation, canonical(job)))
        return {"id": job_id, "state": "queued", "duplicate": False}

    def claim(self, job_id):
        token = uuid4().hex
        with self.transaction():
            self.status(job_id)
            changed = self.db.execute("UPDATE jobs SET state='in-flight',claim=? WHERE id=? AND state='queued' AND generation IN (SELECT id FROM generations WHERE revoked=0)", (token, job_id)).rowcount
            if changed != 1:
                raise ValueError("Job unavailable or requires reconciliation")
        return token

    def observe(self, job_id, claim, projection_episode_id, payload_digest):
        """Record exact persistence readback; not a searchability/publication claim.

        The trusted adapter verifies backend bytes before this call. An ID from
        add_episode alone is not persistence readback.
        """
        fields({"source_id": projection_episode_id, "payload_digest": payload_digest}, {"source_id", "payload_digest"})
        with self.transaction():
            self.status(job_id)
            row = self.db.execute("SELECT * FROM jobs WHERE id=? AND claim=? AND state='in-flight'", (job_id, claim)).fetchone()
            if not row or self.db.execute("SELECT revoked FROM generations WHERE id=?", (row["generation"],)).fetchone()[0]:
                raise ValueError("Stale or revoked job claim")
            if json.loads(row["definition"])["payload_digest"] != payload_digest:
                raise ValueError("Persistence readback digest mismatch")
            if row["projection_episode_id"] not in (None, projection_episode_id):
                raise ValueError("Projection mapping mismatch")
            observation = canonical({"projection_episode_id": projection_episode_id, "payload_digest": payload_digest})
            self.db.execute("UPDATE jobs SET state='verified',observation=?,projection_episode_id=? WHERE id=?", (observation, projection_episode_id, job_id))

    def returned(self, job_id, claim, projection_episode_id):
        """Persist a returned mapping even after timeout, without verifying it."""
        fields({"projection_episode_id": projection_episode_id}, {"projection_episode_id"})
        with self.transaction():
            self.status(job_id)
            changed = self.db.execute("UPDATE jobs SET projection_episode_id=? WHERE id=? AND claim=? AND state IN ('in-flight','ambiguous') AND (projection_episode_id IS NULL OR projection_episode_id=?)",
                                      (projection_episode_id, job_id, claim, projection_episode_id)).rowcount
            if changed != 1:
                raise ValueError("Stale or conflicting projection mapping")

    def ambiguous(self, job_id, claim):
        with self.transaction():
            if self.db.execute("UPDATE jobs SET state='ambiguous' WHERE id=? AND claim=? AND state='in-flight'", (job_id, claim)).rowcount != 1:
                raise ValueError("Stale job claim")

    def revoke(self, binding):
        fields(binding, BINDING_KEYS)
        generation = identity(binding)
        with self.transaction():
            self.db.execute("INSERT OR IGNORE INTO generations(id,binding,revoked) VALUES (?,?,1)", (generation, canonical(binding)))
            self.db.execute("UPDATE generations SET revoked=1 WHERE id=?", (generation,))
            self.db.execute("UPDATE jobs SET state='revoked' WHERE generation=?", (generation,))

    def status(self, job_id):
        row = self.db.execute("SELECT jobs.*,generations.binding FROM jobs JOIN generations ON jobs.generation=generations.id WHERE jobs.id=?", (job_id,)).fetchone()
        if not row:
            return None
        binding, job = json.loads(row["binding"]), json.loads(row["definition"])
        fields(binding, BINDING_KEYS)
        fields(job, JOB_KEYS)
        if identity(binding) != row["generation"] or identity({"binding": binding, "job": job}) != job_id:
            raise ValueError("Ledger identity corruption")
        if row["projection_episode_id"] is not None:
            fields({"projection_episode_id": row["projection_episode_id"]}, {"projection_episode_id"})
        observation = json.loads(row["observation"]) if row["observation"] else None
        if observation is not None:
            fields(observation, {"projection_episode_id", "payload_digest"})
            if observation["payload_digest"] != job["payload_digest"] or observation["projection_episode_id"] != row["projection_episode_id"]:
                raise ValueError("Ledger observation corruption")
        if row["state"] == "verified" and observation is None:
            raise ValueError("Ledger missing verified observation")
        # After restart an in-flight write is not assumed absent or completed.
        return {"state": row["state"], "requires_reconciliation": row["state"] in ("in-flight", "ambiguous"),
                "observation": observation,
                "projection_episode_id": row["projection_episode_id"],
                "searchable": False}
