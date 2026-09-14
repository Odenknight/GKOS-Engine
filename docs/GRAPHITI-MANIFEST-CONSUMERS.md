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

`reconcileManagedGraphitiPublication` performs the shared receipt comparison.
Pass a host manifest-preparation callback, current host authority digests, and
the host-read published receipt. The helper validates and copies the bounded
receipt before invoking asynchronous source preparation. It checks every
ordered mapping and the Python ledger observation digest. A match returns the
binding and episode map; a mismatch returns null.

The service uses this same helper. Product hosts must still establish the
source authority themselves and recheck its revision after preparation.
The returned map is evidence of a match, not a standalone query capability.

This is an additive Graphiti API extension for the candidate build.
The historical export fixture remains unchanged.
The compatibility test names the three additions explicitly.
The Node service transport and broker remain private.
This extension does not establish native product or release qualification.
