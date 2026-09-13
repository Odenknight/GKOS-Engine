# Validated graph comparison measurement

September 13, 2026. The watcher repeatedly serialized already detached inert
graph values solely to compare equality. Three comparisons now use Node's
`isDeepStrictEqual` after the existing canonicalization and graph reconstruction.
Canonical bytes, digest validation, input rejection and physical readback remain
in place. This optimization introduces no cross-request cache.

Seven synthetic graph comparisons measured canonical equality at 373–414 ms
with serialization versus 42–50 ms structurally. Graphiti projection comparison
took 64–70 ms versus 2.2–2.6 ms. Equality results matched, and an extra field was
refused. These are comparison-only measurements, not end-to-end qualification.
The local receipt is `watcher-graph-equality-comparison.json`.

Typecheck, build and 31 contract/coordinator tests passed, including frozen
contract replay, proxies/accessors, detached immutable authority, reordered keys,
null prototypes, negative zero and invalid canonical node order.

The uninstrumented 2,000-note real-edit smoke at source `69fda67` completed one
edit in 12,648.90 ms, failing the unchanged 2,000 ms budget. There was no runtime
error. Receipt: `watcher-graph-comparison-smoke/receipt.json`. The earlier deeper
instrumented diagnostic measured 13,607.03 ms; those runs are not a controlled
end-to-end comparison. The full 24-hour qualification remains open.

A separate bulk-property-descriptor serialization experiment produced identical
bytes but was slower (264–286 ms versus 194–201 ms) and was rejected. The generic
canonical serializer is unchanged. Receipt: `canonical-descriptor-comparison.json`.
