import { canonicalSha256, deepFreeze } from "../canonical";
import { codeUnitCompare, basenameWithoutExtension } from "../paths";
import { isValidGkxTimestamp } from "../timestamps";
import { buildStateChangeReceipt, type ActorRef, type StateChangeReceiptRole, UUID_V7_RE } from "../governance";
import { CANONICAL_MOC_NAMES, normalizeMocBasename } from "./names";
import type {
  MocPromotionProposal,
  VaultNavigationConfig,
  VaultNavigationConfigInput,
} from "./types";

function normalizedPromotions(values: readonly string[]): string[] {
  const canonical = new Set<string>(CANONICAL_MOC_NAMES);
  const out = new Set<string>();
  for (const raw of values) {
    const name = normalizeMocBasename(raw);
    if (!name || name.includes("/") || name.includes("\\") || basenameWithoutExtension(name) !== name) throw new Error(`Invalid promoted MOC basename '${raw}'.`);
    if (!canonical.has(name)) out.add(name);
  }
  return [...out].sort(codeUnitCompare);
}

export async function buildVaultNavigationConfig(input: VaultNavigationConfigInput): Promise<VaultNavigationConfig> {
  if (!UUID_V7_RE.test(input.configId)) throw new Error("Vault navigation configId must be UUIDv7.");
  if (!Number.isInteger(input.version) || input.version < 1) throw new Error("Vault navigation config version must be a positive integer.");
  if (!input.vaultId || !input.createdBy || !input.policy?.id || !input.policy.version) throw new Error("Vault, actor, and policy bindings are required.");
  if (!isValidGkxTimestamp(input.createdAt)) throw new Error("Vault navigation config createdAt must be a portable zoned timestamp.");
  if (input.version > 1 && !input.priorConfigDigest) throw new Error("A versioned promotion requires the prior config digest.");
  const unsigned = {
    ...input,
    promotedMocNames: normalizedPromotions(input.promotedMocNames),
    policy: { ...input.policy },
  };
  return deepFreeze({ ...unsigned, digest: await canonicalSha256(unsigned) });
}

export async function verifyVaultNavigationConfig(config: VaultNavigationConfig): Promise<boolean> {
  const { digest, ...unsigned } = config;
  return digest === await canonicalSha256(unsigned);
}

export function planMocNamePromotion(input: {
  proposalId: string;
  operationId: string;
  vaultId: string;
  observedName: string;
  observedPaths: readonly string[];
  proposedBy: ActorRef;
  proposedAt: string;
}): MocPromotionProposal {
  if (!UUID_V7_RE.test(input.proposalId) || !UUID_V7_RE.test(input.operationId)) throw new Error("Promotion proposal and operation IDs must be UUIDv7.");
  const normalizedName = normalizeMocBasename(input.observedName);
  if (!normalizedName || (CANONICAL_MOC_NAMES as readonly string[]).includes(normalizedName)) throw new Error("Promotion requires a noncanonical basename.");
  return deepFreeze({
    proposalId: input.proposalId,
    operationId: input.operationId,
    vaultId: input.vaultId,
    observedName: input.observedName,
    normalizedName,
    observedPaths: [...new Set(input.observedPaths)].sort(codeUnitCompare),
    proposedBy: { ...input.proposedBy },
    proposedAt: input.proposedAt,
    requiresHumanAcceptance: true,
    sourceContentEffect: "none",
  });
}

export async function acceptMocNamePromotion(input: {
  priorConfig: VaultNavigationConfig;
  proposal: MocPromotionProposal;
  acceptedBy: ActorRef;
  authorityRef: string;
  nextConfigId: string;
  receiptId: string;
  occurredAt: string;
}): Promise<{ config: VaultNavigationConfig; receiptRole: StateChangeReceiptRole }> {
  if (input.acceptedBy.class !== "human" || !input.authorityRef) throw new Error("MOC-name promotion requires an explicit human decision and authority reference.");
  if (input.proposal.vaultId !== input.priorConfig.vaultId) throw new Error("Promotion proposal vault does not match the configuration.");
  if (!await verifyVaultNavigationConfig(input.priorConfig)) throw new Error("Prior navigation configuration digest is invalid.");
  const config = await buildVaultNavigationConfig({
    configId: input.nextConfigId,
    version: input.priorConfig.version + 1,
    vaultId: input.priorConfig.vaultId,
    promotedMocNames: [...input.priorConfig.promotedMocNames, input.proposal.normalizedName],
    createdAt: input.occurredAt,
    createdBy: input.acceptedBy.id,
    priorConfigDigest: input.priorConfig.digest,
    policy: input.priorConfig.policy,
  });
  const receiptRole = buildStateChangeReceipt({
    receiptId: input.receiptId,
    operationId: input.proposal.operationId,
    actor: input.acceptedBy,
    operation: "navigation.config.moc-name.promote",
    targets: [{ id: config.configId, beforeDigest: input.priorConfig.digest, afterDigest: config.digest }],
    authorityRef: input.authorityRef,
    policy: { ...config.policy },
    nondeterministicEscalated: false,
    occurredAt: input.occurredAt,
  });
  return deepFreeze({ config, receiptRole });
}
