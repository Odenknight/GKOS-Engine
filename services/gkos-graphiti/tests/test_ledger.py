import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("ledger", ROOT / "ledger.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
Ledger = module.Ledger
DIGEST = "sha256:" + "a" * 64
BINDING = dict(corpus_id="synthetic", scope_digest=DIGEST, policy_digest=DIGEST,
               source_snapshot_digest=DIGEST, projection_id="generation-1", configuration_digest=DIGEST)
JOB = dict(source_id="source-1", source_digest=DIGEST, event="upsert", origin="authored", adapter_version="fixture-1", payload_digest=DIGEST)


class LedgerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "ledger.sqlite"
        self.ledger = Ledger(self.path, capacity=2, create=True)

    def tearDown(self):
        self.ledger.close()
        self.temp.cleanup()

    def test_identity_duplicate_revision_and_capacity(self):
        first = self.ledger.enqueue(BINDING, JOB)
        self.assertTrue(self.ledger.enqueue(BINDING, JOB)["duplicate"])
        changed = self.ledger.enqueue(BINDING, {**JOB, "source_digest": "sha256:" + "b" * 64})
        self.assertNotEqual(first["id"], changed["id"])
        with self.assertRaisesRegex(ValueError, "capacity"):
            self.ledger.enqueue(BINDING, {**JOB, "source_id": "third"})

    def test_claim_is_exclusive_across_connections_and_readback_is_exact(self):
        job = self.ledger.enqueue(BINDING, JOB)["id"]
        claim = self.ledger.claim(job)
        other = Ledger(self.path)
        try:
            with self.assertRaises(ValueError):
                other.claim(job)
        finally:
            other.close()
        for token, digest in [("wrong", DIGEST), (claim, "sha256:" + "b" * 64)]:
            with self.assertRaises(ValueError):
                self.ledger.observe(job, token, "episode-1", digest)
        self.ledger.observe(job, claim, "episode-1", DIGEST)
        self.assertEqual(self.ledger.status(job)["state"], "verified")
        self.assertFalse(self.ledger.status(job)["searchable"])

    def test_revoke_fences_late_commit_and_duplicate_enqueue(self):
        job = self.ledger.enqueue(BINDING, JOB)["id"]
        claim = self.ledger.claim(job)
        self.ledger.revoke(BINDING)
        self.assertEqual(self.ledger.status(job)["state"], "revoked")
        with self.assertRaises(ValueError):
            self.ledger.observe(job, claim, "episode", DIGEST)
        with self.assertRaises(ValueError):
            self.ledger.enqueue(BINDING, JOB)

    def test_process_crash_after_durable_claim_never_retries(self):
        job = self.ledger.enqueue(BINDING, JOB)["id"]
        code = "import sys,os;sys.path.insert(0,sys.argv[1]);from ledger import Ledger;l=Ledger(sys.argv[2]);l.claim(sys.argv[3]);os._exit(17)"
        result = subprocess.run([sys.executable, "-c", code, str(ROOT), str(self.path), job], check=False)
        self.assertEqual(result.returncode, 17)
        self.assertTrue(self.ledger.status(job)["requires_reconciliation"])
        with self.assertRaises(ValueError):
            self.ledger.claim(job)

    def test_ambiguity_and_missing_store_remain_explicit(self):
        job = self.ledger.enqueue(BINDING, JOB)["id"]
        self.ledger.ambiguous(job, self.ledger.claim(job))
        self.assertTrue(self.ledger.status(job)["requires_reconciliation"])
        with self.assertRaises(ValueError):
            self.ledger.claim(job)
        with self.assertRaisesRegex(ValueError, "initialization"):
            Ledger(Path(self.temp.name) / "missing.sqlite")

    def test_empty_existing_database_is_not_silently_initialized(self):
        empty = Path(self.temp.name) / "empty.sqlite"
        empty.touch()
        with self.assertRaisesRegex(ValueError, "initialization"):
            Ledger(empty)

    def test_corrupt_identity_is_not_a_verified_job(self):
        job = self.ledger.enqueue(BINDING, JOB)["id"]
        self.ledger.db.execute("UPDATE jobs SET definition=? WHERE id=?", (json.dumps({**JOB, "source_id": "corrupt"}), job))
        with self.assertRaisesRegex(ValueError, "corruption"):
            self.ledger.status(job)


if __name__ == "__main__":
    unittest.main()
