# GKOS-Engine functional uplift — Phase 2 evidence draft

Date: 2026-08-21

Repository: Odenknight/GKOS-Engine

Phase scope: canonical lineage-anchored retrieval provenance, live citations,
and point-in-time selection stacked additively on the qualified Phase 1 head.

Final Phase 2 terminal state: **UNASSIGNED**. Implementation and qualification
are complete locally, but hosted qualification is not yet assigned or run. The
owner has ratified Decision A for authorization-dependent cross-record
identity, endpoint resolution, declaration reconciliation, and topology/order
diagnostics. The exact draft.2 contract pack is now **FROZEN LOCALLY** at the
eight hashes below and awaits Lite's exact-byte reciprocal review before any
publication. No Phase 2 commit, push, pull request, hosted CI, merge, tag,
release, deployment, or production activation is claimed.

## Coordinates

| Coordinate | Value |
| --- | --- |
| Stacked base / Phase 1 evidence head | `0164f3d5b2c698cbf048c8e0e53323def80eb251` |
| Working branch | `codex/phase-2-lineage-citations` |
| Full implementation commit | Not assigned; worktree is intentionally uncommitted |
| Retrieval contract | `gkos-retrieval/1.0.0-draft.2` |
| Result schema | `gkos-retrieval-result/1.0.0-draft.2` |
| Provenance contract | `gkos-retrieval-provenance/1.0.0-draft.1` |
| Projection schema | 3 |
| Standard study commit | `a2a2a6ca5c4dac32c6d9dc985ed7460f5f4350c6` |
| Projection profile | `gkx-2.3-validating-projection` |
| Local pack state | Frozen at the eight SHA-256 values below |
| Hosted CI state | Unassigned / not run |

Schema 2 and the public Phase 1 builder remain unchanged. Schema 3 explicitly
binds the Standard commit and projection profile in its manifest, physical
projection digest, open verification, and authorization-scoped result
coordinate.

## Frozen contract coordinates and hashes

The eight-file draft.2 pack was byte-hashed only after the final Decision-A
runtime, full-envelope fixture, schema, cross-runtime, package, and hygiene
gates completed locally. Every file is UTF-8 and has exactly one terminal LF.
The evidence file is outside the pack, so recording these values creates no
self-hash dependency.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `chunk.schema.json` | 3535 | `d1ffd008bf360807d50494bc34610670732ee9fb61ed15fcd8f0aee7496a6fab` |
| `conformance-fixture.json` | 35230 | `eb4b77590ae3d113a129f5f9baa7adb77737789d3fc1dfbcd8e9aa6ec353ae61` |
| `contract.json` | 9657 | `203ba5d54e1eeecd88a4d706f0394f9b517667194bb78e4f197911ac0358d4d5` |
| `projection.schema.json` | 2512 | `97ae4481f3780536de4ba743fc0f7067f342f6ca8ce69b8a976ed1894a5ee753` |
| `provenance.schema.json` | 3014 | `bcad32df33e5fe3e28aa85f4674b7c9eec92bf6e05c14a7d8a1858808231fb84` |
| `README.md` | 11601 | `cf983c2e6269a856aece443f9cf16c0fafbe024ebc00714154838c7e0a7618ec` |
| `result.schema.json` | 5940 | `a12f1ba4a25ab746425fc279425e92579812beb5879d1b8d778571539198eb97` |
| `stored-provenance.schema.json` | 4798 | `de3261a093e65cba11cc05490947c914a9a3f880183b0a1cf2f52ef1dfd5a861` |

## Implemented Decision-A checkpoint scope

- one canonical `GkxIndex` projection per corpus with descriptor-safe source
  inputs, normalized portable paths, canonical UIDs, source-byte digests, and
  deterministic time/reference inputs;
- internal candidate persistence for every intrinsically accepted parser
  candidate, including duplicate UID/path/public-chunk identities and valid
  zero-chunk/frontmatter-only candidates, with parser-owned declaration and
  resolver-tier receipts retained before any destructive compatibility map;
- flat public `GkxRetrievalProvenance` on every hit and content-bearing parent,
  with exact assertion/content digests, scoped intervals, authorized resolved
  UIDs, redacted-envelope digest, the pinned profile's required null lineage
  ID, and no
  fabricated ledger binding;
