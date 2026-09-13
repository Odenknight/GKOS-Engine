# Optional Graphiti query broker

`GraphitiQueryBroker` is exported from `gkos-engine/graphiti`. It executes the draft-1 query contract through injected host functions. It neither supplies authorization nor starts a database/service.

The trusted host must freshly derive the principal's complete projection dependency scope in `authorize(signal)`. The transport implements `query(request, signal)` and bounds the download to 131072 bytes before decoding. Queries are preauthorized and reauthorized after retrieval; changed policy, generation, configuration or citations reject the complete response. Facts retain unverified semantic support.

The default broker admits four physical operations and a five-second caller deadline; configurable bounds are1–16 slots and1–30000ms. Cancellation signals propagate to host work. A timed-out operation keeps its slot until its underlying promise settles, preventing retries from accumulating unbounded work. Synchronous host work cannot be preempted; elapsed checks reject overdue results. Provider exception text is never returned.

The result is either `{mode: "semantic", result}` or `{mode: "native", reason}`. A native outcome is a content-free fallback signal, not authorization to read native data. Consumers must apply their current native policy separately. This module has no queue, ingestion, persistence, cache, HTTP server or automatic write behavior. Those roadmap gates remain separate.

Tests cover mid-query revocation, competing scope/configuration bindings, malformed/oversized responses, immutable requests, cancellation, physical capacity after timeout, and delayed timer delivery. Passing fixtures qualify this execution boundary, not a live semantic projection or universal isolation.

`graphitiHttpQuery(endpoint, headers)` supplies a fetch-based transport for a host-configured endpoint. It rejects redirects, URL credentials, non-JSON/error responses, malformed UTF-8 and responses exceeding 131072 streamed bytes, including bodies with no Content-Length. Its HTTP POST carries the read query contract; backend read-only behavior still requires separate qualification.
