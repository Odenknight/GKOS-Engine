import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalBytes, sha256 } from "./canonical";
import { PHASE6_CONTRACT_VERSION } from "./types";

export interface ClosedErrorRow { code: string; retryable: boolean; retry_after_required?: boolean; cli_exit: number; http_status: number; mcp_code: number; visibility: string; }
export interface ClosedErrorEnvelope { contract_version: typeof PHASE6_CONTRACT_VERSION; error_code: string; request_id: string | null; retryable: boolean; retry_after_ms: number | null; error_digest: string; }
export class AuthorityFault extends Error { readonly code: string; readonly requestId: string | null; readonly retryAfterMs: number | null; constructor(code: string, requestId: string | null = null, retryAfterMs: number | null = null) { super(code); this.name = "AuthorityFault"; this.code = code; this.requestId = requestId; this.retryAfterMs = retryAfterMs; } }
export class ClosedErrorRegistry {
  readonly rows: ReadonlyMap<string, ClosedErrorRow>; readonly aliases: ReadonlyMap<string, string>;
  constructor(contractRoot: string) { const fixture = JSON.parse(readFileSync(join(contractRoot, "error-fixture.json"), "utf8")); if (fixture.contract_version !== PHASE6_CONTRACT_VERSION || fixture.error_count !== 53 || fixture.alias_count !== 34 || fixture.errors.length !== 53 || Object.keys(fixture.interface_aliases).length !== 34) throw new Error("accepted error registry coordinate mismatch"); const rows = new Map<string, ClosedErrorRow>(); for (const row of fixture.errors as ClosedErrorRow[]) { if (rows.has(row.code)) throw new Error("duplicate accepted error code"); rows.set(row.code, Object.freeze({ ...row })); } this.rows = rows; this.aliases = new Map(Object.entries(fixture.interface_aliases)); Object.freeze(this); }
  require(code: string): ClosedErrorRow { const row = this.rows.get(code); if (!row) throw new Error("unmapped authority error"); return row; }
  envelope(faultValue: AuthorityFault): ClosedErrorEnvelope { const row = this.require(faultValue.code), retryAfter = row.retry_after_required ? faultValue.retryAfterMs : null; if (row.retry_after_required && (!Number.isInteger(retryAfter) || (retryAfter as number) < 0 || (retryAfter as number) > 60000)) throw new Error("missing bounded retry-after"); const envelope: ClosedErrorEnvelope = { contract_version: PHASE6_CONTRACT_VERSION, error_code: row.code, request_id: faultValue.requestId, retryable: row.retryable, retry_after_ms: retryAfter, error_digest: "" }; const digestInput = { ...envelope }; delete (digestInput as Partial<ClosedErrorEnvelope>).error_digest; envelope.error_digest = sha256(canonicalBytes(digestInput)); return envelope; }
}
export function fault(code: string, requestId: string | null = null, retryAfterMs: number | null = null): never { throw new AuthorityFault(code, requestId, retryAfterMs); }
export function closedFault(error: unknown, requestId: string | null = null): AuthorityFault { return error instanceof AuthorityFault ? error : new AuthorityFault("GKOS_P6_INTERNAL_ERROR", requestId); }
