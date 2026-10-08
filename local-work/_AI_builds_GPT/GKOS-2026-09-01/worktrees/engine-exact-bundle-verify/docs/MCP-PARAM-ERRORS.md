# INVALID_PARAMS diagnostics candidate

This is a validation-only follow-up to Engine PR #37, commit
`433fd01e5e49772b80da784e72dc8cbce1459c16`. It does not modify authentication,
admission, rate limiting, authorized-view conflicts, or reference resolution.
Malformed reference **syntax** is a schema error; well-shaped unavailable
references retain the existing refusal behavior.

## Wire contract and migration

Only `GKOS_P6_INVALID_PARAMS` tool errors receive `param_errors` and
`contract_version: 1.0.0-draft.3`. The historical draft.2 envelope is closed,
so the implementation does not represent this new shape as draft.2 conformant.
The existing `parameter_issues` array is retained for deployed consumers.
The bounded candidate schema is [mcp-invalid-params-draft3.schema.json](mcp-invalid-params-draft3.schema.json).
This is a proposed error-envelope revision, not ratification of an entire new
identity contract. Historical contract packs, hashes and guards remain untouched.

`gkos_capabilities.discovery.invalid_params_contract` advertises the version,
16-entry bound, closed reason enum and unknown-key aggregation. This capabilities
metadata and its recomputed result digest are the necessary, explicit exception
to the handoff's otherwise byte-identical successful-response requirement.
Other successful tool responses, result-digest computation and non-INVALID_PARAMS
errors are unchanged. `tools/list` additionally publishes the static guidance as
`x-gkos-param-help` at the object and field levels. Exact-key clients must accept
the new error contract before using this candidate. Production promotion is separate.

`error_digest` still hashes canonical JSON of the complete unsigned error envelope.
New diagnostic fields therefore change its bytes, not its algorithm or meaning.
It remains a digest, not a source of authority or an encoded explanation.

## Diagnostic rules

- `reason` is one of `missing`, `malformed`, `out_of_range`, `unknown_param`.
- `expected` and `hint` are checked-in literals in the MCP schema module. No
  submitted values are echoed, even for otherwise permissible scalar inputs.
- Validate all present and required fields before dispatch. One entry per
  failing published field, plus one `$` entry for all unknown field names.
  This preserves privacy even if unknown keys contain credentials or note paths.
- All ten current tools use the same validator and envelope; the original
  nine-tool handoff predates `gkos_record_resolve`.
- Schema-owned text and names only. No source lookup, authorization state,
  vault contents, note digests, reference values or unknown key names enter the
  diagnostics. Array members are summarized at the parent parameter.
- The current maximum is six schema fields plus one unknown-field aggregate;
  the limit is 16. A schema-growth regression prevents silently truncating errors.
- The legacy temporal/audit handling of a well-shaped unavailable scope still
  returns INVALID_PARAMS. In that case `param_errors: []` says no published
  parameter constraint failed. Inventing a malformed-field explanation would
  disclose state or be false; changing the legacy code is explicitly out of scope.

Nullable cursors remain **required**, with the static hint “Pass null explicitly
for the first page.” No default or pagination binding changes. Query timestamps
already accept optional fractions, including `2026-08-24T00:00:00Z`. The existing
millisecond-precision subset is preserved: real calendar dates, explicit UTC or
numeric offsets, optional 1–3 fractional digits; no leap seconds, naive times or
finer precision. This is not a claim to implement every RFC3339 variant.

## Verification

`test/service-param-errors.test.mjs` covers all seven handoff cases plus combined
structural/semantic failures, 2,000 unknown keys, static numeric guidance, and
closed-envelope validation. The negative disclosure test checks both MCP content
forms and the emitted traversal event. Existing cross-surface secret canaries
and authorization/retrieval tests remain applicable.

`test/fixtures/param-errors-before.json` contains only synthetic data captured
from the unmodified PR #37 runtime before this change. The harness fixes time and
randomness in its test process and compares serialized responses, including
digests, for ten successful calls and four refusals. Capabilities comparisons
remove only the explicitly added metadata and recalculate the baseline digest;
all other responses are compared without normalization. Search uses a synthetic
empty retrieval result in this compatibility test; actual FTS5 is separately
covered by the existing retrieval regressions.

Run after `npm run build`:

```sh
node --test test/service-param-errors.test.mjs test/service-content.test.mjs \
  test/service-runtime.test.mjs test/service-authorized-view.test.mjs \
  test/service-secret-canary.test.mjs test/service-retrieval.test.mjs
```

The historical protected-path integration failure already reported on PR #37
is not fixed or bypassed by this candidate. Review/ratification and production
deployment remain separate gates.
