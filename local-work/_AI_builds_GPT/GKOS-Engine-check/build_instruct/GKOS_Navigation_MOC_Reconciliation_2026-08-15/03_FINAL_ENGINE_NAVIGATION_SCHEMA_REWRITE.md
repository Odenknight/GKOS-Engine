# Final Engine Navigation Contract and Schema Rewrite

## Status and intended use

This document is the reconciled implementation contract for the proposed first-generation GKOS Engine Navigation capability. It supersedes the rough policy and run-manifest shapes in the assessed build plans.

It is not, by itself, an adopted GKOS Standard amendment. Engine may implement it as a versioned product contract; the standard may later promote compatible provisional schemas after the independent-implementation gate.

Normative terms **MUST**, **MUST NOT**, **SHOULD**, and **MAY** have their usual requirement meanings.

## Contract boundary

Navigation has three separately versioned responsibilities:

1. **Planner:** pure discovery, classification, rendering, diff, audit, and plan generation.
2. **Ownership registry:** explicit authorization for a generated target or delimited region.
3. **Executor:** platform-specific precondition checks, archive, replacement, journal, recovery, and rollback.

The planner has no filesystem, clock, random, network, model-provider, or persistence dependency. It may consume approved decisions as data.

## Coordinates

Every persisted policy, plan, and run record MUST carry all applicable coordinates without conflating them:

```ts
interface NavigationCoordinatesV1 {
  navigation_contract: "gkos-engine.navigation/1.0";
  gkx_public_namespace: "2.0";
  gkx_projection_profile: "gkx-2.3-validating-projection";
}

interface ImplementationCoordinateV1 {
  implementation_id: string;         // e.g. "gkos-engine"
  implementation_version: string;    // e.g. "2.2.0"
}
```

`gkx_public_namespace` is not changed by this feature. `gkx_projection_profile` records the portable projection rules used to interpret the corpus. `navigation_contract` versions the new derived projection. Implementation identity is recorded separately so two conforming implementations can produce the same portable plan core while retaining truthful provenance in their envelopes and run records.

## Schema inventory

The implementation SHOULD publish these JSON Schemas under a new exported schema directory and package them with the release:

| Schema ID | File | Purpose |
|---|---|---|
| `gkos-engine.navigation-semantic-view.v1` | `schemas/navigation/navigation-semantic-view-v1.schema.json` | Stable, Navigation-relevant projection of GKX nodes and links. |
| `gkos-engine.navigation-policy.v1` | `schemas/navigation/navigation-policy-v1.schema.json` | Deterministic discovery, rendering, budget, archive, and sensitivity policy. |
| `gkos-engine.navigation-ownership.v1` | `schemas/navigation/navigation-ownership-v1.schema.json` | Explicit target/region ownership grants. |
| `gkos-engine.navigation-plan.v1` | `schemas/navigation/navigation-plan-v1.schema.json` | Deterministic plan core plus non-authorizing planning envelope. |
| `gkos-engine.navigation-run.v1` | `schemas/navigation/navigation-run-v1.schema.json` | Recoverable execution journal and committed run record. |
| `gkos-engine.navigation-capabilities.v1` | `schemas/navigation/navigation-capabilities-v1.schema.json` | Executor guarantees and limitations. |
| `gkos-engine.navigation-audit.v1` | `schemas/navigation/navigation-audit-v1.schema.json` | Mechanical navigation audit results. |

All schemas MUST use `additionalProperties: false` for contract objects, explicit required arrays, and the formats/patterns defined below. Unknown future fields require a new compatible schema version rather than silent acceptance.

## Canonical primitives

```ts
type NormalizedLogicalPath = string;
// Relative UTF-8 path; '/' separators; no empty, '.', '..', NUL, drive,
// UNC, or leading '/' segment. The executor proves its resolved target stays
// below the configured workspace root and refuses symlink/reparse escape.

type NormalizedScopeRoot = "" | NormalizedLogicalPath;
// The empty string denotes the workspace root only where this type is used.

type Sha256Digest = `sha256:${string}`;
// Exactly lowercase "sha256:" followed by 64 lowercase hexadecimal digits.

interface DigestV1 {
  algorithm: "sha256";
  basis: "raw-bytes" | "jcs-rfc8785";
  value: Sha256Digest;
}

interface UtcTimestampV1 {
  // RFC 3339 UTC with trailing Z and millisecond precision.
  value: string;
}
```

### Digest rules

