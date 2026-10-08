# Reproducing the audit evidence

This directory contains bounded audit outputs, source-file hashes and diagnostic probes. An output is evidence only for its recorded exact source/environment. These scripts intentionally demonstrate existing failures; successful script execution is not a product-correctness PASS.

## Standard probes

Prepare isolated checkouts of Standard main 71b899473473f47172b181973027f3eb7da25104 and R18 aa9a05315a9a767bd672aa2bb5179c963d9d66ca. Install the conformance/runner dependencies at each exact coordinate, then run standard-boundary-probes.mjs with the two checkout paths as documented in that script. The six missing/malformed gate cases return null and the two invalid canonical inputs are accepted on the audited sources.

## Engine probes

Build an isolated checkout of Engine 8207958047b3361ae21ac07c5a2abbd26a42a684, then run:

    node reports/evidence/engine-reference-probes.mjs <absolute-engine-checkout>

The probe uses only the repository's synthetic service-content fixture and closes its own fixture runtime. It mutates the fixture's source array, not a real vault. Its assertions expect the audited faulty behavior: stale record meaning differs across consumers and temporal continuation skips one row after same-generation removal. After a fix, replace these diagnostic assertions with desired red-then-green product tests; do not freeze faulty behavior as normative parity.

## Observatory rendering probe

Root ran the checked-in viewer-live-browser fixture at Observatory 8da1d2239a9ce0af5570fe1bfa264934d8aabbe4 with existing Playwright 1.61.1 and Chromium 1228. In an isolated copy only, root added a post-event wait/assertion on window.__kosmos.getDiagnostics().agentTraversalHops plus advancing frame/draw-call checks. The existing fixture supplies two different agent IDs with one display label and the same authorized synthetic note path. The result was two archived events but one renderer hop. See the Observatory audit for source links, observed values and the live-test boundary.

This recipe is not a production browser command and uses no real token. Actual request-to-render acceptance still requires an authorized observer connected before a real client call.

## Hindsight snapshot and dependency limits

The source ledger records exact per-file Git blob identities. The private snapshot does not include historical Git objects; its synthetic staged index cannot satisfy tests requiring old commits. Diagnostic PyYAML was added only in the local audit environment, not the repository's declared hash-locked dependency file. The passing 126-test subset is static/oracle/SQL-text evidence, not a repaired full CI lane or live gateway/database qualification.

## Bundle verification

From the bundle root, run node scripts/verify-roadmap.mjs. It verifies local documentation links, file hashes/bytes, JSON, the r4/TS phase inventory and the requested repository references. It uses built-in Node modules, does not write files, and performs no network request. It is a document-bundle check, not application testing. BUNDLE-MANIFEST.json excludes its own recursive self-hash; all other published evidence files are listed.
