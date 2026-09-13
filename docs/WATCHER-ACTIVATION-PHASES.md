# Activation phase diagnosis and detached child validation

September 13, 2026, Windows Node 24.18.0. Instrumented synthetic diagnostics
separated startup from one real file edit in a 2,000-note corpus. They identify
costs; instrumented timings are not qualification receipts.

| Edit phase | PR60 diagnostic ms | Candidate diagnostic ms |
| --- | ---: | ---: |
| Secure source scan | 2,387 | 3,108 |
| Validation plan | 923 | 1,016 |
| Retrieval staging | 3,205 | 3,140 |
| Activation derivation | 2,543 | 2,637 |
| Publication total | 5,132 | 4,691 |
| Bundle sealing, included in publication | 4,388 | 3,994 |

Publication's main cost was bundle validation, not physical journal writes.
The public bundle sealer already creates a fully validated, detached canonical
JSON copy of the entire input. It then reserialized and recopied individual
children. A private helper now validates those owned children directly, keeping
every schema, digest, relation and cross-artifact check. The public individual
record sealer still performs its original canonical copy. No caller-owned or
cached object can enter the private path, and outputs remain deeply frozen.

Build and 33 tests passed, including frozen conformance, publication/recovery,
tamper rejection, detached output and sensitivity changes. New adversarial tests
exercise nested proxies and getters without invoking them, array children and
corrupt child digests. No frozen contract artifacts or public exports changed.

PR60 diagnostic source was 28e6cbdb4e264a81bc9658f369501cb4812a83ca; candidate
source was 67d2d5e. The candidate's uninstrumented file-event smoke took
15,906 ms and failed the unchanged 2,000 ms gate. Single phase observations
suggest a local saving but cannot establish a reliable end-to-end gain.
Multiple phases independently exceed the full gate; further work is required.

Local evidence: watcher-phase-profile, watcher-publication-profile,
watcher-publication-profile-candidate (each binds instrumentation and receipts),
watcher-bundle-smoke/receipt.json, watcher-bundle-tests.log. Raw source and
artifact hashes are retained there. No 24-hour or production pass is claimed.
