# Canonical CBOR development adapter v1

Status: development contract for the first reviewer prerequisite. The owner authorized autonomous development, not profile qualification, production deployment, external review acceptance or new normative meanings. This additive repository-private adapter does not change canonical JSON, root/package exports, Navigation Context Pack standing or existing authorities.

## Controlling inputs

`gkos-standard@b308ff7137bdbb109c31f0ace7e6c49b8988e0d5`, standard/annexes/Canonical_Serialization.md and Diagnostic_Code_Registry.md. RFC 8949 sections 4.2.1/Appendix D; Unicode 17.0.0 normalization. Existing meaning stays in the standard; this is a bounded implementation adapter, not a complete artifact/context/authority schema.

## Owned paths

- Engine implementation workstream: src/canonical-cbor.ts, scripts/build.mjs additive private Node bundle dist/canonical-cbor.mjs.
- Integrator separate-language workstream: scripts/verify-canonical-cbor.py, scripts/requirements-canonical-cbor.txt, scripts/verify-canonical-cbor-cross-language.mjs, test/test_canonical_cbor_python.py, evidence/canonical-cbor-development/.
- Portable development integration: test/canonical-cbor-unicode17.mjs (the unchanged full corpus, run explicitly with `node --test test/canonical-cbor-unicode17.mjs`), test/canonical-cbor-runtime.test.mjs (auto-selected actual-runtime refusal/numeric/public-boundary checks), .github/workflows/canonical-cbor-development.yml (mandatory Ubuntu/Windows Node24 actual-Unicode17 and Python3.11 development lanes), evidence/canonical-cbor-development/integration-*.log. These lanes are DEVELOPMENT only, not qualification; the full corpus is not added to unsupported hosts' current-runtime inventories.
- Shared factory: this contract and test/canonical-cbor-vectors.json, finalized before parallel writes.

The package export map and legacy canonical.ts are unchanged. Provisional ownership identifies technical work, not independent assessment authority. Different-model-family and external acceptance remain unfulfilled.

## Typed values and binary boundary

Export CanonicalNode with these exact kinds:

- {kind:'null'}
- {kind:'boolean',value:boolean}
- {kind:'integer',value:bigint}, range -18446744073709551616 through 18446744073709551615 inclusive
- {kind:'float',value:number}, finite and not negative zero; retain float type when integral
- {kind:'text',value:string}, well-formed UTF-16 input, valid UTF-8 and already NFC under Unicode 17; never normalize silently
- {kind:'bytes',value:Uint8Array}
- {kind:'array',items:CanonicalNode[]}, order preserved
- {kind:'map',entries:[string,CanonicalNode][]}, text keys only, duplicates prohibited, encoder sorts canonical encoded key bytes without mutating input; decoder refuses unsorted keys before generic map conversion

The bounded adapter excludes tags, undefined/simple extensions, bignum tags, non-text map keys and undeclared set semantics. An artifact needing these is unsupported, not silently coerced. An absent entry, null, empty text/bytes/array/map remain distinct. A logical set must be ordered by its future governing schema, not automatically deduplicated here.

APIs: encodeCanonicalCbor(node):Uint8Array; decodeCanonicalCbor(bytes):CanonicalNode; digestCanonicalCbor(bytes):{algorithm:'sha-256',canonical_profile:'GKX-CBOR-1',digest:string}; validateCanonicalTimestamp(text):void. Digest first validates canonical bytes; it is NOT artifact-schema or authority validation. Timestamp validation is explicit schema work: not every arbitrary text field is automatically interpreted as a date.

CanonicalCborError extends Error with code, requirementId and reason. Use L6-001/CANON-001 for malformed/unsupported/oversized/resource-limited/nonshortest heads; L6-002/CANON-002 for duplicate/order keys; L6-003/CANON-003 for invalid/nonshortest floats or invalid typed numeric input; L6-004/CANON-004 for invalid explicit timestamps; L6-005/CANON-005 for invalid text or unavailable Unicode17 validation. The Python rendering verifier additionally uses GKOS-GATE-L6-007 / GKOS-CANON-007 for displayed artifact-hash mismatch and GKOS-GATE-L6-008 / GKOS-CANON-008 for malformed, incomplete or non-round-trippable rendering. These additional mappings are taken from the pinned Diagnostic_Code_Registry.md entries, not newly invented codes. An Error or CLI refusal JSON is NOT a persisted Refusal Receipt.

Default hard limits: at most 1,048,576 encoded bytes, nesting depth 64 (root depth0), and 10,000 total value nodes including map keys. Reject cyclic input, excessive declared lengths before allocation, truncated/trailing bytes and non-Uint8Array boundary inputs. No generic map constructor may hide duplicate keys. Every head is definite and shortest; shortest exact float is binary16, then binary32, then binary64. Strict UTF-8 decoder preserves an initial U+FEFF rather than stripping it. No wall-clock/model/retrieval/host-path input participates.

Canonical timestamps exactly YYYY-MM-DDTHH:MM:SS.ffffffZ; uppercase Z, six digits, real Gregorian date/time, no :60, including leap-year/month limits. Year0000 is refused by this product adapter and declared outside its timestamp domain.

Require the actual runtime Unicode version 17.0/17.0.0 for full text validation; refuse with unicode_profile_unavailable otherwise. Do not allow callers to spoof a Unicode version. This may limit Node22 hosting and must be reported, not hidden or represented as invalid source evidence.

## Typed human rendering and separate Python CLI

Rendering version gkos.cbor.typed-json.v1 is a complete JSON AST: same kinds; integer value is canonical signed decimal STRING, float value is JSON NUMBER, bytes value is lowercase even-length hex STRING, array items and ordered map-entry arrays are recursively typed. No numeric coercion, duplicate entry loss or inserted defaults. Map entries render in decoded canonical order. A wrapper contains rendering_format, algorithm:'sha-256', canonical_profile:'GKX-CBOR-1', digest and node. This is a readable view, never the bytes used for the canonical hash.

Python CLI uses stdlib for CBOR parsing, hashing, floats and JSON, with independently authored logic; no Engine/JS module import. It uses pinned unicodedata2==17.0.1 solely as the Unicode 17.0.0 data provider because the installed Python stdlib reports Unicode 16.0.0. Record this shared-standard data dependency separately from the independent CBOR implementation. `python scripts/verify-canonical-cbor.py --hex HEX` verifies exactly one canonical value and writes the wrapper JSON; `--render FILE` parses that rendering, reencodes, validates its displayed hash and emits the same wrapper plus canonical_hex. Exit0 success, exit1 refusal with {verified:false,code,requirement_id,reason}; no uncaught traceback for malformed input. Python requires unicodedata.unidata_version17.0.0 for Unicode validation and must refuse otherwise. Shared contract/vectors are disclosed; same-family development does not establish assessor independence.

## Acceptance and limits

Test-first fixed positive byte vectors, ordering/duplicates, typed integral float, half/single/double edges, forbidden values, malformed/trailing/truncated CBOR, resource/cycle limits, invalid UTF8/NFC including preserved BOM, timestamp boundaries; complete Python rendering and byte round trip with tampered digest refusal. Exercise both implementations with independent byte inputs, not just one happy path. Official Unicode17 normalization vectors must execute or be explicitly unavailable.

This slice supplies only the canonical-byte primitive and readable cross-check. Selection Envelope/Context Manifest schemas, digest-bound reference applicability, authority/effect/recovery, durable receipts, signing, run isolation and all N00-N19/P01-P10 pilot dispositions remain unqualified. Do not mark N19 PASS from codec unit tests or claim a GCP6/GCP7 profile.
