# Documentation digest verifier — OD-02

Status: executed isolated implementation for review. Eleven focused Windows tests pass; exact commit and machine-readable examples are recorded in the external OD-02 evidence bundle.
Supersedes: none.

The owner approved an Engine-first verifier on September 8, 2026. This change
branches from main 650eab4 and is separate from release candidate ea05531. It does
not register a gate, modify gkos-standard, or qualify a profile or release.

Run after `npm ci --ignore-scripts`:

```
node --test test/documentation-verifier.test.mjs
node scripts/verify-documentation-artifact.mjs test/fixtures/documentation-verifier/artifact.json test/fixtures/documentation-verifier/v2.1.1
node scripts/validate-refusal-receipt-v081.mjs path/to/claimed-receipt.json
```

The first CLI reads exact bytes from a caller-selected local directory. It checks
each declared SHA-256 and the SHA-256 of the ordered GNU sha256sum manifest, with
LF delimiters. It never normalizes source newlines or accepts a generated digest
as its own expected value. A declaration whose per-file pins disagree with its
manifest pin is refused before source reads. Bounds: 64 files, 16 MiB per file,
64 MiB total, 1 MiB input JSON. File paths are relative and restricted; aliases,
hard links and observed changes during reads are refused. This local tool is
not a hostile-filesystem service or a replacement for source-origin attestation.

Output contains indexed digests and status, without source text or private paths.
Exit codes: 0 match, 1 mismatch, 2 invalid/unreadable input. Its result is an
Engine-specific digest verification record, **not a GKOS RefusalReceipt**.
Verification establishes agreement with the supplied declaration, not that the
declaration, repository revision, signature or publisher is authentic.

## Pinned example and independent negative

The six v2.1.1 files come from raw Git blobs at
f4dfda16eac746c667cf042f908a918d9acc6713, without Windows newline conversion.
The manifest pin from the S-01 annex is
`1d2ae51f89ce52714e318ff5a0246cc885442c87d985de2752aec00031edd754`.
The negative changes README byte offset 2 from 0x47 to 0x48. Independently supplied
negative pins are README `ba33b0c99d163ae81531bbe5de82474e35e5b4279cdf4d5e32344738dd016d0e`
and manifest `e8ac5777da6585367292bf1e621b73f8a75c2152179fee5f2836ba79df6e5b8a`.
Tests assert those fixed values. The artifact's Supersedes remains none; no
publication or supersession history is created.

## Claimed refusal receipts

The separate validator uses Ajv draft 2020-12 plus date-time formats against the
unaltered v0.81 schema, schema version 1.0.0, standard commit
8f2a158c6d4b8cabd907d98765766d281aec1247. Both schema files are SHA-256 checked
before compilation. Exact pins and upstream provenance are in
contracts/documentation-verifier/v0.81/provenance.json; Apache-2.0 license and
upstream notice are preserved there. No network schema lookup occurs.

Exit codes: 0 schema valid, 1 schema invalid, 2 invalid input/schema pin failure.
Schema validity does not prove registered gate or requirement identifiers,
canonical CBOR set ordering, digest correctness, actor authority, signatures,
independence, endorsement or profile coverage. `x-gkx-set-order` is an annotation
here; its CBOR semantics are not implemented by this JSON validator. The synthetic
positive test uses explicitly artificial identifiers and zero digest values;
it is a syntax test, not a receipt for a real operation. Raw documentation SHA-256
must not be relabeled as a GKX-CBOR-1 digest.

NO_ELIGIBLE_RESULTS is a confidence reason code and fails receipt validation.
The proposed annex shape with actor_context as an object, input_refs.ref, or an
extra diagnostic field fails the actual schema. actor_context must be an array;
artifact references need artifact_id, artifact_version and a typed digest. The
schema requires canonical six-fractional-digit UTC timestamps. It does not
require receipt_id to be UUIDv7, so this validator makes no such extra claim.
No live v0.81 RefusalReceipt is emitted by this change. Gate/requirement registration
remains a separately reviewed possible v0.82 change.