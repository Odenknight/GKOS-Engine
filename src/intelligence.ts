import {
  FAIL_CLOSED_SENSITIVITY_DEFAULT,
  SENSITIVITY_RANK,
} from "./okf23";
import type { OkfDiagnostic, OkfSensitivity } from "./types";

export const INTELLIGENCE_CONTRACT_VERSION = "gkos.intelligence.v1" as const;

export const INTELLIGENCE_PROPOSAL_TYPES = [
  "diagnostic_explanation",
  "metadata_repair",
  "relationship",
  "classification_raise",
  "claim_extraction",
  "contradiction",
  "documentation_improvement",
] as const;

export type IntelligenceProposalType = typeof INTELLIGENCE_PROPOSAL_TYPES[number];

export interface IntelligenceGenerator {
  system: string;
  programVersion: string;
  model?: string;
}

/**
 * Non-authoritative output from an optional intelligence service.
 *
 * The engine deliberately exposes validation but no automatic apply operation:
 * accepted proposals still require an authorized product workflow to become
 * authored or approved state.
 */
export interface IntelligenceProposal {
  contractVersion: typeof INTELLIGENCE_CONTRACT_VERSION;
  proposalId: string;
  proposalType: IntelligenceProposalType;
  targetId: string;
  proposedPatch?: Record<string, unknown>;
  rationale: string;
  confidence: number;
  evidenceRefs: string[];
  generator: IntelligenceGenerator;
}

export interface IntelligenceRequest {
  contractVersion: typeof INTELLIGENCE_CONTRACT_VERSION;
  requestId: string;
  task: IntelligenceProposalType;
  targetId: string;
  noteText?: string;
  diagnostic?: OkfDiagnostic;
  effectiveSensitivity?: OkfSensitivity;
}

export interface IntelligenceResponse {
  contractVersion: typeof INTELLIGENCE_CONTRACT_VERSION;
  requestId: string;
  proposals: IntelligenceProposal[];
}

export interface IntelligenceProposalContext {
  targetId: string;
  effectiveSensitivity?: OkfSensitivity;
}

export interface IntelligenceValidationResult {
  valid: boolean;
  diagnostics: OkfDiagnostic[];
}

const SAFE_PATCH_FIELDS: Record<IntelligenceProposalType, ReadonlySet<string>> = {
  diagnostic_explanation: new Set(),
  metadata_repair: new Set([
    "title", "description", "timestamp", "created_at", "updated_at",
    "epistemic_state", "epistemic", "sensitivity",
  ]),
  relationship: new Set(["relationships"]),
  classification_raise: new Set(["sensitivity"]),
  claim_extraction: new Set(["claims", "evidence"]),
  contradiction: new Set(["relationships", "contradictions"]),
  documentation_improvement: new Set(),
};

const SENSITIVITY_LEVELS = new Set(Object.keys(SENSITIVITY_RANK));
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,255}$/;

