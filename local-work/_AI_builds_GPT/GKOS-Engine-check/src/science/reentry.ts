import { codeUnitCompare } from "../paths";
import type { DigestBinding, ReentryReceipt, ReentryVerification } from "./types";
import { SCIENTIFIC_DIGEST, SCIENTIFIC_REFERENCE, scienceDiagnostic, sortScienceDiagnostics } from "./validate";
import { canonicalizeScientificRecord } from "./canonicalize";

export interface AuthorizedUseBinding extends DigestBinding {}
export interface ContextManifestBinding extends DigestBinding {
  executionManifest?: DigestBinding;
}

function sameBinding(declared: DigestBinding, actual: DigestBinding): boolean {
  return declared?.id === actual?.id && declared?.digest === actual?.digest;
}

/** Verify authority, context, execution and every produced output binding. */
export function verifyReentryReceipt(
  receipt: ReentryReceipt,
  authorizedUse: AuthorizedUseBinding,
  context: ContextManifestBinding,
  sources: readonly DigestBinding[],
): ReentryVerification {
  const diagnostics = [];
  if (!sameBinding(receipt.authorizedUse, authorizedUse)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-REENTRY-003", "error", "Authorized-use id or digest does not match the receipt.", "authorizedUse", receipt.id));
  if (!sameBinding(receipt.contextManifest, context)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-REENTRY-004", "error", "Context-manifest id or digest does not match the receipt.", "contextManifest", receipt.id));
  if (context.executionManifest) {
    if (!sameBinding(receipt.executionManifest, context.executionManifest)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-REENTRY-005", "error", "Execution-manifest id or digest does not match the context binding.", "executionManifest", receipt.id));
  } else diagnostics.push(scienceDiagnostic("GKX-SCIENCE-REENTRY-006", "warning", "Context did not supply an execution-manifest binding; that binding is unevaluated.", "executionManifest", receipt.id));
  const expected = new Map(sources.map((binding) => [binding.id, binding.digest]));
  const actual = new Map(receipt.outputs.map((binding) => [binding.id, binding.digest]));
  const duplicateSourceIds = sources.map((binding) => binding.id).filter((id, index, all) => all.indexOf(id) !== index);
  const duplicateReceiptIds = receipt.outputs.map((binding) => binding.id).filter((id, index, all) => all.indexOf(id) !== index);
  for (const id of [...new Set(duplicateSourceIds)].sort(codeUnitCompare)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-REENTRY-012", "error", `Produced-source bindings contain duplicate output id ${id}.`, "sources", receipt.id));
  for (const id of [...new Set(duplicateReceiptIds)].sort(codeUnitCompare)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-REENTRY-013", "error", `Receipt contains duplicate output id ${id}.`, "outputs", receipt.id));
  const omittedOutputs = [...expected.keys()].filter((id) => !actual.has(id)).sort(codeUnitCompare);
  const unexpectedOutputs = [...actual.keys()].filter((id) => !expected.has(id)).sort(codeUnitCompare);
  for (const id of omittedOutputs) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-REENTRY-007", "error", `Produced output ${id} is omitted from the receipt.`, "outputs", receipt.id));
  for (const id of unexpectedOutputs) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-REENTRY-008", "error", `Receipt contains unexpected output ${id}.`, "outputs", receipt.id));
  for (const [id, digest] of expected) if (actual.has(id) && actual.get(id) !== digest) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-REENTRY-009", "error", `Output ${id} digest does not match its L1 source/artifact.`, "outputs", receipt.id));
  for (const binding of [receipt.authorizedUse, receipt.contextManifest, receipt.executionManifest, ...receipt.outputs, authorizedUse, context, ...(context.executionManifest ? [context.executionManifest] : []), ...sources]) {
    if (!SCIENTIFIC_REFERENCE.test(binding.id) || !SCIENTIFIC_DIGEST.test(binding.digest)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-REENTRY-010", "error", `Invalid id/digest binding for ${binding.id}.`, "digest", receipt.id));
  }
  sortScienceDiagnostics(diagnostics);
  const error = diagnostics.some((d) => d.severity === "error" || d.severity === "critical");
  const unevaluated = diagnostics.some((d) => d.severity === "warning");
  return { status: error ? "FAIL" : unevaluated ? "UNEVALUATED" : "PASS", diagnostics, evidenceRefs: [receipt.id, authorizedUse.id, context.id, ...sources.map((source) => source.id)].sort(codeUnitCompare), receiptId: receipt.id, verifiedReceiptCanonical: canonicalizeScientificRecord(receipt), omittedOutputs, unexpectedOutputs };
}
