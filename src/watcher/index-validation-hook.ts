import type { GraphDelta, GkxGraph } from "../types";
import type { NoteRecord } from "../graph";
import type { GkxIndex } from "../incremental";

/** Minimal identity-bearing shape; avoids a core-to-ingest host dependency. */
export interface WatcherIndexValidationPlanIdentity {
  readonly result: {
    readonly observations: readonly unknown[];
    readonly rejections: readonly unknown[];
  };
}

/** Candidate view consumed before a watcher-owned index commit. */
export interface GkxIndexCandidateValidationInput {
  readonly graph: GkxGraph;
  readonly records: readonly Readonly<{ record_key: string; record: NoteRecord }>[];
}

export interface GkxIndexCandidateValidationCapability {
  readonly index: GkxIndex;
}

interface CandidateValidationCell {
  readonly capability: GkxIndexCandidateValidationCapability;
  readonly validate: (input: GkxIndexCandidateValidationInput) => readonly string[];
}

const CANDIDATE_VALIDATION = new WeakMap<GkxIndex, CandidateValidationCell>();
const CANDIDATE_VALIDATION_CAPABILITIES = new WeakMap<GkxIndexCandidateValidationCapability, GkxIndex>();

/**
 * Install one validation callback for the next setFiles/applyChanges commit.
 * The callback is held only in WeakMaps, consumed before invocation, and can
 * neither be discovered through the GkxIndex object nor reused.
 */
export function installGkxIndexCandidateValidation(
  index: GkxIndex,
  validate: CandidateValidationCell["validate"],
): GkxIndexCandidateValidationCapability {
  if (typeof index !== "object" || index === null || typeof validate !== "function" || CANDIDATE_VALIDATION.has(index)) {
    throw new Error("GKX_INDEX_CANDIDATE_VALIDATION_CAPABILITY_INVALID");
  }
  const capability = Object.freeze({ index });
  CANDIDATE_VALIDATION.set(index, { capability, validate });
  CANDIDATE_VALIDATION_CAPABILITIES.set(capability, index);
  return capability;
}

export function cancelGkxIndexCandidateValidation(capability: GkxIndexCandidateValidationCapability): void {
  const index = CANDIDATE_VALIDATION_CAPABILITIES.get(capability);
  if (index === undefined) return;
  const cell = CANDIDATE_VALIDATION.get(index);
  if (cell?.capability === capability) CANDIDATE_VALIDATION.delete(index);
  CANDIDATE_VALIDATION_CAPABILITIES.delete(capability);
}

export function consumeGkxIndexCandidateValidation(
  index: GkxIndex,
  graph: GkxGraph,
  records: ReadonlyMap<string, NoteRecord>,
): ReadonlySet<string> | null {
  const cell = CANDIDATE_VALIDATION.get(index);
  if (cell === undefined) return null;
  CANDIDATE_VALIDATION.delete(index);
  CANDIDATE_VALIDATION_CAPABILITIES.delete(cell.capability);
  const ordered = [...records.entries()]
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([record_key, record]) => Object.freeze({ record_key, record }));
  const accepted = cell.validate(Object.freeze({ graph, records: Object.freeze(ordered) }));
  if (!Array.isArray(accepted)) throw new Error("GKX_INDEX_CANDIDATE_VALIDATION_RESULT_INVALID");
  const acceptedSet = new Set<string>();
  for (const key of accepted) {
    if (typeof key !== "string" || acceptedSet.has(key) || !records.has(key)) {
      throw new Error("GKX_INDEX_CANDIDATE_VALIDATION_RESULT_INVALID");
    }
    acceptedSet.add(key);
  }
  return acceptedSet;
}

/**
 * Repository-private, one-use handoff from the exact Phase-3 validation pass
 * to the watcher coordinator. The public validation result stays byte-stable;
 * only the already-produced graph/delta and governed per-source coordinates
 * are retained here.
 */
export interface WatcherIndexValidationSourceOutcome {
  source_path: string;
  source_observation_ordinal: number;
  disposition: "accepted" | "deterministic_rejection";
  record_key: string | null;
  source_id: string | null;
  source_digest: string | null;
  source_size_bytes: number | null;
  parser_descriptor_digest: string | null;
  rejection_digest: string | null;
  rejection_class: "validation" | "scan_rejection" | null;
}

export interface WatcherIndexValidationOutcome {
  status: "accepted" | "deterministic_rejection";
  plan: WatcherIndexValidationPlanIdentity;
  graph: GkxGraph;
  delta: GraphDelta;
  parse_count: number;
  sources: readonly WatcherIndexValidationSourceOutcome[];
}

