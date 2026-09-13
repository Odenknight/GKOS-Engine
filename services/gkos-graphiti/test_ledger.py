import copy
import json
import tempfile
import subprocess
import sys
import time
import unittest
from pathlib import Path

from ledger import Ledger, Refused, digest


class ManagedLedgerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name).resolve()
        self.now = 1000.0
        self.store = Ledger(self.root, clock=lambda: self.now, capacity=2)
        self.manifest = [{"source_id": "note-1", "source_digest": digest("source"), "episode_digest": digest("episode")}]
        self.bound = {"corpus_id": "fixture", "scope_digest": digest("scope"), "policy_digest": digest("policy"),
                      "configuration_digest": digest("config"), "source_snapshot_digest": digest(self.manifest)}
        self.mappings = [{"source_id": "note-1", "source_digest": digest("source"), "projection_episode_id": "episode-1"}]

    def tearDown(self):
        self.store.close()
        self.temporary.cleanup()

    def observed(self):
        job = self.store.enqueue(self.bound, self.manifest)
        lease = self.store.claim(job, self.bound)
        self.store.observe(job, lease["token"], self.bound, self.mappings, digest("readback"))
        return job

    def test_duplicate_delivery_and_reopen_preserve_publication(self):
        job = self.observed()
        self.store.publish(job, self.bound)
        result = self.store.read(job, self.bound)
        self.assertEqual(self.store.enqueue(self.bound, self.manifest), job)
        with self.assertRaisesRegex(Refused, "not-queued"):
            self.store.claim(job, self.bound)
        self.store.close()
        self.store = Ledger(self.root)
        self.assertEqual(self.store.read(job, self.bound), result)

    def test_two_connections_cannot_claim_same_job(self):
        job = self.store.enqueue(self.bound, self.manifest)
        other = Ledger(self.root, clock=lambda: self.now)
        try:
            self.store.claim(job, self.bound)
            with self.assertRaisesRegex(Refused, "not-queued"):
                other.claim(job, self.bound)
        finally:
            other.close()

    def test_expiry_never_grants_retry_or_old_worker_publication(self):
        job = self.store.enqueue(self.bound, self.manifest)
        lease = self.store.claim(job, self.bound, seconds=1)
        self.now += 1
        with self.assertRaisesRegex(Refused, "lease-invalid"):
            self.store.renew(job, lease["token"], self.bound)
        self.assertEqual(self.store.quarantine_expired(), 1)
        self.assertEqual(self.store.quarantine_expired(), 0)
        for action in (lambda: self.store.claim(job, self.bound),
                       lambda: self.store.observe(job, lease["token"], self.bound, self.mappings, digest("r")),
                       lambda: self.store.publish(job, self.bound)):
            with self.assertRaises(Refused):
                action()
        self.assertFalse(self.store.status(job)["retry_allowed"])

    def test_lease_secret_and_fresh_policy_are_required(self):
        job = self.store.enqueue(self.bound, self.manifest)
        lease = self.store.claim(job, self.bound)
        with self.assertRaisesRegex(Refused, "lease-invalid"):
            self.store.observe(job, "0" * 64, self.bound, self.mappings, digest("r"))
        stale = {**self.bound, "policy_digest": digest("changed")}
        with self.assertRaisesRegex(Refused, "authorization-stale"):
            self.store.observe(job, lease["token"], stale, self.mappings, digest("r"))
        self.assertEqual(self.store.status(job)["state"], "running")

    def test_partial_and_wrong_source_mapping_cannot_publish(self):
        job = self.store.enqueue(self.bound, self.manifest)
        lease = self.store.claim(job, self.bound)
        for mappings in ([], [{**self.mappings[0], "source_digest": digest("wrong")}],
                         [{**self.mappings[0], "projection_episode_id": "bad\nidentity"}]):
            with self.assertRaises(Refused):
                self.store.observe(job, lease["token"], self.bound, mappings, digest("r"))
        with self.assertRaises(Refused):
            self.store.publish(job, self.bound)

    def test_stale_policy_and_source_deny_previously_published_generation(self):
        job = self.observed()
        self.store.publish(job, self.bound)
        for field in ("policy_digest", "scope_digest", "configuration_digest", "source_snapshot_digest"):
            with self.assertRaisesRegex(Refused, "authorization-stale"):
                self.store.read(job, {**self.bound, field: digest("changed")})
        self.store.revoke("fixture")
        with self.assertRaisesRegex(Refused, "unavailable"):
            self.store.read(job, self.bound)
        with self.assertRaises(Refused):
            self.store.publish(job, self.bound)

    def test_new_revision_replaces_only_its_own_scope(self):
        first = self.observed()
        self.store.publish(first, self.bound)
        first_bound = copy.deepcopy(self.bound)
        self.bound["scope_digest"] = digest("other-scope")
        second = self.observed()
        self.store.publish(second, self.bound)
        self.assertEqual(self.store.status(first)["state"], "published")
        self.bound = {**first_bound, "configuration_digest": digest("new-config")}
        third = self.observed()
        self.store.publish(third, self.bound)
        self.assertEqual(self.store.status(first)["state"], "revoked")
        self.assertEqual(self.store.status(second)["state"], "published")
        self.assertNotEqual(self.store.status(first)["projection_id"], self.store.status(third)["projection_id"])

    def test_queue_bound_and_manifest_binding(self):
        for index in range(2):
            self.store.enqueue({**self.bound, "scope_digest": digest(index)}, self.manifest)
        with self.assertRaisesRegex(Refused, "queue-full"):
            self.store.enqueue(self.bound, self.manifest)
        with self.assertRaisesRegex(Refused, "manifest-binding"):
            self.store.enqueue(self.bound, [{**self.manifest[0], "source_digest": digest("changed")}])

    def test_revocation_fences_running_worker(self):
        job = self.store.enqueue(self.bound, self.manifest)
        lease = self.store.claim(job, self.bound)
        self.store.revoke("fixture")
        with self.assertRaisesRegex(Refused, "lease-invalid"):
            self.store.observe(job, lease["token"], self.bound, self.mappings, digest("r"))

    def test_killed_process_preserves_claim_and_requires_reconciliation(self):
        self.store.clock = time.time
        job = self.store.enqueue(self.bound, self.manifest)
        code = """
import json,sys,time
from pathlib import Path
from ledger import Ledger
store=Ledger(Path(sys.argv[1]))
store.claim(sys.argv[2], json.loads(sys.argv[3]), seconds=1)
print('claimed',flush=True)
time.sleep(60)
"""
        child = subprocess.Popen([sys.executable, '-c', code, str(self.root), job, json.dumps(self.bound)],
                                 cwd=Path(__file__).parent, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            # A bounded reader avoids hanging the suite if the child fails to start.
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                ready = pool.submit(child.stdout.readline)
                try:
                    self.assertEqual(ready.result(timeout=5).strip(), 'claimed')
                except BaseException:
                    child.kill()
                    raise
            child.kill()
            child.wait(timeout=5)
            self.assertEqual(self.store.status(job)['state'], 'running')
            time.sleep(1.1)
            self.assertEqual(self.store.quarantine_expired(), 1)
            with self.assertRaisesRegex(Refused, 'not-queued'):
                self.store.claim(job, self.bound)
            self.assertEqual(self.store.status(job)['state'], 'quarantined')
        finally:
            if child.poll() is None:
                child.kill()
                child.wait(timeout=5)
            child.stdout.close()
            child.stderr.close()


if __name__ == "__main__":
    unittest.main()
