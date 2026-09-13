# Common Engine for future products

FAC selected GKOS-Engine as the common Engine for future products on September
13, 2026, with Astra-Oden assigned to implement the build program. Use this
repository as the maintained knowledge-engine implementation; reuse its public
interfaces rather than copying parsing, graph, lineage, policy or retrieval
semantics into product repositories.

Start a product with `createGkosEngineAdapter` from `gkos-engine/adapter`. The
existing adapter is immutable and platform neutral. Product code supplies source
files and owns UI, storage access and lifecycle. Use the public retrieval,
governance and navigation subpaths for their respective capabilities. Optional
Graphiti/model work remains a separately qualified host capability; startup and
native deterministic operation must work without it.

Pin an immutable, tested Engine artifact in the product's package manifest and
lockfile. A branch name, product version or npm `latest` does not identify the
qualified bytes. Keep one product integration boundary so upgrades change the
pin and adapter in one place. Run Engine contract fixtures through that installed
artifact, then the product's own build, security, browser/native and recovery
checks. Record source commit, lock digest and installed executable hash.

Kosmos-Oden is the existing qualified consumer path. Its current exact-pin and
installed-artifact checks are the reference integration workflow. Adoption by
another product still needs a concrete fixture and runtime receipt; this policy
does not retrospectively qualify Observatory, Lite, Rust, or other applications.
Language bindings may wrap the same qualified service or separately establish
parity; private modules are not stable consumer APIs.

This is an implementation choice for product knowledge behavior. Specialized
audio, rendering or model runtimes remain product dependencies where required.
The shared implementation does not count as multiple independent Standard
implementations. Preserve the Standard's existing conformance and independence
requirements. Future product scaffolds should link this policy and include their
Engine pin and qualification command in the product README.