- A `raw-bytes` digest is SHA-256 over the bytes as stored, including a UTF-8 BOM and original line endings when present.
- A `jcs-rfc8785` digest is SHA-256 over RFC 8785 JSON Canonicalization Scheme bytes. Contract objects use integers rather than non-integer numbers.
- The basis is always explicit. A canonical-text or newline-normalizing digest MUST NOT be substituted for `raw-bytes`.
- General Engine `contentHash` values are cache/fingerprint values and MUST NOT authorize a write.

| Field | Required basis |
|---|---|
| `policy_digest` | JCS of the complete schema-valid policy object. |
| `planner_spec_digest`, `renderer_spec_digest` | Exact raw bytes of the published specification document identified by the adjacent ID/version. |
| `ownership_registry_digest` | JCS of the complete schema-valid registry object. |
| `eligibility_decision_digest` | JCS of the complete host decision set, retained under its own authorization even when the plan receives only the digest. |
| `semantic_projection_digest` | JCS of `NavigationSemanticViewV1`. |
| `source_set_digest` | JCS of `{ semantic_projection_digest, source_preconditions }`. |
| `approved_grouping_digest` | JCS of the complete approved-grouping object. |
| `plan_digest` | JCS of `plan_core` only. |
| Base, candidate, archive, and observed-live digests | Exact raw bytes. |

### Ordering rules

- Logical path lists are ordered lexicographically by their UTF-8 byte sequence.
- Identifiers are ordered by their ASCII byte sequence.
- Relation and reason-code sets are de-duplicated and then ordered by the same rule.
- An implementation MUST reject two logical inputs that collide under the host filesystem’s case or normalization semantics.
- A target MUST NOT be the ownership-registry path, be within `.gkx`, or be within the configured archive prefix.

## Exact input boundary

The existing semantic index is necessary but not sufficient because hybrid edits and archives require exact bytes.

```ts
interface NavigationDocumentInputV1 {
  path: NormalizedLogicalPath;
  bytes: Uint8Array;
  encoding: "utf-8" | "utf-8-bom";
  line_endings: "lf" | "crlf" | "mixed" | "none";
  raw_digest: DigestV1;              // basis MUST be raw-bytes
  semantic_record_id?: string;       // reference into the paired index view
  effective_sensitivity?: string;
}

interface NavigationAttachmentInputV1 {
  path: NormalizedLogicalPath;
  byte_length: number;
  raw_digest?: DigestV1;
  media_type?: string;
}

interface NavigationSnapshotV1 {
  coordinates: NavigationCoordinatesV1;
  producer: ImplementationCoordinateV1;
  corpus_revision_ref?: string;
  semantic_projection_digest: DigestV1;
  documents: readonly NavigationDocumentInputV1[];
  attachments: readonly NavigationAttachmentInputV1[];
}
```

`semantic_projection_digest` is the JCS digest of this stable intermediate view; it is not a digest of the current `GkxGraph` object wholesale:

```ts
interface NavigationSemanticViewV1 {
  schema: "gkos-engine.navigation-semantic-view.v1";
  gkx_projection_profile: "gkx-2.3-validating-projection";
  nodes: readonly NavigationSemanticNodeV1[];
  links: readonly NavigationSemanticLinkV1[];
}

type NavigationSemanticNodeV1 = NavigationSemanticNodeFieldsV1 & (
  | { kind: "file"; path: NormalizedLogicalPath }
  | { kind: "folder"; path: NormalizedScopeRoot }
  | { kind: "unresolved"; unresolved_ref: string }
);

interface NavigationSemanticNodeFieldsV1 {
  node_id: string;
  label: string;
  area: string;
  depth: number;
  gkx_uid?: string;
  type?: string;
  title?: string;
  description?: string;
  epistemic_state?: string;
  scope?: string;
  scope_id?: string;
  effective_sensitivity?: string;
  status?: string;
  priority?: string;
  tags: readonly string[];
  aliases: readonly string[];
  authored_timestamp?: string;
  supersedes_ids: readonly string[];
  superseded_by_ids: readonly string[];
  head?: boolean;
  diagnostic_codes: readonly string[];
}

interface NavigationSemanticLinkV1 {
  source: string;
  target: string;
  kind: "wikilink" | "markdown" | "property" | "semantic" | "lineage" | "contains";
  label?: string;
  source_path?: NormalizedLogicalPath;
}
```

Nodes are ordered by `node_id`; links by `(source, target, kind, label, source_path)`; all set-like fields are de-duplicated and canonically ordered. The view MUST include every stable field the V1 planner consults. It MUST exclude `indexedAt`, `durationMs`, `lastFullBuildMs`, `firstSeenMs`, wall-clock fallbacks, absolute paths, process/host values, and filesystem-created/modified times. `authored_timestamp` is present only when supplied by the GKX content under the declared projection profile; Engine’s runtime fallback `validAt` is not portable Navigation input.

