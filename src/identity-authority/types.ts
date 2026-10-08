export const PHASE6_CONTRACT_VERSION = "1.0.0-draft.1" as const;

export type AuthorityTransport =
  | "owner_cli"
  | "native_stdio"
  | "loopback_streamable_http"
  | "private_authority"
  | "effect_bridge"
  | "migration_recovery";

export interface AuthorityClock { now(): Date; monotonicMs(): number; }
export interface AuthorityRandom { bytes(length: number): Uint8Array; }

export interface CredentialHandoff {
  readonly kind: "inherited_handle" | "protected_locator";
  deliver(wire: Uint8Array, binding: CredentialHandoffBinding): Promise<CredentialHandoffResult>;
  validate?(binding: CredentialHandoffBinding, bindingDigest: string): Promise<boolean>;
}
export interface CredentialHandoffBinding { vault_id: string; agent_id: string; credential_id: string; delivery: "inherited_handle" | "protected_locator"; }
export interface CredentialHandoffResult { delivered: boolean; binding_digest: string; }

export interface AuthenticatedPrincipal {
  vault_id: string; authority_instance_id: string; restore_epoch: number; authority_generation: number;
  agent_id: string; authority_role: "owner" | "agent"; auth_epoch: number; credential_id: string;
}
export interface SessionPrincipal extends AuthenticatedPrincipal { session_id: string; transport: "native_stdio" | "loopback_streamable_http"; }
export interface OperationExecutionContext {
  principal: AuthenticatedPrincipal; session_id: string | null; request_id: string; policy_decision_id: string;
  authority_generation: number; auth_epoch: number; transport: AuthorityTransport; deadline_at: string; signal?: AbortSignal;
}
export interface PublicOperationAdapter { execute(operation: string, input: unknown, context: OperationExecutionContext): Promise<unknown>; }
export interface ReferenceIdentityAuthorityOptions {
  vaultRoot: string; anchorRoot: string; credentialRoot: string; contractRoot: string;
  clock?: AuthorityClock; random?: AuthorityRandom; faultAt?: string | null;
}
export interface BootstrapChallenge { challenge: string; vault_path_digest: string; }
export interface OwnerInvocation { credential: string; transport?: "owner_cli" | "private_authority"; handoff?: CredentialHandoff; }
export interface PublicInvocation { credential: string; session_id: string; transport: "native_stdio" | "loopback_streamable_http"; adapter: PublicOperationAdapter; signal?: AbortSignal; }
export interface OpenSessionInput { credential: string; transport: "native_stdio" | "loopback_streamable_http"; }
export interface OpenSessionResult { session_id: string; idle_expires_at: string; absolute_expires_at: string; }
export interface OpaqueReferenceBinding { type: "record" | "scope"; physical_identity: string; locator_digest: string; capability: string; filter_digest: string; policy_decision_id: string; }
export interface EffectOutboxPrepareInput {
  principal: AuthenticatedPrincipal; session_id: string | null; request_id: string; policy_decision_id: string;
  input_digest: string; plan_digest: string; effect_id: string; attempt: number; expected_recovery_gate_digest: string;
}
export interface EffectTerminalEvidence { effects_receipt_digest: string; effects_journal_digest: string; effects_archive_digest: string; }
export interface AuthorityOperationResult { contract_version: typeof PHASE6_CONTRACT_VERSION; request_id: string; result_digest: string; [key: string]: unknown; }
