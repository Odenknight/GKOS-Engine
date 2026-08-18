# Navigation contract 1.0.0

GKOS-Engine 2.1.1 exposes a pure, deterministic Navigation projection.
Identical source snapshot, configuration, policy version, Engine version,
Navigation contract version, and explicit governed inputs produce identical
classifications, candidate bytes, diffs, audit findings, deterministic
predicate outcomes, and context canonical bytes. Candidate content and its
run manifest are separate values; run UUIDs and timestamps cannot affect a
candidate.

The built-in MOC names are exactly `index`, `_index`, `readme`, `moc`, and
`contents` (case-normalized filename stems after removing only `.md` or
`.markdown`). Other MOC-like names are flagged with `MOC_NAME_NONCANONICAL`;
they become recognized only through an explicit human decision and receipted
configuration promotion. Navigation ignores exactly `_archive/moc-runs/**`
after path-separator normalization. It does not ignore other `_archive/**`
content, a root `moc-runs` directory, or similarly named paths.

Navigation can scan, audit, render candidates to stdout, compute semantic/text
diffs (including stable-ID moves), make authorization-filtered context packs,
invalidate affected directory projections, and produce re-entry or promotion
plans. It cannot apply candidates, write or delete source content, archive
content, persist a re-entry record by itself, or infer supersession.

`planReentry` always creates a distinct Layer-1 source with predecessor evidence
linkage. It rejects inherited standing and predecessor mutation/disposition.
Supersession appears only when the caller supplies an explicit authority
declaration. Similarity, confidence, rank, time, UUID order, lexical order, and
graph centrality cannot create the semantic effect.

Discoverability filtering occurs before projection aggregation. `deny`,
`indeterminate`, and policy failure suppress an object and its relationships
without placeholders or count leakage. A Navigation Context Pack always
declares that it is not a GKOS Context Manifest.

Governed metadata may change only through an explicit host-supplied Governance
Store. The store contract is append-only, idempotent, optimistic-
preconditioned, and durability-declaring. A proposed State-Change Receipt role
cannot be reported committed until its durable binding is available.

This is an Engine integration contract, not NAV-002 and not a GKOS/GCP qualification claim.