The deterministic label rule is `eligible GKX title when the declared profile selects it, otherwise normalized path basename`. A later planner that consults another semantic field changes this view schema/contract and its fixtures.

V1 accepts only valid UTF-8 Markdown. It MUST fail with `GKX-NAV-010` instead of silently transcoding invalid input. Untouched byte ranges in a hybrid document MUST be copied verbatim.

The snapshot provider MUST exclude `.gkx`, the configured archive prefix, and other shared ignored paths before planning. It MUST still supply generator-owned live targets to the Navigation registry, even when generated regions are masked from the evidence graph.

Before an archive prefix is activated, the host MUST prove that the existing path is absent/empty or explicitly reserve it for Navigation. A default ignore change must not silently hide pre-existing user corpus material.

## Policy schema

```ts
interface NavigationPolicyV1 {
  schema: "gkos-engine.navigation-policy.v1";
  coordinates: NavigationCoordinatesV1;
  mode: "navigation-only";

  discovery: {
    markdown_extensions: readonly [".md"];
    ascii_case_fold: true;
    rules: readonly MocDiscoveryRuleV1[];
  };

  algorithm: {
    planner_id: string;
    planner_version: string;
    planner_spec_digest: DigestV1;
    target_strategy: "registered-targets-only";
  };

  scopes: {
    entries: readonly {
      scope_id: string;
      root: NormalizedScopeRoot;
      display_title: string;
      maximum_depth?: number;
      include_empty: boolean;
    }[];
  };

  selection: {
    moc: {
      maximum_items_per_target: number;
      maximum_candidate_utf8_bytes: number;
      overflow: "fail";
    };
    context_pack: {
      maximum_items_per_pack: number;
      maximum_pack_utf8_bytes: number;
      overflow: "truncate-by-ranked-order";
      optional_token_estimator?: {
        estimator_id: string;
        estimator_version: string;
        maximum_estimated_tokens: number;
        enforcement: "advisory" | "deterministic-pinned";
      };
    };
  };

  sensitivity: {
    strategy: "filter-to-output" | "raise-output";
    output_ceiling?: string;
    fail_closed: true;
    require_host_eligibility_decisions: true;
    require_storage_enforcement_for_raise: true;
  };

  rendering: {
    renderer_id: string;
    renderer_version: string;
    renderer_spec_digest: DigestV1;
    title_template: string;
    link_style: "wikilink" | "markdown";
    include_empty_sections: boolean;
    generated_region_line_endings: "lf";
    managed_terminal_newline: "lf";
  };

  ownership_registry_path: ".gkx/navigation/ownership.v1.json";

  archive: {
    root: NormalizedLogicalPath;      // default "_archive/moc-runs"
    excluded_from_evidence: true;
    retention_policy_ref?: string;
    legal_hold_policy_ref?: string;
    automatic_pruning: false;
  };
}

type MocDiscoveryRuleV1 =
  | {
      id: string;
      priority: number;               // lower wins
      kind: "stem-equals-parent-folder";
    }
  | {
      id: string;
      priority: number;
      kind: "exact-stem";
      stems: readonly string[];
    }
  | {
      id: string;
      priority: number;
      kind: "ownership-registry";
    };
```

The default discovery rules are:

```json
[
  {"id":"registered-target","priority":-100,"kind":"ownership-registry"},
  {"id":"folder-name","priority":0,"kind":"stem-equals-parent-folder"},
  {
    "id":"known-manifest-stem",
    "priority":100,
    "kind":"exact-stem",
    "stems":["index","home","readme","_index","moc","map","overview","dashboard","start","contents","toc"]
  }
]
```

Tie-breaking is `(priority, rule.id, logical path)` in ascending canonical order. Discovery is classification, not ownership authorization.

`scope_id` values and roots are unique, and every ownership entry references one declared scope. V1 proposes MOC candidates only for explicitly registered targets; discovery never creates ownership. `maximum_depth` is a non-negative integer. Item/byte maxima are positive integers. A MOC fails rather than silently omitting required links; a context pack takes the deterministic ranked prefix and records truncation.

The Engine 2.2 release MUST publish the exact planner and Markdown renderer specifications selected by its default policy, including grouping, ranking, template variables/escaping, heading levels, link encoding, blank lines, and terminal newline. Their raw document digests populate `planner_spec_digest` and `renderer_spec_digest`. A template may reference only variables enumerated by that spec and MUST NOT access a clock, run ID, environment variable, absolute path, or host state. Clean-room parity is measured only when both implementations select the same spec IDs, versions, digests, and policy.