- strict candidate/provenance invariants and schema-3 reopen verification,
  including metadata/assertion equality, normalized UTC timestamps, exact
  candidate/declaration/chunk/vector/eligibility counts and canonical JSON,
  FTS row bijection and tokenizer binding, finite metadata quality in `[0,1]`
  for represented and zero-chunk candidates, projection digests, and tamper
  rejection;
- source policy, typed filters, and whole-source sanitized chunk policy before
  explicit-`as_of` known-created partitioning and authorization-scoped
  identity, resolution, declaration, topology, and temporal projection;
- ratified Decision-A noninterference for all four cross-record classes:
  hidden/future candidates are byte-identical to physical absence in complete
  ordinary results, while all-authorized known-created conflicts return only
  `RETRIEVAL_AUTHORIZED_VIEW_CONFLICT` before live/query-provider/SQL/ranking/
  count/confidence/citation work; unknown candidates contribute only temporal
  coverage and a known conflict wins over simultaneous insufficient coverage;
- policy-digest-bound embedding eligibility persisted as a schema-3 projection
  invariant, so denied source text is never sent to a configured provider and
  a runtime policy/eligibility mismatch fails closed before retrieval work;
- a shared path-security scanner boundary with Windows 8.3-safe canonical
  containment, explicit reparse/symlink/junction and hard-link rejection,
  bounded reads, pre/post file-identity sealing, and fatal UTF-8 decoding before
  canonical projection or provider invocation;
- exact current Engine/GKX `as_of` grammar and UTC normalization, delegated
  half-open selection through the existing temporal projector, stable
  insufficient-coverage behavior, and zero-chunk historical coverage;
- live source digest/UTF-8 byte/line revalidation and exact Unicode matched
  spans, with zero-based half-open byte coordinates `[start_byte,end_byte)`,
  one-based inclusive line coordinates, and source files remaining
  byte-for-byte unchanged;
- complete serialized-result byte accounting, including provenance and parent
  assertions; and
- a sealed public retrieval surface: raw stores, stored authored references,
  provenance sealers, and trusted host publication helpers are not exported by
  `gkos-engine/retrieval`.

Provider selection remains provider-neutral and trusted-configuration-only.
No vendor, domain, route, or model allowlist/preference was added. No source
write, REST/MCP transport, watcher, durable ledger, or authored temporal alias
was introduced.

## Current local evidence

Final current-tree local qualification results:

- exact Node `22.23.2`, `23.11.1`, and `24.18.0` TypeScript no-emit and
  deterministic bundle builds: PASS on each runtime;
- full repository suite: **404/404**, 0 skipped, on each of Node `22.23.2`,
  `23.11.1`, and `24.18.0`;
- complete `test/retrieval-*.test.mjs` focus: **143/143**, 0 skipped, on each
  of the three runtimes;
- Navigation/governance/public-API focus: **44/44**, 0 skipped, on each of the
  three runtimes;
- exact provenance/temporal/CLI focus: **45/45**, 0 skipped; Decision-A
  authorized-view focus: **33/33**, 0 skipped; candidate/schema3 plus schema2
  store focus: **41/41**, 0 skipped;
- executable Draft 2020-12 schema/reference/full-envelope gate: **18/18**;
- provider configuration, route, timeout, and credential privacy focus:
  **13/13**;
- intelligence service contracts: **4/4**;
- nomenclature and Apache-2.0 license gates: PASS;
- sequential package gate: **231 files / 696048 bytes**, including the
  required host-only and path-security bundles; and
- `git diff --check`: PASS, with only Git's normal Windows line-ending
  advisories; staged diff: empty.

The repository suite uses exactly pinned `ajv` 8.20.0 plus `ajv-formats`
3.0.1 in Draft 2020-12 mode, resolves relative schema references, and validates
the complete fixture manifest/result/chunk/public-provenance envelopes. It also
rejects nested type drift, forbidden ledger fields, incorrect Standard/profile
constants, unsafe reason codes, and broken references. The fixture now binds
exact physical candidate sources, parser-owned declaration receipts,
candidate-key embedding eligibility, both lexical backend coordinates, and
the full authorization-scoped result. Its ratified matrix freezes hidden/future
equivalence to physical absence and one all-authorized generic conflict for all
four classes. The eight pack files now match the local frozen hash table above;
exact-byte reciprocal review is outstanding.

