"""Real process exits at ledger transaction boundaries; synthetic metadata only."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from ledger import Ledger, Refused, digest


class TransactionCrashTests(unittest.TestCase):
    def test_corpus_revocation_survives_reopen_and_covers_every_active_state(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            store = Ledger(root)
            jobs = []
            manifest = [{"source_id": "fixture", "source_digest": digest("source"), "episode_digest": digest("episode")}]
            mappings = [{"source_id": "fixture", "source_digest": digest("source"), "projection_episode_id": "episode"}]
            for corpus in ("target", "independent"):
                for state in ("queued", "running", "observed", "published", "quarantined", "purged"):
                    bound = {"corpus_id": corpus, "scope_digest": digest(state), "policy_digest": digest("policy"),
                             "configuration_digest": digest("config"), "source_snapshot_digest": digest(manifest)}
                    job = store.enqueue(bound, manifest)
                    if state != "queued":
                        lease = store.claim(job, bound)
                        if state in ("observed", "published"):
                            store.observe(job, lease["token"], bound, mappings, digest("receipt"))
                            if state == "published":
                                store.publish(job, bound)
                        if state in ("quarantined", "purged"):
                            store.quarantine(job, lease["token"])
                            if state == "purged":
                                store.mark_purged(job)
                    jobs.append((job, bound, state))
            store.revoke("target")
            store.close()
            store = Ledger(root)
            try:
                for job, bound, prior in jobs:
                    expected = "revoked" if bound["corpus_id"] == "target" and prior != "purged" else prior
                    self.assertEqual(store.status(job)["state"], expected)
                    if expected == "published":
                        self.assertEqual(store.read(job, bound)["mappings"], mappings)
                    else:
                        with self.assertRaises(Refused):
                            store.read(job, bound)
                    if bound["corpus_id"] == "target":
                        for action in (lambda: store.claim(job, bound), lambda: store.publish(job, bound)):
                            with self.assertRaises(Refused):
                                action()
                count = store.db.execute("SELECT COUNT(*) FROM events").fetchone()[0]
                store.revoke("target")
                self.assertEqual(store.db.execute("SELECT COUNT(*) FROM events").fetchone()[0], count)
            finally:
                store.close()

    def test_crash_before_and_after_commit_preserves_atomic_authority(self):
        for operation in ("observe", "publish", "revoke", "purge"):
            for committed in (False, True):
                with self.subTest(operation=operation, committed=committed), tempfile.TemporaryDirectory() as directory:
                    root = Path(directory).resolve()
                    store = Ledger(root)
                    manifest = [{"source_id": "fixture", "source_digest": digest("source"), "episode_digest": digest("episode")}]
                    bound = {"corpus_id": "fixture", "scope_digest": digest("scope"), "policy_digest": digest("policy"),
                             "configuration_digest": digest("config"), "source_snapshot_digest": digest(manifest)}
                    mappings = [{"source_id": "fixture", "source_digest": digest("source"), "projection_episode_id": "episode"}]

                    def observed(current):
                        job = store.enqueue(current, manifest)
                        lease = store.claim(job, current)
                        store.observe(job, lease["token"], current, mappings, digest("receipt"))
                        return job

                    old = observed(bound)
                    store.publish(old, bound)
                    current = {**bound, "configuration_digest": digest("replacement")}
                    job = store.enqueue(current, manifest)
                    lease = store.claim(job, current)
                    if operation != "observe":
                        store.observe(job, lease["token"], current, mappings, digest("receipt"))
                    if operation in ("revoke", "purge"):
                        store.publish(job, current)
                    if operation == "purge":
                        store.revoke("fixture")
                    before = {key: store.status(key) for key in (old, job)}
                    events_before = store.db.execute("SELECT COUNT(*) FROM events").fetchone()[0]
                    store.close()
                    payload = dict(root=str(root), job=job, current=current, token=lease["token"], mappings=mappings,
                                   operation=operation, committed=committed)
                    child = subprocess.run([sys.executable, "-c", """
import json, os, sys
from pathlib import Path
from ledger import Ledger, digest
p = json.load(sys.stdin)
store = Ledger(Path(p['root']))
if not p['committed']:
    original = store._event
    def interrupted(*args):
        original(*args)
        os._exit(73)
    store._event = interrupted
if p['operation'] == 'observe':
    store.observe(p['job'], p['token'], p['current'], p['mappings'], digest('receipt'))
elif p['operation'] == 'publish':
    store.publish(p['job'], p['current'])
elif p['operation'] == 'revoke':
    store.revoke('fixture')
else:
    store.mark_purged(p['job'])
os._exit(73)
"""], input=json.dumps(payload), text=True, capture_output=True, timeout=10, cwd=Path(__file__).parent)
                    self.assertEqual(child.returncode, 73, child.stderr)
                    store = Ledger(root)
                    try:
                        self.assertEqual(store.db.execute("PRAGMA integrity_check").fetchone()[0], "ok")
                        if not committed:
                            self.assertEqual({key: store.status(key) for key in (old, job)}, before)
                            self.assertEqual(store.db.execute("SELECT COUNT(*) FROM events").fetchone()[0], events_before)
                        else:
                            expected = dict(observe="observed", publish="published", revoke="revoked", purge="purged")[operation]
                            self.assertEqual(store.status(job)["state"], expected)
                            if operation == "publish":
                                self.assertEqual(store.status(old)["state"], "revoked")
                                self.assertEqual(store.read(job, current)["mappings"], mappings)
                            self.assertGreater(store.db.execute("SELECT COUNT(*) FROM events").fetchone()[0], events_before)
                        for key, binding in ((old, bound), (job, current)):
                            if store.status(key)["state"] != "published":
                                with self.assertRaises(Refused):
                                    store.read(key, binding)
                            with self.assertRaises(Refused):
                                store.claim(key, binding)
                    finally:
                        store.close()


if __name__ == "__main__":
    unittest.main()
