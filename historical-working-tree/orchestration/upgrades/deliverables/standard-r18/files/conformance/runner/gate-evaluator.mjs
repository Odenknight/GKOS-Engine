import { isCanonicalTimestamp } from "./canonical-time.mjs";
import { evaluateAuthorityWindow } from "./authority-window.mjs";

const bool = value => typeof value === "boolean";
const text = value => typeof value === "string" && value.trim().length > 0 && value.isWellFormed();
const level = value => typeof value === "number" && Number.isFinite(value) && value >= 0;
const texts = value => Array.isArray(value) && Array.from(value).every(text);
// This is the portable predicate fixture interface, not an artifact/admission schema.
// Digest labels here remain opaque fixture references; full digest validation belongs
// to the schema-owned executor, which these synthetic predicates do not replace.
const shapes = {
  reentry: ["L1-001", {mutates_predecessor:bool}],
  supersession: ["L3-001", {inferred:bool, authorized_declaration:bool}],
  hold: ["L4-001", {evaluation:v => ["clear", "unavailable", "indeterminate"].includes(v), hold_required:bool, erasure_required:bool}],
  "delegation-predicate": ["L4-003", {classification:text}],
  restrictiveness: ["L4-004", {checker_level:level, deterministic_level:level}],
  "deferred-review": ["L5-001", {overdue:bool, valid_exception:bool}],
  "context-binding": ["L5-002", {reviewed_manifest_hash:text, decision_manifest_hash:text}],
  "review-entry": ["L5-003", {governed_acceptance:bool, review_lifecycle_id:text}],
  "decision-record": ["L5-004", {authorized:bool, append_only:bool, proposal_digest:text, bound_proposal_digest:text, evidence_digest:text, bound_evidence_digest:text}],
  "review-independence": ["L5-005", {proposer_id:text, reviewer_id:text, reviewer_type:v => ["human", "agent"].includes(v)}],
  "decision-history": ["L5-006", {deleted_prior:bool, rewritten_prior:bool, traceable:bool}],
  "canonical-encoding": ["L6-001", {profile:text, indefinite_length:bool}],
  "canonical-map": ["L6-002", {duplicate_keys:bool, keys_bytewise_sorted:bool}],
  "canonical-number": ["L6-003", {negative_zero:bool, nan:bool, infinity:bool, schema_type_preserved:bool}],
  "canonical-time": ["L6-004", {value:isCanonicalTimestamp}],
  "canonical-text": ["L6-005", {valid_utf8:bool, nfc:bool}],
  "canonical-state": ["L6-006", {absent_null_empty_conflated:bool}],
  "digest-binding": ["L6-007", {expected_digest:text, actual_digest:text}],
  rendering: ["L6-008", {complete:bool, round_trip_hash:text, canonical_hash:text}],
  "context-closure": ["L6-009", {required_items:texts, included_items:texts}],
  authority: ["L7-001", {valid:bool, valid_from:isCanonicalTimestamp, valid_until:isCanonicalTimestamp, evaluation_time:isCanonicalTimestamp}],
  "effect-containment": ["L7-002", {actor_contains:bool, delegation_contains:bool}],
  "effect-dimensions": ["L7-003", {dimensions:v => texts(v) && v.length > 0 && v.every(x => ["bounded", "reversible"].includes(x))}],
  "authorization-manifest": ["L7-004", {authorized_hash:text, action_hash:text}],
  "receipt-binding": ["L7-005", {reported_committed:bool, durable_receipt:bool}],
  recovery: ["L7-006", {applicable_route:bool, route_usable:bool}],
  "protected-disclosure": ["L7-007", {authorized:bool, exposed:bool, influenced_unauthorized_surface:bool}],
};
const agentShape = {proposer_model_family:text, reviewer_model_family:text, separate_authority:bool, sealed_evidence:bool, deterministic_gates:bool, gate_override:bool, human_escalation_required:bool, human_escalated:bool};

