"""Private managed-adapter state. No model imports, network, or source writes.

The host owns authorization and a private local state directory. SQLite is not
an authentication boundary against an actor who can replace that directory.
Expired workers are quarantined, never granted an automatic backend retry.
"""
import hashlib
import json
import os
import re
import secrets
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path


class Refused(ValueError):
    pass


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False)


def digest(value):
    return "sha256:" + hashlib.sha256(canonical(value).encode()).hexdigest()


def binding(value):
    keys = {"corpus_id", "scope_digest", "policy_digest", "source_snapshot_digest", "configuration_digest"}
    if type(value) is not dict or set(value) != keys:
        raise Refused("binding-invalid")
    if not isinstance(value["corpus_id"], str) or not re.fullmatch(r"[A-Za-z0-9._:-]{1,128}", value["corpus_id"]):
        raise Refused("corpus-invalid")
    for key in keys - {"corpus_id"}:
        if not isinstance(value[key], str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", value[key]):
            raise Refused("digest-invalid")
    return canonical(value)


def validate_manifest(current, manifest):
    if type(manifest) is not list or not 1 <= len(manifest) <= 50000:
        raise Refused("manifest-invalid")
    seen = set()
    for item in manifest:
        if type(item) is not dict or set(item) != {"source_id", "source_digest", "episode_digest"}:
            raise Refused("source-invalid")
        uid = item["source_id"]
        if not isinstance(uid, str) or not re.fullmatch(r"[A-Za-z0-9._:-]{1,128}", uid) or uid in seen:
            raise Refused("source-invalid")
        seen.add(uid)
        for key in ("source_digest", "episode_digest"):
            if not isinstance(item[key], str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", item[key]):
                raise Refused("source-digest-invalid")
    if digest(manifest) != current["source_snapshot_digest"]:
        raise Refused("manifest-binding-mismatch")
    return canonical(manifest)


class Ledger:
    # ponytail: one local SQLite writer; split by independent corpus only after
    # measured queue contention warrants it. Network filesystems unsupported.
    def __init__(self, directory, *, capacity=128, clock=time.time, create=False):
        root = Path(directory)
        if str(root).startswith(("\\\\", "//")) or not root.is_absolute() or root.is_symlink() or root.resolve() != root:
            raise Refused("private-local-root-required")
        if type(create) is not bool or not root.is_dir() or type(capacity) is not int or not 1 <= capacity <= 10000:
            raise Refused("configuration-invalid")
        target = root / "graphiti-ledger.sqlite"
        if target.is_symlink() or (target.exists() and not target.is_file()):
            raise Refused("state-file-invalid")
        if not target.exists():
            if not create:
                raise Refused("ledger-missing-explicit-initialization-required")
            descriptor = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            os.close(descriptor)
        self.clock, self.capacity = clock, capacity
        self.db = sqlite3.connect(target, timeout=5, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.execute("PRAGMA journal_mode=DELETE")
        self.db.execute("PRAGMA synchronous=FULL")
        page_size = self.db.execute("PRAGMA page_size").fetchone()[0]
        page_limit = (256 * 1024 * 1024) // page_size
        actual_limit = self.db.execute(f"PRAGMA max_page_count={page_limit}").fetchone()[0]
        if actual_limit > page_limit:
            self.close()
            raise Refused("ledger-byte-capacity")
        version = self.db.execute("PRAGMA user_version").fetchone()[0]
        if version not in (0, 1):
            self.close()
            raise Refused("ledger-version-unsupported")
        if version == 0:
            if not create or self.db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchone():
                self.close()
                raise Refused("ledger-uninitialized-or-unrelated")
        self.db.executescript("""
          BEGIN IMMEDIATE;
          CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY, binding TEXT NOT NULL, manifest TEXT NOT NULL,
            state TEXT NOT NULL CHECK(state IN ('queued','running','observed','published','quarantined','revoked','purged')),
            projection TEXT NOT NULL UNIQUE, token_hash TEXT, expires REAL,
            sequence INTEGER NOT NULL DEFAULT 0, mappings TEXT, observation TEXT,
            created REAL NOT NULL
          );
          CREATE TABLE IF NOT EXISTS events (
            sequence INTEGER PRIMARY KEY AUTOINCREMENT, job TEXT NOT NULL REFERENCES jobs(id),
            state TEXT NOT NULL, at REAL NOT NULL
          );
          PRAGMA user_version=1;
          COMMIT;
        """)

    def close(self):
        self.db.close()

    @contextmanager
    def transaction(self):
        self.db.execute("BEGIN IMMEDIATE")
        try:
            yield
            self.db.execute("COMMIT")
        except BaseException:
            self.db.execute("ROLLBACK")
            raise

    def _event(self, job, state):
        sequence = self.db.execute("INSERT INTO events(job,state,at) VALUES(?,?,?)", (job, state, self.clock())).lastrowid
        self.db.execute("UPDATE jobs SET state=?,sequence=? WHERE id=?", (state, sequence, job))
        return sequence

    def _row(self, job):
        row = self.db.execute("SELECT * FROM jobs WHERE id=?", (job,)).fetchone()
        if row is None:
            raise Refused("job-unknown")
        return row

    def _authorized(self, row, current):
        # current is freshly derived by the authenticated host, never supplied
        # by the remote request or by a backend result.
        if binding(current) != row["binding"]:
            raise Refused("authorization-stale")

    def _lease(self, row, token):
        if row["state"] != "running" or not isinstance(token, str) or len(token) != 64 or \
                not secrets.compare_digest(row["token_hash"] or "", hashlib.sha256(token.encode()).hexdigest()) or \
                self.clock() >= row["expires"]:
            raise Refused("lease-invalid")

    def enqueue(self, current, manifest):
        bound = binding(current)
        encoded = validate_manifest(current, manifest)
        job = digest({"binding": current, "manifest": manifest})
        with self.transaction():
            prior = self.db.execute("SELECT id FROM jobs WHERE id=?", (job,)).fetchone()
            if prior:
                return job
            if self.db.execute("SELECT COUNT(*) FROM jobs").fetchone()[0] >= 100000:
                raise Refused("retention-capacity")
            count = self.db.execute("SELECT COUNT(*) FROM jobs WHERE state IN ('queued','running','observed','quarantined')").fetchone()[0]
            if count >= self.capacity:
                raise Refused("queue-full")
            self.db.execute("INSERT INTO jobs(id,binding,manifest,state,projection,created) VALUES(?,?,?,'queued',?,?)",
                            (job, bound, encoded, "gkos_" + secrets.token_hex(16), self.clock()))
            self._event(job, "queued")
        return job

    def claim(self, job, current, *, seconds=300):
        if type(seconds) is not int or not 1 <= seconds <= 3600:
            raise Refused("lease-duration-invalid")
        token = secrets.token_hex(32)
        with self.transaction():
            row = self._row(job)
            self._authorized(row, current)
            if row["state"] != "queued":
                raise Refused("job-not-queued")
            self.db.execute("UPDATE jobs SET token_hash=?,expires=? WHERE id=?",
                            (hashlib.sha256(token.encode()).hexdigest(), self.clock() + seconds, job))
            sequence = self._event(job, "running")
        return {"token": token, "sequence": sequence, "projection_id": row["projection"]}

    def renew(self, job, token, current, *, seconds=300):
        if type(seconds) is not int or not 1 <= seconds <= 3600:
            raise Refused("lease-duration-invalid")
        with self.transaction():
            row = self._row(job)
            self._authorized(row, current)
            self._lease(row, token)
            self.db.execute("UPDATE jobs SET expires=? WHERE id=?", (self.clock() + seconds, job))

    def observe(self, job, token, current, mappings, receipt_digest):
        """Record host-verified readback; no provider-supplied authority accepted."""
        if not isinstance(receipt_digest, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", receipt_digest):
            raise Refused("observation-invalid")
        with self.transaction():
            row = self._row(job)
            self._authorized(row, current)
            self._lease(row, token)
            manifest = json.loads(row["manifest"])
            if type(mappings) is not list or len(mappings) != len(manifest):
                raise Refused("mappings-incomplete")
            seen = set()
            for item, source in zip(mappings, manifest):
                if type(item) is not dict or set(item) != {"source_id", "source_digest", "projection_episode_id"} or \
                        item["source_id"] != source["source_id"] or item["source_digest"] != source["source_digest"]:
                    raise Refused("mapping-invalid")
                uid = item["projection_episode_id"]
                if not isinstance(uid, str) or not re.fullmatch(r"[A-Za-z0-9._:-]{1,128}", uid) or uid in seen:
                    raise Refused("mapping-invalid")
                seen.add(uid)
            self.db.execute("UPDATE jobs SET mappings=?,observation=?,token_hash=NULL,expires=NULL WHERE id=?",
                            (canonical(mappings), receipt_digest, job))
            self._event(job, "observed")

    def publish(self, job, current):
        with self.transaction():
            row = self._row(job)
            self._authorized(row, current)
            if row["state"] != "observed":
                raise Refused("generation-not-observed")
            # Revoke the old complete scope atomically with publication. A
            # different scope is independent, never a broader authorization.
            for other in self.db.execute("SELECT id,binding FROM jobs WHERE state='published'").fetchall():
                prior = json.loads(other["binding"])
                if (prior["corpus_id"], prior["scope_digest"]) == (current["corpus_id"], current["scope_digest"]):
                    self._event(other["id"], "revoked")
            self._event(job, "published")

    def read(self, job, current):
        row = self._row(job)
        self._authorized(row, current)
        if row["state"] != "published":
            raise Refused("generation-unavailable")
        return {"binding": {**json.loads(row["binding"]), "projection_id": row["projection"]},
                "mappings": json.loads(row["mappings"]), "observation": row["observation"],
                "sequence": row["sequence"]}

    def quarantine_expired(self):
        with self.transaction():
            rows = self.db.execute("SELECT id FROM jobs WHERE state='running' AND expires<=?", (self.clock(),)).fetchall()
            for row in rows:
                self._event(row["id"], "quarantined")
        return len(rows)

    def quarantine(self, job, token):
        """A failed/ambiguous attempt cannot be promoted or reclaimed."""
        with self.transaction():
            row = self._row(job)
            if row["state"] != "running" or not isinstance(token, str) or not secrets.compare_digest(
                    row["token_hash"] or "", hashlib.sha256(token.encode()).hexdigest()):
                raise Refused("lease-invalid")
            self._event(job, "quarantined")

    def revoke(self, corpus_id):
        """Trusted host operation; deny every derived generation of a corpus."""
        with self.transaction():
            rows = self.db.execute("SELECT id,binding FROM jobs WHERE state NOT IN ('revoked','purged')").fetchall()
            for row in rows:
                if json.loads(row["binding"])["corpus_id"] == corpus_id:
                    self._event(row["id"], "revoked")

    def status(self, job):
        row = self._row(job)
        return {"state": row["state"], "sequence": row["sequence"], "projection_id": row["projection"],
                "retry_allowed": False}

    def mark_purged(self, job):
        """Host calls only after stopped-writer and backend absence checks."""
        with self.transaction():
            row = self._row(job)
            if row["state"] not in ("quarantined", "revoked"):
                raise Refused("purge-state-invalid")
            self.db.execute("UPDATE jobs SET mappings=NULL,token_hash=NULL,expires=NULL WHERE id=?", (job,))
            self._event(job, "purged")
