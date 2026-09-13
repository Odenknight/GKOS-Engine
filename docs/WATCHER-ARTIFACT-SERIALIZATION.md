# Reuse canonical artifact bytes within one operation

Watcher publication and readback computed an artifact coordinate, including its
canonical bytes, then serialized the same value again. Reuse those freshly
computed bytes. Failed-observation persistence also passes the same buffer to
the existing write/reopen equality check instead of serializing a third time.
There is no cache across operations, no reuse of a prior file read, and no
change to source authorization, canonical encoding, digest checks, byte limits,
physical publication order or persisted-byte verification.

Build and 15 focused tests passed on Windows Node 24.18.0, including recovery,
authority splices, retained-byte mutation, target swaps, sensitivity changes
and unchanged-state preservation. An added check compares coordinate bytes to
canonical persistence for all four artifact kinds with Unicode, numeric keys,
null, negative zero and escaped newlines.

Five alternating-order comparisons on the same retained synthetic 17,596,949
byte graph artifact produced identical bytes. Coordinate-plus-serialization
took 789–1,019 ms before and 396–439 ms with reuse. The local receipt is
watcher-artifact-comparison.json; this measures only that operation.

The actual 2,000-note file-event smoke at c5da942 still failed the unchanged
2,000 ms gate: activation took 19,994 ms. Its receipt remains at
graphiti-watcher-artifact-smoke/receipt.json. Earlier single observations were
faster; no end-to-end speedup or full qualification is claimed. Broader paired
measurement is still needed. No 24-hour soak has passed.

Three subsequent clean-main/candidate pairs alternated execution order, using
the same runner and unchanged budget on isolated 2,000-note corpora:

| Pair | Main activation ms | Candidate activation ms |
| --- | ---: | ---: |
| 1 | 17,869.72 | 18,130.02 |
| 2 (candidate first) | 16,742.74 | 16,421.15 |
| 3 | 17,949.92 | 16,483.34 |

Every run failed the 2,000 ms gate. Candidate mean was approximately 2.9% lower,
but this small, variable sample does not establish a reliable end-to-end gain.
The duplicate-serialization operation improves in isolation; the dominant
activation cost remains unresolved. Exact source/artifact bindings and raw
receipts remain in watcher-artifact-pair-{1,2,3}-{baseline,candidate}; aggregate
summary: watcher-artifact-paired-summary.json. The follow-up remains a draft.

A separate UTF-16 validation experiment showed overlapping timings and was not
adopted. The canonical validation implementation and its rejection policy are
unchanged. Current main's managed live integration pass remains separate from
these unresolved performance gates.
