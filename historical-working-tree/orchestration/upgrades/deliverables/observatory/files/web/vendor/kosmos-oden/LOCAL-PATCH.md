# Consumer stable identity candidate

The upstream base remains Kosmos `50ebc3c168cf4e34137faf47e0b297b00db1a753`.
This is a locally patched renderer, not a new upstream release or commit.
The matching upstream-source repair is in the isolated Kosmos candidate based on
`6486035dfc2e42173b1158b8007c9bab35aa7dc9`. No broad v0.85 merge was performed.

The fifth optional traversal argument supplies opaque stable identity; the third
argument remains a display label. Existing label-only synthetic replay and plugin
callers remain supported. The live Engine adapter passes its real `agent_id`.
Static Observatory replay events have only `actor_role`, not a stable agent ID;
their legacy role-label grouping remains intentional and no identity is invented.

The only modified vendored source is `source/src/renderer/renderer.ts`.
PROVENANCE.json binds all build inputs and the new bundle, preserves the old
bundle digest, and explicitly marks the core modified. Dependency inputs retain
their original digests. Rebuild via `orchestration/upgrades/rebuild-consumer-vendor.mjs`.
