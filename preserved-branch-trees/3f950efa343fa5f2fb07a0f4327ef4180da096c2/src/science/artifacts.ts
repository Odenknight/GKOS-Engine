import type { ArtifactBindingVerification, ArtifactRecord, ExecutionEvent, ScientificTraceManifest } from "./types";
import { SCIENTIFIC_DIGEST, scienceDiagnostic, sortScienceDiagnostics } from "./validate";
import { canonicalizeScientificRecord } from "./canonicalize";

export interface ArtifactVerificationEvidence {
  content?: string | Uint8Array;
  verifiedContentDigest?: string;
}

/** Verify registry, producer, run and optional byte evidence for one artifact. */
export async function verifyArtifactBindings(artifact: ArtifactRecord, trace: ScientificTraceManifest, evidence: ArtifactVerificationEvidence = {}): Promise<ArtifactBindingVerification> {
  const diagnostics = [];
  const records = (id: string | undefined) => id ? trace.nodes.filter((node) => node.id === id).map((node) => node.record) : [];
  const producers = records(artifact.producingEventRef);
  const runs = records(artifact.runRef);
  const producer = producers.length === 1 ? producers[0] : undefined;
  const run = runs.length === 1 ? runs[0] : undefined;
  if (!artifact.producingEventRef || !artifact.runRef) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-ARTIFACT-002", "error", "Artifact requires both producing event and run bindings.", "producingEventRef", artifact.id));
  if (producers.length > 1) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-ARTIFACT-003", "error", "Producing event identity is ambiguous.", "producingEventRef", artifact.id));
  if (runs.length > 1) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-ARTIFACT-004", "error", "Producing run identity is ambiguous.", "runRef", artifact.id));
  if (artifact.producingEventRef && (!producer || producer.kind !== "execution_event")) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-ARTIFACT-003", "error", "Producing event cannot be resolved.", "producingEventRef", artifact.id));
  if (artifact.runRef && (!run || run.kind !== "execution_manifest")) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-ARTIFACT-004", "error", "Producing execution manifest cannot be resolved.", "runRef", artifact.id));
  if (producer?.kind === "execution_event") {
    const event = producer as ExecutionEvent;
    if (!event.artifactRefs.includes(artifact.id)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-ARTIFACT-005", "error", "Producing event does not register the artifact id.", "artifactRefs", artifact.id));
    if (artifact.runRef && event.runId !== artifact.runRef) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-ARTIFACT-010", "error", "Artifact run binding differs from its producing event.", "runRef", artifact.id));
    const registered = event.artifactDigests?.[artifact.id];
    if (registered && registered !== artifact.digest) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-ARTIFACT-006", "error", "Artifact digest differs from its producing event registration.", "digest", artifact.id));
    if (!registered) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-ARTIFACT-007", "warning", "Producing event has no artifact digest registration.", "artifactDigests", artifact.id));
  }
  if (!artifact.codeRefs.length || !artifact.inputRefs.length || !artifact.environmentRef) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-BINDING-001", "error", "Reproducibility requires code, input, and environment bindings.", "artifact", artifact.id));
  if (run?.kind === "execution_manifest") {
    if (!run.eventRefs.includes(artifact.producingEventRef!)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-ARTIFACT-010", "error", "Producing event is not registered by the execution manifest.", "producingEventRef", artifact.id));
    if (!run.artifactRefs.includes(artifact.id)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-ARTIFACT-005", "error", "Execution manifest does not register the artifact id.", "artifactRefs", artifact.id));
    const registered = run.artifactDigests?.[artifact.id];
    if (registered && registered !== artifact.digest) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-ARTIFACT-006", "error", "Artifact digest differs from its execution manifest registration.", "digest", artifact.id));
    if (!registered) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-ARTIFACT-007", "warning", "Execution manifest has no artifact digest registration.", "artifactDigests", artifact.id));
    if (canonicalizeScientificRecord([...artifact.codeRefs].sort()) !== canonicalizeScientificRecord([...run.codeRefs].sort())) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-BINDING-002", "error", "Artifact code bindings differ from the producing run.", "codeRefs", artifact.id));
    if (canonicalizeScientificRecord([...artifact.inputRefs].sort()) !== canonicalizeScientificRecord([...run.inputRefs].sort())) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-BINDING-003", "error", "Artifact input bindings differ from the producing run.", "inputRefs", artifact.id));
    if (artifact.environmentRef !== run.environmentRef) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-BINDING-004", "error", "Artifact environment binding differs from the producing run.", "environmentRef", artifact.id));
  }
  let suppliedDigest = evidence.verifiedContentDigest;
  if (suppliedDigest && !SCIENTIFIC_DIGEST.test(suppliedDigest)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-ARTIFACT-012", "error", "External verifier digest is not a lowercase SHA-256 digest.", "verifiedContentDigest", artifact.id));
  if (evidence.content !== undefined) {
    const bytes = typeof evidence.content === "string" ? new TextEncoder().encode(evidence.content) : Uint8Array.from(evidence.content);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes.buffer);
    const contentDigest = `sha256:${[...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
    if (suppliedDigest && suppliedDigest !== contentDigest) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-ARTIFACT-013", "error", "External verifier digest conflicts with supplied artifact bytes.", "verifiedContentDigest", artifact.id));
    suppliedDigest = contentDigest;
  }
  if (suppliedDigest && suppliedDigest !== artifact.digest) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-ARTIFACT-008", "error", "Artifact bytes do not match the registered digest.", "digest", artifact.id));
  if (!suppliedDigest) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-ARTIFACT-009", "warning", "Artifact bytes were not supplied; content binding is unevaluated.", "digest", artifact.id));
  sortScienceDiagnostics(diagnostics);
  return {
    status: diagnostics.some((d) => d.severity === "error" || d.severity === "critical") ? "FAIL" : diagnostics.some((d) => d.severity === "warning") || !suppliedDigest ? "UNEVALUATED" : "PASS",
    diagnostics,
    evidenceRefs: [artifact.id, ...(artifact.producingEventRef ? [artifact.producingEventRef] : []), ...(artifact.runRef ? [artifact.runRef] : [])],
    artifactId: artifact.id,
    traceId: trace.traceId,
    verifiedArtifactCanonical: canonicalizeScientificRecord(artifact),
    verifiedProducerCanonical: producer ? canonicalizeScientificRecord(producer) : undefined,
    verifiedRunCanonical: run ? canonicalizeScientificRecord(run) : undefined,
    producingEventRef: artifact.producingEventRef,
    runRef: artifact.runRef,
  };
}