function issue(code: string, message: string, field?: string): OkfDiagnostic {
  return {
    code,
    severity: "error",
    field,
    message,
    deterministic: true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function patchSensitivity(patch: Record<string, unknown>): OkfSensitivity | null {
  const raw = patch.sensitivity;
  if (typeof raw === "string" && SENSITIVITY_LEVELS.has(raw)) return raw as OkfSensitivity;
  if (isRecord(raw) && typeof raw.level === "string" && SENSITIVITY_LEVELS.has(raw.level)) {
    return raw.level as OkfSensitivity;
  }
  return null;
}

/**
 * Deterministically validates an untrusted intelligence proposal.
 *
 * Validation is fail-closed, restricts patches by proposal type, rejects
 * authoritative-looking fields, and enforces sensitivity monotonicity.
 */
export function validateIntelligenceProposal(
  value: unknown,
  context: IntelligenceProposalContext,
): IntelligenceValidationResult {
  const diagnostics: OkfDiagnostic[] = [];
  if (!isRecord(value)) {
    return { valid: false, diagnostics: [issue("GKOS-INTELLIGENCE-001", "Proposal must be a JSON object.")] };
  }

  if (value.contractVersion !== INTELLIGENCE_CONTRACT_VERSION) {
    diagnostics.push(issue("GKOS-INTELLIGENCE-002", `Unsupported intelligence contract version; expected ${INTELLIGENCE_CONTRACT_VERSION}.`, "contractVersion"));
  }
  if (typeof value.proposalId !== "string" || !ID.test(value.proposalId)) {
    diagnostics.push(issue("GKOS-INTELLIGENCE-003", "proposalId must be a stable namespaced identifier.", "proposalId"));
  }
  if (!INTELLIGENCE_PROPOSAL_TYPES.includes(value.proposalType as IntelligenceProposalType)) {
    diagnostics.push(issue("GKOS-INTELLIGENCE-004", "proposalType is not in the safe proposal vocabulary.", "proposalType"));
  }
  if (value.targetId !== context.targetId) {
    diagnostics.push(issue("GKOS-INTELLIGENCE-005", "Proposal target does not match the validated request target.", "targetId"));
  }
  if (typeof value.rationale !== "string" || value.rationale.trim().length < 1 || value.rationale.length > 8_192) {
    diagnostics.push(issue("GKOS-INTELLIGENCE-006", "rationale must be non-empty and at most 8192 characters.", "rationale"));
  }
  if (typeof value.confidence !== "number" || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) {
    diagnostics.push(issue("GKOS-INTELLIGENCE-007", "confidence must be a finite number from 0 through 1.", "confidence"));
  }
  if (!Array.isArray(value.evidenceRefs) || value.evidenceRefs.some((ref) => typeof ref !== "string")) {
    diagnostics.push(issue("GKOS-INTELLIGENCE-008", "evidenceRefs must be an array of strings.", "evidenceRefs"));
  }
  if (!isRecord(value.generator) || typeof value.generator.system !== "string" || typeof value.generator.programVersion !== "string") {
    diagnostics.push(issue("GKOS-INTELLIGENCE-009", "generator must identify the system and program version.", "generator"));
  }

  const proposalType = value.proposalType as IntelligenceProposalType;
  if (INTELLIGENCE_PROPOSAL_TYPES.includes(proposalType)) {
    const patch = value.proposedPatch;
    if (patch !== undefined && !isRecord(patch)) {
      diagnostics.push(issue("GKOS-INTELLIGENCE-010", "proposedPatch must be a JSON object when present.", "proposedPatch"));
    } else if (isRecord(patch)) {
      const allowed = SAFE_PATCH_FIELDS[proposalType];
      for (const field of Object.keys(patch)) {
        if (!allowed.has(field)) diagnostics.push(issue("GKOS-INTELLIGENCE-011", `Field "${field}" is not permitted for ${proposalType} proposals.`, `proposedPatch.${field}`));
      }
      for (const forbidden of ["approved", "authorization", "effective", "authored", "assessment", "uid"]) {
        if (forbidden in patch) diagnostics.push(issue("GKOS-INTELLIGENCE-012", `Intelligence proposals may not set authoritative field "${forbidden}".`, `proposedPatch.${forbidden}`));
      }

      if ("sensitivity" in patch) {
        const proposed = patchSensitivity(patch);
        const current = context.effectiveSensitivity ?? FAIL_CLOSED_SENSITIVITY_DEFAULT;
        if (!proposed) {
          diagnostics.push(issue("GKOS-INTELLIGENCE-013", "A sensitivity patch requires a valid proposed sensitivity.", "proposedPatch.sensitivity"));
        } else if (SENSITIVITY_RANK[proposed] < SENSITIVITY_RANK[current]) {
          diagnostics.push(issue("GKOS-INTELLIGENCE-014", `Sensitivity may only be raised, never lowered (${current} -> ${proposed} rejected).`, "proposedPatch.sensitivity"));
        }
      } else if (proposalType === "classification_raise") {
        diagnostics.push(issue("GKOS-INTELLIGENCE-013", "classification_raise requires a valid proposed sensitivity.", "proposedPatch.sensitivity"));
      }
    } else if (proposalType === "classification_raise" || proposalType === "metadata_repair" || proposalType === "relationship") {
      diagnostics.push(issue("GKOS-INTELLIGENCE-015", `${proposalType} requires a proposedPatch.`, "proposedPatch"));
    }
  }

  return { valid: diagnostics.length === 0, diagnostics };
}

/** Validate a complete sidecar response and retain only safe proposals. */
export function validateIntelligenceResponse(
  value: unknown,
  request: IntelligenceRequest,
): { valid: boolean; proposals: IntelligenceProposal[]; diagnostics: OkfDiagnostic[] } {
  if (!isRecord(value) || value.contractVersion !== INTELLIGENCE_CONTRACT_VERSION || value.requestId !== request.requestId || !Array.isArray(value.proposals)) {
    return {
      valid: false,
      proposals: [],
      diagnostics: [issue("GKOS-INTELLIGENCE-020", "Malformed or mismatched intelligence response envelope.")],
    };
  }
  const proposals: IntelligenceProposal[] = [];
  const diagnostics: OkfDiagnostic[] = [];
  for (const candidate of value.proposals) {
    if (!isRecord(candidate) || candidate.proposalType !== request.task) {
      diagnostics.push(issue(
        "GKOS-INTELLIGENCE-021",
        `Proposal type ${isRecord(candidate) ? String(candidate.proposalType) : "(missing)"} is not authorized by requested task ${request.task}.`,
        "proposalType",
      ));
      continue;
    }
    const result = validateIntelligenceProposal(candidate, {
      targetId: request.targetId,
      effectiveSensitivity: request.effectiveSensitivity,
    });
    diagnostics.push(...result.diagnostics);
    if (result.valid) proposals.push(candidate as unknown as IntelligenceProposal);
  }
  return { valid: diagnostics.length === 0, proposals, diagnostics };
}
