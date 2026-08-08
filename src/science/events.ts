import { codeUnitCompare } from "../paths";
import type { ExecutionEvent, ExecutionEventChainVerification, ExecutionManifest, ScientificAssessmentStatus } from "./types";
import { canonicalizeScientificRecord, canonicalizeScientificValue, scientificSha256 } from "./canonicalize";
import { scienceDiagnostic, sortScienceDiagnostics } from "./validate";

export function executionEventDigestMaterial(event: ExecutionEvent, previousDigest: string | null): unknown {
  const { digest: _digest, previousDigest: _declaredPrevious, ...metadata } = event;
  return canonicalizeScientificValue({ event: metadata, previousDigest });
}

export async function calculateExecutionEventDigest(event: ExecutionEvent, previousDigest: string | null): Promise<string> {
  return scientificSha256(executionEventDigestMaterial(event, previousDigest));
}

/** Verify an ordered SHA-256 event chain without repairing or rewriting it. */
export async function verifyExecutionEventChain(manifest: ExecutionManifest, events: readonly ExecutionEvent[]): Promise<ExecutionEventChainVerification> {
  const diagnostics = [];
  const suppliedIds = events.map((event) => event.id);
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence || codeUnitCompare(a.id, b.id));
  if (suppliedIds.some((id, index) => id !== ordered[index]?.id)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-EVENT-002", "error", "Events are reordered relative to their declared sequence.", "events", manifest.id));
  const seenIds = new Set<string>();
  const seenSequences = new Set<number>();
  for (const event of ordered) {
    if (event.requestRef !== manifest.requestRef) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-EVENT-015", "error", `Event ${event.id} targets a different execution request.`, "requestRef", event.id));
    if (event.runId !== manifest.id) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-EVENT-016", "error", `Event ${event.id} targets a different run.`, "runId", event.id));
    if (seenIds.has(event.id) || seenSequences.has(event.sequence)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-EVENT-003", "error", `Duplicate event identity or sequence at ${event.id}.`, "events", event.id));
    seenIds.add(event.id); seenSequences.add(event.sequence);
  }
  if (ordered.length && ordered[0].sequence !== 0) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-EVENT-004", "error", `Event chain starts at sequence ${ordered[0].sequence}, not 0.`, "sequence", manifest.id));
  for (let i = 1; i < ordered.length; i++) if (ordered[i].sequence !== ordered[i - 1].sequence + 1) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-EVENT-004", "error", `Missing event sequence between ${ordered[i - 1].sequence} and ${ordered[i].sequence}.`, "sequence", manifest.id));
  const expectedRefs = new Set(manifest.eventRefs);
  if (expectedRefs.size !== manifest.eventRefs.length) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-EVENT-003", "error", "Manifest eventRefs contains duplicate identities.", "eventRefs", manifest.id));
  for (const ref of manifest.eventRefs) if (!seenIds.has(ref)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-EVENT-004", "error", `Manifest event ${ref} is missing.`, "eventRefs", manifest.id));
  for (const id of seenIds) if (!expectedRefs.has(id)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-EVENT-005", "error", `Event ${id} is not registered by the manifest.`, "eventRefs", manifest.id));
  if (manifest.eventRefs.some((id, index) => id !== ordered[index]?.id)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-EVENT-019", "error", "Manifest eventRefs order differs from canonical sequence order.", "eventRefs", manifest.id));

  let previous: string | null = null;
  let root: string | undefined;
  let closed = false;
  for (const event of ordered) {
    if (closed) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-EVENT-007", "error", `Event ${event.id} appears after closure.`, "events", event.id));
    if ((event.previousDigest ?? null) !== previous) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-EVENT-008", "error", `Event ${event.id} does not bind the calculated previous digest.`, "previousDigest", event.id));
    const calculated = await calculateExecutionEventDigest(event, previous);
    if (event.digest !== calculated) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-EVENT-009", "error", `Event ${event.id} digest does not match canonical metadata.`, "digest", event.id));
    root ??= calculated;
    previous = calculated;
    if (event.eventType === "closed") closed = true;
  }
  for (let i = 1; i < ordered.length; i++) if (Date.parse(ordered[i].timestamp) < Date.parse(ordered[i - 1].timestamp)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-TEMPORAL-004", "error", `Event ${ordered[i].id} occurs before its predecessor.`, "timestamp", ordered[i].id));
  if (manifest.status === "closed" && !closed) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-EVENT-017", "error", "Closed manifest has no closure event.", "status", manifest.id));
  if (manifest.rootEventDigest && manifest.rootEventDigest !== root) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-EVENT-010", "error", "Manifest root event digest does not match the calculated root.", "rootEventDigest", manifest.id));
  if (!manifest.rootEventDigest) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-EVENT-011", "warning", "Manifest root event digest is absent.", "rootEventDigest", manifest.id));
  if (manifest.finalEventDigest && manifest.finalEventDigest !== previous) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-EVENT-012", "error", "Manifest final event digest does not match the calculated final digest.", "finalEventDigest", manifest.id));
  if (!manifest.finalEventDigest) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-EVENT-013", "warning", "Manifest final event digest is absent.", "finalEventDigest", manifest.id));
  sortScienceDiagnostics(diagnostics);
  const status: ScientificAssessmentStatus = diagnostics.some((d) => d.severity === "error" || d.severity === "critical") ? "FAIL" : diagnostics.length ? "UNEVALUATED" : "PASS";
  return { status, diagnostics, evidenceRefs: [manifest.id, ...ordered.map((event) => event.id)], manifestId: manifest.id, verifiedManifestCanonical: canonicalizeScientificRecord(manifest), verifiedEventsCanonical: canonicalizeScientificRecord(ordered), calculatedRootDigest: root, calculatedFinalDigest: previous ?? undefined, orderedEventIds: ordered.map((event) => event.id) };
}