Focused scans continue to prohibit removed-provider references, vendor/model/
route/domain allowlists, credential signatures, retrieval-to-Navigation
imports, raw candidate keys/refs on ordinary public surfaces, and merge
markers. The CLI source-byte fixture confirms point-in-time search leaves every
note byte-identical. Node 23 capability branches remain always-run and prove
`SQLITE_FTS5_UNAVAILABLE` before state; capable runtimes execute the exact FTS5
tamper and full-envelope paths. Static results are zero forbidden Hypatia/GCOS
provider references, zero prohibited routing-config identifiers, zero
retrieval-to-Navigation imports, and zero merge markers. The Phase-1 draft.1
contract directory has an empty byte diff against qualified base
`0164f3d5b2c698cbf048c8e0e53323def80eb251`.

## Reciprocal checkpoint reviews

Earlier topology-independent Full/Lite approvals remain valid historical
checkpoints but did not decide the cross-record boundary. After Decision A was
ratified, the following bounded Full slices received fresh Lite read-only
approval with no blocker, high, or medium finding:

- the package-private canonical candidate ledger/resolver layer, including
  failure-atomic incremental updates, deterministic multiplicity/renames,
  exact existing resolver precedence, hidden-cause absence equivalence, and
  unchanged public graph/Phase-0 behavior; and
- schema-3 candidate persistence, including strict candidate-only input,
  candidate-named counts, exact declaration shapes, zero-chunk and duplicate
  candidates, vector conflict invariants, FTS key bijection/tokenizer binding,
  canonical persisted JSON, reopen/tamper checks, and unchanged schema-2
  contract surface; and
- the ratified Decision-A coordinator/search and CLI tranche, including exact
  policy/filter/time ordering, candidate-key SQL/provider gating, hidden/future
  full-envelope noninterference, generic all-authorized conflict, scoped
  provenance/coordinates, schema3 CLI publication, and coherent contract/docs/
  evidence semantics.

Lite independently replayed typecheck/build, the canonical candidate focus,
the 41-test schema3/schema2 store focus, and a 146-test combined coordinator/
candidate/store/public/Phase0/provenance/temporal/CLI focus for those approvals.
The last review found no blocker, high, or medium issue and made no edits. The
new local cross-runtime qualification and final eight-file hash table now await
Lite's exact-byte implementation/pack review; no approval has authorized
publication.

## Ratified Decision A

The owner ratified authorization-scoped evaluation for every cross-record
class whose hidden presence could otherwise change a visible record:

| Ratified class | Canonical signals/examples | Normative retrieval outcome |
| --- | --- | --- |
| Canonical identity collision | duplicate UID/path/parser fingerprint/public chunk identity | Hidden/future equals absence; all authorized conflicts generically |
| Endpoint resolution | unresolved/ambiguous UID, title, path, or wikilink | Exact existing scoped tier precedence; hidden/future equals absence; all authorized governed declarations conflict generically |
| Declaration reconciliation | forward/inverse/conflicting lineage or governed typed declarations | Hidden/future equals absence; all authorized conflicts generically |
| Topology and ordering | cycle, multiple successor, successor-before-predecessor | Hidden/future equals absence; all authorized conflicts generically |

The generic outcome is exactly `RETRIEVAL_AUTHORIZED_VIEW_CONFLICT` and occurs
before live source reads, lexical/vector SQL, query provider/reranker calls,
ranking, result counts, confidence, citations, or parent expansion. It exposes
no conflict class, count, UID, path, raw reference, candidate key, or physical
coordinate. Unknown candidates contribute only the scoped temporal coverage
bit; future candidates are silently suppressed; a known-created conflict wins
over simultaneous insufficient coverage. Ordinary broken links are not
governed lineage conflicts. Intrinsic source syntax/schema/timestamp failures
remain per-candidate prepublication rejections, while resolution-dependent
self classification occurs after scoped canonical tier selection.

## Publication state

No files are staged. No commit, push, PR, merge, tag, release, deploy, service
restart, provider provisioning, or source-content mutation has occurred. Phase
2 remains terminal `UNASSIGNED`: the exact contract is locally frozen and
cross-runtime local qualification is complete, but Lite's final exact-byte
review and required hosted qualification must complete before `DONE`.
