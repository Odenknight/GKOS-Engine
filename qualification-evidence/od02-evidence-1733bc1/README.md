# OD-02 executed evidence

Implementation: signed commit1733bc1e2fec4b3f661c65dd59502cfc63c4fd3f, isolated
feature/documentation-digest-verifier-od02, based on main650eab4. Not merged into
release candidate ea05531. Supersedes:none. No standard edits or submission.

Commands and observed results:
- npm ci --ignore-scripts:PASS (Windows and Linux).
- node --test test/documentation-verifier.test.mjs:11PASS on Windows24.18.0 and
  native Linux22.23.2. windows-tests.log / linux-tests.tap.
- npm run typecheck; npm run build; npm run pack:check:PASS Windows.
- npm run check:license; npm run check:nomenclature:PASS Windows.
- checkInventory() from scripts/runtime-qualification.mjs:PASS before commit.
- git diff --check:PASS; git verify-commit HEAD:good ED25519 git signature for
  oden@odenknight.com, fingerprint SHA256:dwwxvq69ZWPDlS6bzlvZ0uXo76ZKTRqvMSmDGhABhfM.

intact-result.json and tampered-result.json were executed through the committed
verifier. documentation-artifact.json retains independently supplied expected
pins. tampered/ contains the six historical public files with only READMEbyte2
changedGtoH. confidence-schema-result.json records rejection of reason-code-only
input against the pinned actual schema. evidence.json binds implementation and
schema hashes. These are Engine-specific results and schema-validation evidence,
not a live standard RefusalReceipt, gate registration, canonical-CBOR digest
attestation, signature endorsement, profile qualification or release claim.

Reproduce the deliberate failure from the isolated Engine clone:
node scripts/verify-documentation-artifact.mjs <this-directory>/documentation-artifact.json <this-directory>/tampered
Expected exit1, DOCUMENTATION_DIGEST_MISMATCH, independently pinned manifest
e8ac5777da6585367292bf1e621b73f8a75c2152179fee5f2836ba79df6e5b8a.