Reserve `gkos-navigation-folder-baseline/1.0.0` and `gkos-moc-markdown/1.0.0` for those initial specifications. The names do not make an incomplete algorithm conforming: Engine 2.2.0 cannot release until both documents and their golden byte fixtures exist.

### Eligibility decisions

A sensitivity label alone is not an access-control decision. The host supplies a complete, fail-closed eligibility result:

```ts
interface NavigationEligibilityV1 {
  decision_set_ref: string;
  authorization_ref: string;
  decision_set_digest: DigestV1;      // JCS digest of the complete decision set
  eligible_semantic_record_ids: readonly string[];
  eligible_attachment_paths: readonly NormalizedLogicalPath[];
  output_sensitivity: string;
}
```

The planner receives only eligible semantic records/content, or an equivalent host callback that cannot reveal denied records. Plans, diffs, diagnostics, metrics, archives, and logs MUST NOT expose denied paths, titles, IDs, tags, counts, or rejection reasons. `raise-output` MUST be refused unless the executor capability record proves storage-label/access enforcement.

## Ownership registry schema

Markers delimit generated content; the registry grants authority.

```ts
interface NavigationOwnershipRegistryV1 {
  schema: "gkos-engine.navigation-ownership.v1";
  workspace_id: string;
  entries: readonly NavigationOwnershipEntryV1[];
}

interface NavigationOwnershipEntryV1 {
  target_path: NormalizedLogicalPath;
  scope_id: string;
  mode: "managed" | "hybrid";
  marker_id: string;
  grant: 
    | { kind: "existing-file"; activation_digest: DigestV1 }
    | { kind: "create-if-absent" };
  granted_by_ref: string;
  granted_at: UtcTimestampV1;
  policy_digest: DigestV1;
  revoked: boolean;
}
```

Registry entries are sorted by `target_path`, and each target appears at most once. Granting or revoking ownership is an explicit host mutation separate from planning. An automatic discovery run MUST NOT silently adopt an existing file.

For `existing-file`, `activation_digest` proves which bytes the user saw when granting ownership; it is historical grant evidence, not a permanent ban on later human edits. Every plan still binds the then-current base digest, and every apply rechecks that base.

V1 grants `hybrid` ownership only when the exact valid marker pair already exists in the activation bytes. A user may insert it manually after reviewing the proposed location. A future automated marker-initialization workflow must use its own previewed, archived, journaled mutation; `ownership grant` itself does not silently edit the target.

The canonical hybrid delimiters are exact standalone UTF-8 lines:

```text
<!-- GKOS:NAV:BEGIN <marker_id> -->
<!-- GKOS:NAV:END <marker_id> -->
```

`marker_id` matches `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`. Exactly one begin/end pair is permitted for the registered ID. Nested, duplicated, reversed, missing, or mismatched markers are fatal. A marker without a live registry grant remains unmanaged.

Mode behavior:

- **Unmanaged:** absent from the registry; planner may report/diff, executor refuses mutation.
- **Hybrid:** only bytes between the registered delimiter lines may change. Every byte outside that interval is copied exactly.
- **Managed:** the entire file may change, but only under a current registry grant and matching base digest. The generated file SHOULD contain its registered markers so ownership remains human-visible.

In Navigation-only mode, the evidence parser masks the registered generated interval. For a managed target, it masks all generated semantic content. Human-owned bytes outside a hybrid interval continue through normal GKX parsing.

## Deterministic plan schema

The authorizing content is `plan_core`. Timestamps and planner-host metadata live in `envelope` and do not affect `plan_digest` or candidate bytes.

```ts
interface NavigationPlanV1 {
  schema: "gkos-engine.navigation-plan.v1";
  plan_core: NavigationPlanCoreV1;
  plan_digest: DigestV1;              // JCS digest of plan_core
  envelope: {
    planner: ImplementationCoordinateV1;
    planned_at?: UtcTimestampV1;
    planner_host_ref?: string;
  };
}

interface NavigationPlanCoreV1 {
  coordinates: NavigationCoordinatesV1;
  mode: "navigation-only";
  policy_digest: DigestV1;
  ownership_registry_digest: DigestV1;
  eligibility_decision_digest: DigestV1;
  semantic_projection_digest: DigestV1;
  source_set_digest: DigestV1;
  source_preconditions: readonly NavigationSourcePreconditionV1[];
  approved_grouping_digest?: DigestV1;
  targets: readonly NavigationTargetPlanV1[];
}

type NavigationSourcePreconditionV1 =
  | {
      kind: "document";
      view: "full-document";
      path: NormalizedLogicalPath;
      raw_digest: DigestV1;
      byte_length: number;
    }
  | {
      kind: "document";
      view: "hybrid-human-regions";
      path: NormalizedLogicalPath;
      marker_id: string;
      regions: readonly [
        { ordinal: 0; raw_digest: DigestV1; byte_length: number },
        { ordinal: 1; raw_digest: DigestV1; byte_length: number }
      ];
    }
  | {
      kind: "attachment";
      view: "full-object";
      path: NormalizedLogicalPath;
      raw_digest: DigestV1;
      byte_length: number;
    };

interface NavigationTargetPlanV1 {
  target_path: NormalizedLogicalPath;
  scope_id: string;
  ownership_mode: "unmanaged" | "managed" | "hybrid";
  action: "report-only" | "create" | "replace-file" | "replace-generated-region" | "no-op";
  base:
    | { exists: false }
    | { exists: true; raw_digest: DigestV1; byte_length: number };
  candidate?: {
    encoding: "utf-8" | "utf-8-bom";
    line_endings: "lf" | "crlf" | "mixed" | "none";
    raw_digest: DigestV1;
    byte_length: number;
    utf8_base64: string;
  };
  reason_codes: readonly string[];
}
```

