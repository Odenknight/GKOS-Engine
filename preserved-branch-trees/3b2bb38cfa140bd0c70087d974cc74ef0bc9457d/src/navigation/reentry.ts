import { deepFreeze, sha256Bytes } from "../canonical";
import { codeUnitCompare, normalizeVaultRelative } from "../paths";
import { isValidGkxTimestamp } from "../timestamps";
import type {
  ExplicitSupersessionRequest,
  ReentryIncomingArtifact,
  ReentryPlan,
  ReentryPolicy,
  ReentryPredecessorRef,
  ReentryUnsafeRequests,
} from "./types";

export async function planReentry(
  predecessor: ReentryPredecessorRef,
  incoming: ReentryIncomingArtifact,
  policy: ReentryPolicy,
  options: { supersession?: ExplicitSupersessionRequest; unsafeRequests?: ReentryUnsafeRequests } = {},
): Promise<ReentryPlan> {
  const diagnostics: string[] = [];
  if (!predecessor?.stableId || !predecessor.version || !predecessor.digest) diagnostics.push("REENTRY_PREDECESSOR_BINDING_INCOMPLETE");
  if (!incoming?.sourceId || !incoming.sourceVersion || !incoming.path || typeof incoming.bytes !== "string") diagnostics.push("REENTRY_INCOMING_BINDING_INCOMPLETE");
  if (!policy?.id || !policy.version) diagnostics.push("REENTRY_POLICY_BINDING_INCOMPLETE");
  if (incoming?.sourceId === predecessor?.stableId) diagnostics.push("REENTRY_NEW_IDENTITY_REQUIRED");
  if (!isValidGkxTimestamp(incoming?.acquiredAt)) diagnostics.push("REENTRY_ACQUISITION_TIME_INVALID");
  if (!incoming?.acquiredBy?.id || !incoming.acquisitionMethod) diagnostics.push("REENTRY_PROVENANCE_INCOMPLETE");
  const unsafe = options.unsafeRequests ?? {};
  if (unsafe.mergeIntoPredecessor) diagnostics.push("REENTRY_MERGE_REJECTED");
  if (unsafe.mutatePredecessor) diagnostics.push("REENTRY_PREDECESSOR_MUTATION_REJECTED");
  if (unsafe.inheritStanding) diagnostics.push("REENTRY_STANDING_INHERITANCE_REJECTED");
  if (unsafe.inferSupersession) diagnostics.push("REENTRY_INFERRED_SUPERSESSION_REJECTED");
  if (unsafe.disposePredecessor) diagnostics.push("REENTRY_PREDECESSOR_DISPOSITION_OUT_OF_SCOPE");
  if (options.supersession) {
    if (!options.supersession.requested || !options.supersession.declarationId || !options.supersession.declaredBy?.id) diagnostics.push("REENTRY_SUPERSESSION_DECLARATION_INCOMPLETE");
    const humanAuthority = options.supersession.declaredBy?.class === "human" && !!options.supersession.authorityRef;
    const delegatedAuthority = options.supersession.declaredBy?.class === "agent" && !!options.supersession.delegationRef;
    if (!humanAuthority && !delegatedAuthority) diagnostics.push("REENTRY_SUPERSESSION_AUTHORITY_MISSING");
  }
  diagnostics.sort(codeUnitCompare);
  const base = {
    artifactKind: "engine.reentry-plan" as const,
    policy: { ...policy },
    predecessorRef: { ...predecessor },
    predecessorMutation: false as const,
    predecessorDisposition: null,
    diagnostics,
  };
  if (diagnostics.length) return deepFreeze({ ...base, status: "rejected", sourceProposal: null, supersessionProposal: null });

  const digest = await sha256Bytes(incoming.bytes);
  const sourceProposal: NonNullable<ReentryPlan["sourceProposal"]> = {
    layer: "L1",
    stableId: incoming.sourceId,
    version: incoming.sourceVersion,
    digest,
    path: normalizeVaultRelative(incoming.path),
    bytes: incoming.bytes,
    provenance: { acquiredAt: incoming.acquiredAt, acquiredBy: { ...incoming.acquiredBy }, acquisitionMethod: incoming.acquisitionMethod },
    inheritedStanding: false,
  };
  const supersessionProposal = options.supersession ? {
    semanticEffect: "explicit-proposal-only" as const,
    predecessorRef: { ...predecessor },
    successorRef: { stableId: sourceProposal.stableId, version: sourceProposal.version, digest: sourceProposal.digest },
    declarationId: options.supersession.declarationId,
    declaredBy: { ...options.supersession.declaredBy },
    ...(options.supersession.authorityRef ? { authorityRef: options.supersession.authorityRef } : {}),
    ...(options.supersession.delegationRef ? { delegationRef: options.supersession.delegationRef } : {}),
  } : null;
  return deepFreeze({ ...base, status: "planned", sourceProposal, supersessionProposal });
}

/** There is deliberately no heuristic implementation behind this symbol. */
export function inferSupersession(): never {
  throw new Error("Semantic supersession requires an explicit human or valid bounded-delegation declaration.");
}