export function evaluateGate(record) {
  if (!record || typeof record !== "object" || Array.isArray(record) || !Object.hasOwn(shapes, record.kind)) {
    // No registered gate exists for an unknown fixture kind. Reject deterministically;
    // never manufacture a normative diagnostic or return the open sentinel.
    throw new TypeError("invalid or unknown gate fixture kind");
  }
  const [suffix, shape] = shapes[record.kind];
  if (!Object.entries(shape).every(([key, valid]) => Object.hasOwn(record, key) && valid(record[key]))) return `GKOS-GATE-${suffix}`;
  if (record.kind === "review-independence" && record.reviewer_type === "agent"
    && !Object.entries(agentShape).every(([key, valid]) => Object.hasOwn(record, key) && valid(record[key]))) return "GKOS-GATE-L5-005";
  switch (record.kind) {
    case "reentry":
      return record.mutates_predecessor ? "GKOS-GATE-L1-001" : null;
    case "supersession":
      return record.inferred && !record.authorized_declaration ? "GKOS-GATE-L3-001" : null;
    case "hold":
      if (["unavailable", "indeterminate"].includes(record.evaluation)) return "GKOS-GATE-L4-001";
      if (record.hold_required && record.erasure_required) return "GKOS-GATE-L4-002";
      return null;
    case "delegation-predicate":
      return record.classification !== "routine" ? "GKOS-GATE-L4-003" : null;
    case "restrictiveness":
      return record.checker_level < record.deterministic_level ? "GKOS-GATE-L4-004" : null;
    case "deferred-review":
      return record.overdue && !record.valid_exception ? "GKOS-GATE-L5-001" : null;
    case "context-binding":
      return record.reviewed_manifest_hash !== record.decision_manifest_hash ? "GKOS-GATE-L5-002" : null;
    case "review-entry":
      return record.governed_acceptance && !record.review_lifecycle_id ? "GKOS-GATE-L5-003" : null;
    case "decision-record":
      return !record.authorized || !record.append_only || record.proposal_digest !== record.bound_proposal_digest || record.evidence_digest !== record.bound_evidence_digest
        ? "GKOS-GATE-L5-004" : null;
    case "review-independence": {
      const agentInvalid = record.reviewer_type === "agent" && (
        record.proposer_model_family === record.reviewer_model_family ||
        !record.separate_authority || !record.sealed_evidence || !record.deterministic_gates ||
        record.gate_override || (record.human_escalation_required && !record.human_escalated)
      );
      return record.proposer_id === record.reviewer_id || agentInvalid ? "GKOS-GATE-L5-005" : null;
    }
    case "decision-history":
      return record.deleted_prior || record.rewritten_prior || !record.traceable ? "GKOS-GATE-L5-006" : null;
    case "canonical-encoding":
      return record.profile !== "GKX-CBOR-1" || record.indefinite_length ? "GKOS-GATE-L6-001" : null;
    case "canonical-map":
      return record.duplicate_keys || !record.keys_bytewise_sorted ? "GKOS-GATE-L6-002" : null;
    case "canonical-number":
      return record.negative_zero || record.nan || record.infinity || !record.schema_type_preserved ? "GKOS-GATE-L6-003" : null;
    case "canonical-time":
      return !isCanonicalTimestamp(record.value) ? "GKOS-GATE-L6-004" : null;
    case "canonical-text":
      return !record.valid_utf8 || !record.nfc ? "GKOS-GATE-L6-005" : null;
    case "canonical-state":
      return record.absent_null_empty_conflated ? "GKOS-GATE-L6-006" : null;
    case "digest-binding":
      return record.expected_digest !== record.actual_digest ? "GKOS-GATE-L6-007" : null;
    case "rendering":
      return !record.complete || record.round_trip_hash !== record.canonical_hash ? "GKOS-GATE-L6-008" : null;
    case "context-closure":
      return record.required_items.some((item) => !record.included_items.includes(item)) ? "GKOS-GATE-L6-009" : null;
    case "authority":
      return !record.valid || !evaluateAuthorityWindow(record).allowed
        ? "GKOS-GATE-L7-001" : null;
    case "effect-containment":
      return !record.actor_contains || !record.delegation_contains ? "GKOS-GATE-L7-002" : null;
    case "effect-dimensions":
      return record.dimensions.some((value) => ["unknown", "indeterminate", "incomparable"].includes(value)) ? "GKOS-GATE-L7-003" : null;
    case "authorization-manifest":
      return record.authorized_hash !== record.action_hash ? "GKOS-GATE-L7-004" : null;
    case "receipt-binding":
      return record.reported_committed && !record.durable_receipt ? "GKOS-GATE-L7-005" : null;
    case "recovery":
      return !record.applicable_route || !record.route_usable ? "GKOS-GATE-L7-006" : null;
    case "protected-disclosure":
      return !record.authorized && (record.exposed || record.influenced_unauthorized_surface) ? "GKOS-GATE-L7-007" : null;
    default:
      throw new Error(`unknown gate fixture kind: ${record.kind}`);
  }
}