### Plan invariants

1. `plan_core` contains no implementation identity/version, timestamp, random value, run ID, absolute path, host username, process ID, or environment-dependent separator.
2. `targets` are unique and sorted by `target_path`.
3. Candidate bytes contain no run ID or generation timestamp.
4. `utf8_base64` decodes to exactly `byte_length` bytes and matches the candidate raw digest.
5. `create`, `replace-file`, and `replace-generated-region` require candidate bytes.
6. `replace-file` requires `managed`; `replace-generated-region` requires `hybrid`.
7. `unmanaged` permits only `report-only` or `no-op`.
8. `source_preconditions` lists every eligible document or attachment whose evidence-visible bytes, presence, metadata, or semantic projection can affect any target or audit result. Managed documents with no human evidence view are omitted.
9. `source_preconditions` is unique and ordered by `(kind, path)`; every listed region/object digest has the `raw-bytes` basis. In V1 every target conservatively depends on the complete listed set. An attachment that affects output must therefore have a raw digest.
10. `source_set_digest` is the JCS digest of `source_preconditions` plus the semantic projection digest; it is not a substitute for retaining the individual preconditions needed at apply.
11. The plan digest is computed over `plan_core` only. The digest field does not hash itself.
12. The planner MUST NOT read the wall clock or allocate a run ID while rendering candidates.

## Approved grouping input

The first contract may consume—but never solicit—an intelligence-assisted decision:

```ts
interface ApprovedNavigationGroupingV1 {
  schema: "gkos-engine.approved-navigation-grouping.v1";
  decision_ref: string;
  input_projection_digest: DigestV1;
  groups: readonly {
    group_id: string;
    eligible_record_ids: readonly string[];
    approved_label: string;
  }[];
  approved_by_ref: string;
  approved_at: UtcTimestampV1;
}
```

The grouping object is separately hashed; only its digest enters the deterministic plan core. The Navigation planner makes no network/model call. All record IDs must already be eligible, and labels are subject to the output sensitivity policy.

## Executor capability schema

```ts
interface NavigationExecutorCapabilitiesV1 {
  schema: "gkos-engine.navigation-capabilities.v1";
  executor_id: string;
  executor_version: string;
  logical_path_model: "posix-relative";
  raw_sha256: true;
  local_workspace_lease: boolean;
  atomic_replace_per_file: boolean;
  durable_file_flush: boolean;
  durable_directory_flush: boolean;
  remote_conditional_write: boolean;
  rollback: boolean;
  storage_sensitivity_enforcement: boolean;
  batch_guarantee: "recoverable-not-atomic";
}
```

Apply MUST fail with `GKX-NAV-011` when required guarantees are unavailable. A remote executor may substitute an ETag/version precondition for an atomic local replace, but its exact guarantee must be declared and tested. It MUST NOT report a synchronized file as protected by a distributed lock unless a real distributed lease service is used.

## Run journal schema

