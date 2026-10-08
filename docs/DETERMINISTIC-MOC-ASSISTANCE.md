# Deterministic MOC maintenance and optional assistance

This experimental Engine implementation adds exports under
`gkos-engine/navigation-effects`. Navigation 1.0 remains unchanged. No import
starts a timer, network call, watcher or filesystem operation.

## Available building blocks

- `planManagedMocBatch`: validates the configuration and corpus, generates
  existing deterministic Navigation candidates, and plans only explicitly
  registered targets through `planMocApply`. Current target bytes and ownership
  are supplied separately from the filtered corpus. Unmanaged targets are
  denied; adopted bytes, generated regions, policy and grants retain their
  existing precondition checks. Planned results can be passed to the existing
  Node executor as `{ plan, proposedBytes }`. Other results require host audit
  or review handling; they are not successful writes.
- `ManagedMocCoordinator`: durably persists event paths through an explicit
  host, coalesces duplicate paths, waits 750 ms after the last event with a
  3-second maximum delay, collapses path overflow to full reconciliation, and
  retains events arriving during execution. Startup recovery and full
  reconciliation precede readiness. Host timers call `tick`; the default
  periodic interval is five minutes. Errors retain work for retry.
- `buildDeterministicMocAssistance`: creates reviewable tags from existing tags
  and explicit hashtags, cross-links from unambiguous explicit wiki links, and
  MOC sections grouped by tags. Unassigned notes remain in an Other notes
  section. It does not infer supersession or semantic truth.
- `buildMocAssistance`: always returns the deterministic artifact. An optional
  provider may also propose tags, links and section groupings, with validated
  UIDs and safe Engine-rendered Markdown. The advisory artifact is separate and
  requires review; it never replaces the deterministic result automatically.

## Optional model configuration

```ts
const result = await buildMocAssistance(
  { notes, allowedSensitivities: ["public"] },
  {
    enabled: settings.assistanceEnabled,
    allowProviderAccess: settings.providerDataAccessApproved,
    provider: {
      async suggest(request, signal) {
        // Host transport: authenticated local/LAN/cloud provider, endpoint
        // validation, secret handling, bounded HTTP response, no model tools.
        return requestJsonFromConfiguredProvider(request, signal);
      },
    },
    timeoutMs: 10_000,
    maxRequestBytes: 65_536,
  },
);
// Display result.deterministic and, when present, result.advisory for review.
```

No configured provider is required for deterministic operation. Sending data
requires both enablement and explicit provider access approval. Missing or
unauthorized sensitivity labels, `.gkx/**`, and `_archive/moc-runs/**` are
excluded before provider invocation. Hosts must supply the correct allowed
labels for the destination. Provider exceptions and invalid, excessive or
timed-out responses return `fallback`, without exposing error text. Providers
must honor AbortSignal and enforce transport response limits before parsing;
the Engine additionally limits the parsed serialized result to 64 KiB.

An LLM is nondeterministic even at temperature zero. Recorded source digests
and proposal artifacts permit replay; a fresh provider call may differ.
The assistance schema is an application extension, not a GKX field amendment
or a conformance claim. Model output has no write or adoption authority.

## Kosmos host integration obligations

Supply a durable `MocCoordinatorHost` using the Obsidian adapter and existing
effects recovery. Wire create/modify/delete to `notify`; a rename must enqueue
both old and new paths. On resume, watcher overflow/error or bulk sync, call
`requestReconciliation`. Ignore a completed self-write only after matching its
effect ID and digest; other events must remain eligible for reconciliation.

`reconcile` must obtain a validated snapshot, apply GkxIndex deltas, derive
affected scopes, build plans, execute through the guarded adapter, persist
ownership advancement and receipts, and publish committed graph changes. It
must throw on unresolved partial work. Revalidate authority, sensitivity,
configuration and current bytes at execution, including recovered operations.
An LLM proposal must be reviewed and bound to the current snapshot before the
host may turn it into a candidate; this module deliberately does not auto-adopt
model suggestions or write tags into source notes.

The coordinator bounds accumulated distinct paths, not host event admission.
The host must apply admission/backpressure to concurrent calls. `stop` stops
admission and preserves pending intent; the host must also await the active
atomic operation within its shutdown budget and durably close the executor.
Do not advertise clean shutdown merely because `stop` resolved.

This change does not wire the Kosmos UI, install a model transport, or update
its Engine dependency. Final integration still requires the authorized exact
released Engine artifact and Obsidian adapter qualification. Batch planning
currently regenerates the eligible snapshot; incremental scope generation,
2,000-note latency targets, platform durability and 24-hour soak results are
not claimed by these new tests. Deleting the last source in a scope can yield
`NO_DETERMINISTIC_CANDIDATE`; review is required rather than implicit deletion.
