# Graphiti manifest identity for product hosts

Products may import `managedEpisodeJson` and `buildManagedGraphitiManifest`
from `gkos-engine/graphiti`.
These are pure identity helpers. They perform no network or filesystem I/O.
They do not authorize a query or prove that ingestion completed.

The host must obtain original bytes through its current source authority.
Pass each source UID, its original bytes, and the worker's four-string episode
envelope to `buildManagedGraphitiManifest`.
Preserve episode order. Do not substitute a preview or stripped note body for
the original bytes.

The result contains ordered source and episode digests and a snapshot digest.
The helper uses the same canonical envelope as the Python ledger.
It preserves source-byte distinctions, including BOMs and line endings.
It captures inputs before asynchronous hashing and enforces its existing bounds.

A product must separately reconcile the manifest against its trusted published
ledger receipt and current scope, policy, and configuration.
It must recheck those authorities after asynchronous work and before display.
A readiness response from the search provider is not an authority grant.

This is an additive Graphiti API extension for the candidate build.
The historical export fixture remains unchanged.
The compatibility test names the two additions explicitly.
The Node service transport and broker remain private.
This extension does not establish native product or release qualification.