```ts
type NavigationRunStatusV1 =
  | "preparing"
  | "applying"
  | "committed"
  | "partial"
  | "recovery-required"
  | "rolling-back"
  | "rolled-back"
  | "failed";

type NavigationOperationStateV1 =
  | "planned"
  | "prepared"
  | "archive-started"
  | "archive-verified"
  | "replacement-prepared"
  | "replacement-started"
  | "replacement-verified"
  | "committed"
  | "rollback-started"
  | "rolled-back"
  | "conflict"
  | "failed";

interface NavigationRunJournalV1 {
  schema: "gkos-engine.navigation-run.v1";
  coordinates: NavigationCoordinatesV1;
  planner: ImplementationCoordinateV1;
  run_id: string;                    // safe opaque ID; UUIDv7 MAY be used, not required
  plan_digest: DigestV1;
  executor: NavigationExecutorCapabilitiesV1;
  authorization_ref: string;
  eligibility_decision_digest: DigestV1;
  started_at: UtcTimestampV1;
  updated_at: UtcTimestampV1;
  completed_at?: UtcTimestampV1;
  status: NavigationRunStatusV1;
  effective_sensitivity: string;
  retention_policy_ref?: string;
  legal_hold_policy_ref?: string;
  operations: readonly NavigationRunOperationV1[];
  diagnostics: readonly NavigationDiagnosticV1[];
}

interface NavigationRunOperationV1 {
  operation_index: number;
  target_path: NormalizedLogicalPath;
  state: NavigationOperationStateV1;
  base_digest?: DigestV1;
  candidate_digest?: DigestV1;
  archive_path?: NormalizedLogicalPath;
  archive_temp_ref?: string;
  archive_digest?: DigestV1;
  replacement_temp_ref?: string;
  observed_live_digest?: DigestV1;
  transitions: readonly {
    sequence: number;
    state: NavigationOperationStateV1;
    at: UtcTimestampV1;
    diagnostic_codes: readonly string[];
  }[];
  diagnostic_codes: readonly string[];
}
```

`run_id` matches `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$` and MUST be unique within the executor’s workspace history. Active journals SHOULD live in durable executor-local state outside a synchronized corpus. A sensitivity-governed committed receipt MAY be copied into `.gkx/navigation/runs/` or the archive tree; neither location is an evidence input.

Operation indices are unique, zero-based, and follow target canonical order. Transition sequences start at zero, increase by one, and the operation `state` equals the final transition state. A create operation with no prior bytes may move from `prepared` directly to `replacement-prepared`; archive states are then absent.

The run journal inherits the maximum sensitivity of the source material, eligibility decision, output, paths, and diagnostics. A sanitized summary MAY be emitted separately, but sanitization is a host authorization decision.

## Apply protocol

An executor MUST perform these steps in order:

1. Decode and validate the complete plan and candidate bytes.
2. Resolve every logical target and archive path under the verified workspace root; reject escapes and host collisions.
3. Acquire a local workspace lease or the declared equivalent.
4. Refuse to start if an earlier run is `recovery-required`, `partial`, or incompletely journaled.
5. Re-read the policy and ownership registry and compare their digests with the plan.
6. Revalidate the live authorization/eligibility decision and every source precondition, or deterministically re-plan from a fresh complete snapshot and compare `plan_digest`.
7. Re-read every live target and compare its raw digest/absence with the plan base.
8. Re-evaluate required executor capabilities and output sensitivity enforcement.
9. Allocate the run ID and persist the full journal in `preparing` state **before the first source mutation**; durably flush it when supported.
10. For each target in canonical order, revalidate policy, registry, live authorization, all V1 source preconditions, and that target’s base; then transition and durably record `prepared`. A later contract may safely narrow target dependencies, but V1 does not infer them.
11. If the base exists, persist `archive-started` and its opaque temporary reference, write exact original bytes to a same-filesystem temporary archive, flush, atomically install it at an absent `_archive/moc-runs/<run_id>/<target_path>` destination, re-read it, and verify raw SHA-256 before recording `archive-verified`.
12. Persist the replacement temporary reference, write candidate bytes to a same-directory temporary file, flush and verify it, then record `replacement-prepared`. Re-read the live target immediately and repeat the stale-base check.
13. Record `replacement-started`, perform the platform’s atomic per-file replacement or declared conditional remote write, and flush directory metadata where supported.
14. Re-read the new live bytes, verify candidate SHA-256, and record `replacement-verified` followed by `committed`.
15. When all operations commit, mark the run `committed`, set `completed_at`, flush the journal, and release the lease.
16. On interruption or failure, preserve journal and archive data, mark the narrowest truthful status, and require recovery before a new apply.

The executor MUST re-check both the live evidence-visible source dependencies and target base because preview and apply are separated in time and editors/sync clients may change files during a batch. A prior operation in the same run changes a target’s raw bytes, but its registered human-region preconditions remain stable; this is why the source manifest distinguishes evidence-visible regions from full target bytes. Opaque digests without the individual source preconditions are insufficient to perform that check. A manifest created only after replacement is not a write-ahead journal and does not satisfy this contract.

Every journal update is itself crash-safe: write the next complete journal to a temporary record, flush it when supported, atomically replace the active record, and retain/validate a sequence number or equivalent integrity guard. Temporary references are opaque host-local handles, not authority; recovery resolves only handles recorded before the corresponding write.

### Recovery and rollback