export interface WatcherIngestWriterCapability {
  readonly state_directory: string;
  readonly host_lock_digest: string;
}

const INGEST_WRITERS = new WeakMap<WatcherIngestWriterCapability, {
  plan: WatcherIndexValidationPlanIdentity;
  revalidate: () => void;
}>();

export function createWatcherIngestWriterCapability(input: {
  readonly plan: WatcherIndexValidationPlanIdentity;
  readonly state_directory: string;
  readonly host_lock_digest: string;
  readonly revalidate: () => void;
}): WatcherIngestWriterCapability {
  if (typeof input.state_directory !== "string" || typeof input.host_lock_digest !== "string" ||
      !/^sha256:[0-9a-f]{64}$/u.test(input.host_lock_digest) || typeof input.revalidate !== "function") {
    throw new TypeError("GKX_WATCHER_INGEST_WRITER_CAPABILITY_INVALID");
  }
  input.revalidate();
  const capability = Object.freeze({
    state_directory: input.state_directory,
    host_lock_digest: input.host_lock_digest,
  });
  INGEST_WRITERS.set(capability, { plan: input.plan, revalidate: input.revalidate });
  return capability;
}

export function assertWatcherIngestWriterCapability(
  capability: WatcherIngestWriterCapability,
  plan: WatcherIndexValidationPlanIdentity,
  stateDirectory: string,
): void {
  const held = INGEST_WRITERS.get(capability);
  if (!held || held.plan !== plan || capability.state_directory !== stateDirectory) {
    throw new TypeError("GKX_WATCHER_INGEST_WRITER_CAPABILITY_INVALID");
  }
  held.revalidate();
}

export function releaseWatcherIngestWriterCapability(capability: WatcherIngestWriterCapability): void {
  const held = INGEST_WRITERS.get(capability);
  if (!held) throw new TypeError("GKX_WATCHER_INGEST_WRITER_CAPABILITY_INVALID");
  held.revalidate();
  INGEST_WRITERS.delete(capability);
}

interface OutcomeCell { outcome: WatcherIndexValidationOutcome; claimed: boolean }
const OUTCOMES = new WeakMap<WatcherIndexValidationPlanIdentity, OutcomeCell>();

function outcomeCell(plan: WatcherIndexValidationPlanIdentity): OutcomeCell | null {
  const cell = OUTCOMES.get(plan);
  if (cell === undefined) return null;
  return typeof cell.claimed === "boolean" && cell.outcome?.plan === plan ? cell : null;
}

export function bindWatcherIndexValidationOutcome(
  plan: WatcherIndexValidationPlanIdentity,
  value: Omit<WatcherIndexValidationOutcome, "plan" | "status">,
): void {
  if (outcomeCell(plan) !== null || Object.isFrozen(plan)) throw new Error("GKX_WATCHER_INDEX_VALIDATION_OUTCOME_DUPLICATE");
  if (!Number.isSafeInteger(value.parse_count) || value.parse_count < 0 || !Array.isArray(value.sources) ||
      value.sources.length !== plan.result.observations.length) {
    throw new Error("GKX_WATCHER_INDEX_VALIDATION_OUTCOME_INVALID");
  }
  const rejected = value.sources.some((source) => source.disposition === "deterministic_rejection");
  if (rejected !== (plan.result.rejections.length > 0) ||
      value.sources.some((source) => source.disposition === "accepted"
        ? source.rejection_digest !== null || source.rejection_class !== null || source.record_key === null ||
          source.source_id === null || source.source_digest === null || source.parser_descriptor_digest === null
        : source.rejection_digest === null || source.rejection_class === null)) {
    throw new Error("GKX_WATCHER_INDEX_VALIDATION_OUTCOME_INVALID");
  }
  const outcome = Object.freeze({
    status: rejected ? "deterministic_rejection" as const : "accepted" as const,
    plan,
    graph: value.graph,
    delta: value.delta,
    parse_count: value.parse_count,
    sources: Object.freeze(value.sources.map((source) => Object.freeze({ ...source }))),
  });
  OUTCOMES.set(plan, { outcome, claimed: false });
}

export function takeWatcherIndexValidationOutcome(plan: WatcherIndexValidationPlanIdentity): WatcherIndexValidationOutcome {
  const cell = outcomeCell(plan);
  if (!cell || cell.claimed) throw new Error("GKX_WATCHER_INDEX_VALIDATION_OUTCOME_UNAVAILABLE");
  cell.claimed = true;
  return cell.outcome;
}

export function watcherIndexValidationOutcomeAvailable(plan: WatcherIndexValidationPlanIdentity): boolean {
  const cell = outcomeCell(plan);
  return cell !== null && !cell.claimed;
}
