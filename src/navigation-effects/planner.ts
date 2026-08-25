import { canonicalSha256, deepFreeze, sha256Bytes } from "../canonical";
import type { NavigationCandidate } from "../navigation";
import { normalizeVaultRelative } from "../paths";
import { extractNavigationCandidateBody, mergeGeneratedMocRegion } from "./markers";
import { pathIsWithinRoot, validateVaultRelativePath } from "./path-policy";
import {
  NAVIGATION_EFFECTS_CONTRACT_VERSION,
  type Digest,
  type EffectAuthorityBinding,
  type EffectsPolicyRef,
  type MocApplyPlanningResult,
  type MocOwnershipBinding,
  type NavigationEffectPlan,
} from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RUN_ID_RE = /^[0-9a-z][0-9a-z._-]{0,127}$/;
const RFC3339_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|([+-])(\d{2}):(\d{2}))$/;

function parseRfc3339Instant(value: string): number | undefined {
  const match = RFC3339_INSTANT.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const hour = Number(match[4]), minute = Number(match[5]), second = Number(match[6]);
  const offsetHour = match[8] === undefined ? 0 : Number(match[8]), offsetMinute = match[9] === undefined ? 0 : Number(match[9]);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function canonicalMocArchiveRunPath(date: string, runId: string): string {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (!DATE_RE.test(date) || Number.isNaN(parsed) || new Date(parsed).toISOString().slice(0, 10) !== date) {
    throw new Error("Archive date must be a real calendar date in YYYY-MM-DD form.");
  }
  if (!RUN_ID_RE.test(runId) || !validateVaultRelativePath(runId).valid) throw new Error("Archive run ID contains unsafe characters.");
  return `_archive/moc-runs/${date}/${runId}`;
}

function denied(targetPath: string, ...reasonCodes: string[]): MocApplyPlanningResult {
  return deepFreeze({ status: "denied", targetPath, reasonCodes: [...new Set(reasonCodes)].sort() });
}

export async function planMocApply(input: {
  candidate: NavigationCandidate;
  currentBytes: string | null;
  ownership: MocOwnershipBinding;
  vaultId: string;
  corpusDigest: Digest;
  policyRef: EffectsPolicyRef;
  authority: EffectAuthorityBinding;
  authorityEvaluatedAt: string;
  archiveDate: string;
  runId: string;
}): Promise<MocApplyPlanningResult> {
  const targetValidation = validateVaultRelativePath(input.candidate.targetPath);
  const targetPath = targetValidation.normalized ?? normalizeVaultRelative(input.candidate.targetPath);
  if (!targetValidation.valid) return denied(targetPath, ...targetValidation.reasonCodes);
  if (targetPath !== normalizeVaultRelative(input.ownership.targetPath)) return denied(targetPath, "OWNERSHIP_TARGET_MISMATCH");
  if (input.ownership.ownership === "unmanaged") return denied(targetPath, "MOC_UNMANAGED");
  if (input.authority.capability !== "moc:apply") return denied(targetPath, "CAPABILITY_DENIED");
  if (!pathIsWithinRoot(targetPath, input.authority.allowedRoot)) return denied(targetPath, "TARGET_OUTSIDE_GRANTED_ROOT");
  if (input.policyRef.digest !== input.authority.policyRef.digest || input.policyRef.digest !== input.candidate.policy.digest) return denied(targetPath, "POLICY_BINDING_MISMATCH");
  const authorityEvaluatedAt = parseRfc3339Instant(input.authorityEvaluatedAt);
  const authorityExpiresAt = input.authority.expiresAt === undefined ? undefined : parseRfc3339Instant(input.authority.expiresAt);
  if (authorityEvaluatedAt === undefined) return denied(targetPath, "AUTHORITY_EVALUATION_TIME_INVALID");
  if (input.authority.expiresAt !== undefined && authorityExpiresAt === undefined) return denied(targetPath, "AUTHORITY_EXPIRY_INVALID");
  if (authorityExpiresAt !== undefined && authorityEvaluatedAt >= authorityExpiresAt) return denied(targetPath, "AUTHORITY_EXPIRED");

  const currentDigest = input.currentBytes === null ? undefined : await sha256Bytes(input.currentBytes);
  let proposedBytes: string;
  let preservedHumanPrefix = "";
  let preservedHumanSuffix = "";

  if (input.ownership.ownership === "fully-managed") {
    if (input.currentBytes === null) {
      if (input.ownership.creationAuthorized !== true) return denied(targetPath, "AUTOMATIC_CREATION_NOT_AUTHORIZED");
    } else if (!input.ownership.adoptedDigest || input.ownership.adoptedDigest !== currentDigest) {
      return deepFreeze({ status: "stale", targetPath, currentDigest, reasonCodes: ["ADOPTED_DIGEST_MISMATCH"] });
    }
    proposedBytes = input.candidate.candidateBytes;
  } else {
    if (input.currentBytes === null) return deepFreeze({ status: "review-required", targetPath, reasonCodes: ["REGION_MANAGED_TARGET_MISSING"] });
    if (!input.ownership.generatedRegion) return deepFreeze({ status: "review-required", targetPath, currentDigest, reasonCodes: ["REGION_BINDING_MISSING"] });
    let generatedBody: string;
    try {
      generatedBody = extractNavigationCandidateBody(input.candidate.candidateBytes);
    } catch {
      return deepFreeze({ status: "review-required", targetPath, currentDigest, reasonCodes: ["CANDIDATE_REGION_INVALID"] });
    }
    const merged = await mergeGeneratedMocRegion({
      currentBytes: input.currentBytes,
      generatedBody,
      currentBinding: input.ownership.generatedRegion,
      nextConfigDigest: input.candidate.configRef.digest,
    });
    if (merged.ok === false) return deepFreeze({ status: "review-required", targetPath, currentDigest, reasonCodes: [...merged.reasonCodes] });
    proposedBytes = merged.bytes;
    preservedHumanPrefix = merged.prefix;
    preservedHumanSuffix = merged.suffix;
  }

  const proposedDigest = await sha256Bytes(proposedBytes);
  if (currentDigest === proposedDigest) return deepFreeze({ status: "no-op", targetPath, currentDigest, proposedDigest, reasonCodes: ["BYTE_IDENTICAL"] });
  const archiveRunPath = canonicalMocArchiveRunPath(input.archiveDate, input.runId);
  const authorityDigest = await canonicalSha256(input.authority);
  const precondition = input.currentBytes === null
    ? { target: "absent" as const, configDigest: input.candidate.configRef.digest, authorityDigest, authorityEvaluatedAt: input.authorityEvaluatedAt, retentionHold: "clear" as const }
    : { target: "present" as const, priorDigest: currentDigest, configDigest: input.candidate.configRef.digest, authorityDigest, authorityEvaluatedAt: input.authorityEvaluatedAt, retentionHold: "clear" as const };
  const identity = await canonicalSha256({
    operation: input.currentBytes === null ? "moc:create" : "moc:replace",
    vaultId: input.vaultId,
    targetPath,
    proposedDigest,
    sourceSnapshotDigest: input.candidate.sourceSnapshotDigest,
    corpusDigest: input.corpusDigest,
    configDigest: input.candidate.configRef.digest,
    policyRef: input.policyRef,
    authorityDigest,
    precondition,
  });
  const plan: NavigationEffectPlan = {
    artifactKind: "engine.navigation-effect-plan",
    effectsContract: NAVIGATION_EFFECTS_CONTRACT_VERSION,
    effectId: `effect:${identity.slice(7, 39)}`,
    idempotencyKey: `moc:${identity.slice(7)}`,
    operation: input.currentBytes === null ? "moc:create" : "moc:replace",
    vaultId: input.vaultId,
    targetPath,
    proposedDigest,
    sourceSnapshotDigest: input.candidate.sourceSnapshotDigest,
    corpusDigest: input.corpusDigest,
    configDigest: input.candidate.configRef.digest,
    policyRef: { ...input.policyRef },
    authority: { ...input.authority, actor: { ...input.authority.actor }, policyRef: { ...input.authority.policyRef } },
    precondition,
    ownership: { ...input.ownership, generatedRegion: input.ownership.generatedRegion ? { ...input.ownership.generatedRegion } : undefined },
    archiveRunPath,
  };
  return deepFreeze({
    status: "planned",
    plan,
    planDigest: await canonicalSha256(plan),
    proposedBytes,
    preservedHumanPrefix,
    preservedHumanSuffix,
    reasonCodes: [],
  });
}