- Recovery inspects the journal, live digest, candidate digest, archive digest, and any temporary files; it never guesses from filenames alone.
- At `archive-started`, recovery validates the recorded temporary/destination archive and the still-live base before retrying, completing verification, or failing closed.
- At `replacement-prepared`, recovery revalidates all source and target preconditions before it may advance to replacement.
- An operation at `replacement-started` is classified by re-hashing the live path. Candidate match may advance to verified; base match may safely retry; neither match becomes `conflict`.
- Rollback may replace a live target only when its current raw digest equals the committed candidate digest.
- A later human/agent edit causes `GKX-NAV-012`; the executor preserves the edit and archive and requires manual reconciliation.
- A rollback archives the post-apply candidate as part of the rollback run so that rollback is itself auditable.
- Batch status is `partial` when some targets committed and others did not. The contract never claims all-target atomicity.

## Diagnostics

Symbolic error kinds are distinct from portable diagnostic codes.

```ts
interface NavigationDiagnosticV1 {
  code:
    | "GKX-NAV-001" | "GKX-NAV-002" | "GKX-NAV-003"
    | "GKX-NAV-004" | "GKX-NAV-005" | "GKX-NAV-006"
    | "GKX-NAV-007" | "GKX-NAV-008" | "GKX-NAV-009"
    | "GKX-NAV-010" | "GKX-NAV-011" | "GKX-NAV-012";
  kind: string;
  severity: "info" | "warning" | "error";
  message: string;
  path?: NormalizedLogicalPath;
  scope_id?: string;
}
```

| Code | Canonical kind | Meaning |
|---|---|---|
| `GKX-NAV-001` | `PATH_INVALID_OR_ESCAPE` | Invalid logical path, collision, or workspace escape. |
| `GKX-NAV-002` | `TARGET_NOT_OWNED` | Mutation requested without matching registry authority. |
| `GKX-NAV-003` | `MARKER_INVALID` | Missing, duplicate, nested, reversed, or mismatched delimiter. |
| `GKX-NAV-004` | `ELIGIBILITY_OR_SENSITIVITY_DENIED` | Eligibility missing/invalid or output policy cannot be enforced. |
| `GKX-NAV-005` | `ARCHIVE_VERIFICATION_FAILED` | Archived bytes do not match the original raw digest. |
| `GKX-NAV-006` | `PLAN_STALE` | Live source, policy, registry, eligibility, or projection differs from plan. |
| `GKX-NAV-007` | `LEASE_UNAVAILABLE` | Required local lease cannot be acquired. |
| `GKX-NAV-008` | `RECOVERY_REQUIRED` | An incomplete run must be recovered first. |
| `GKX-NAV-009` | `OUTPUT_BUDGET_EXCEEDED` | Required output cannot satisfy deterministic item/byte bounds. |
| `GKX-NAV-010` | `SOURCE_ENCODING_UNSUPPORTED` | Input is not valid supported UTF-8. |
| `GKX-NAV-011` | `EXECUTOR_CAPABILITY_MISSING` | The executor cannot provide a required guarantee. |
| `GKX-NAV-012` | `ROLLBACK_CONFLICT` | Live content changed after apply. |

The existing standard diagnostic-code shape accepts `GKX-NAV-###`; `MOC_PLAN_STALE` alone is therefore a kind, not a schema-valid portable code.

## Navigation audit schema

The mechanical Walk Test becomes a deterministic audit:

```ts
interface NavigationAuditV1 {
  schema: "gkos-engine.navigation-audit.v1";
  producer: ImplementationCoordinateV1;
  plan_digest: DigestV1;
  eligible_projection_digest: DigestV1;
  metrics: {
    eligible_nodes: number;
    reachable_nodes: number;
    unreachable_nodes: number;
    broken_navigation_links: number;
    ambiguous_navigation_links: number;
    maximum_shortest_path_hops: number | null;
    stale_targets: number;
    sensitivity_leaks: 0;
  };
  diagnostics: readonly NavigationDiagnosticV1[];
}
```

Reachability is computed only over eligible records plus Navigation edges. A human or LLM usability trial is recorded separately as research evidence and MUST NOT change conformance results.

## Separate evidence and Navigation graphs

V1 MUST maintain two concepts:

- **Evidence projection:** the existing GKX-derived graph, excluding generator-owned regions in Navigation-only mode.
- **Navigation projection:** folder/manifest/grouping nodes and derived Navigation edges used to render MOCs and audits.

Navigation edges MUST NOT be injected as new normative GKX relation kinds. If a hybrid file contains human-authored evidence links outside the generated interval, those links continue through the ordinary evidence parser.

Evidence masking is exact:

- A registered `managed` document supplies no evidence fragment in Navigation-only mode.
- A valid registered `hybrid` document supplies two ordered virtual fragments: bytes before the first byte of the begin-delimiter line, and bytes after the end-delimiter line’s terminating line ending (or after the line at EOF). The two fragments are parsed independently and are never byte-concatenated.
- The two fragment byte lengths and raw SHA-256 values are the `hybrid-human-regions` source precondition ordinals 0 and 1.
- Marker lines and all bytes between them are Navigation state, not evidence input.
- If a registered hybrid marker pair is malformed, evidence processing fails closed for that entire registered document and emits `GKX-NAV-003`; it MUST NOT fall back to parsing the generated interval.
- An unregistered marker-like comment has no special semantic or ownership effect and is parsed as ordinary Markdown behavior permits.

## Incremental source delta

Navigation affected-scope calculation MUST consume source changes before they are collapsed into the current `GraphDelta`:

```ts
interface NavigationSourceDeltaV1 {
  changed_paths: readonly NormalizedLogicalPath[];
  removed_paths: readonly NormalizedLogicalPath[];
  renames: readonly { from: NormalizedLogicalPath; to: NormalizedLogicalPath }[];
  changed_folders: readonly NormalizedLogicalPath[];
  changed_attachments: readonly NormalizedLogicalPath[];
  policy_changed: boolean;
  ownership_changed: boolean;
  eligibility_changed: boolean;
}
```

The original `IndexChanges` event or stable `gkx_uid` may establish identity. Equal content hashes alone MUST NOT be used to infer a rename. A full rebuild remains the safe fallback whenever the delta cannot prove completeness.

## Context-pack limits

Context packs use the same eligibility and sensitivity boundary as Navigation targets. Normative inclusion decisions use `maximum_items_per_pack`, `maximum_pack_utf8_bytes`, and the pinned planner ranking. Token counts are advisory unless a tokenizer/estimator identity and version are pinned and distributed to every conforming implementation.

Pack manifests MUST record item order, source raw/semantic digests, truncation reason, estimator coordinate when used, output sensitivity, and the authorizing eligibility digest. They MUST NOT contain denied-item summaries.

## CLI contract

Recommended commands:

| Command | Source corpus | Notes |
|---|---|---|
| `gkx nav discover` | Preserved | May print/write a report outside source targets. |
| `gkx nav plan` | Preserved | Emits schema-valid plan; no run ID. |
| `gkx nav diff` | Preserved | Uses exact candidate/base bytes; sensitivity-safe. |
| `gkx nav audit` | Preserved | Emits deterministic mechanical audit. |
| `gkx nav ownership grant|revoke` | Mutates registry only | Explicit user authorization; never implicit in discovery. |
| `gkx nav apply` | Mutates registered targets | Requires exact plan digest confirmation and executor gates. |
| `gkx nav recover` | May complete/reconcile an interrupted run | Must run before a new apply. |
| `gkx nav rollback` | Mutates only under rollback preconditions | Creates a new auditable run. |
| `gkx nav history` | Preserved | Reads sensitivity-governed journals. |

Use one `nav` namespace; `moc` may be a user-facing alias only if it resolves to the same implementation and help text.

## Package/API boundary

Recommended Engine exports:

```text
gkos-engine/navigation          # pure contracts, planner, audit, fixtures
gkos-engine/navigation/schema   # packaged JSON schemas
gkos-engine/navigation/node     # optional Node executor; explicitly platform-specific
```

The root package MAY re-export the pure planner. It SHOULD NOT make the Node executor an implicit dependency of browser-capable consumers. The package build, export map, type declarations, package-content allowlist, license checks, and import smoke tests must cover all new subpaths.

## Compatibility and schema evolution

- Additive optional fields require a Navigation contract minor version and schema ID change if older validators use `additionalProperties: false`.
- Any change to canonicalization, ordering, candidate bytes, ownership meaning, eligibility behavior, or plan digest is projection-observable and requires an Engine minor at minimum plus the standard’s breaking-behavior marker where applicable.
- Run journals remain readable after an upgrade. Executors MUST refuse to apply an unknown plan schema.
- A migration tool may translate old plan/report formats, but it MUST generate a new digest and require a fresh preview.

## First-release exclusions

The following are intentionally outside `gkos-engine.navigation/1.0`:

- automatic governed L1 re-entry;
- new GKOS layers, frontmatter fields, or typed relations;
- direct LLM/provider calls;
- global multi-file atomicity;
- distributed locking through a synchronized file;
- automatic archive pruning;
- rich System Map states not directly derivable from versioned inputs;
- claims that a token budget is portable without a pinned tokenizer.
