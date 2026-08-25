import { UUID_V7_RE } from "../governance";
import { normalizeVaultRelative } from "../paths";
import type { AgentCapability, AgentGrant, VaultRelativePath } from "./types";

const RESERVED_DEVICE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const RFC3339_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|([+-])(\d{2}):(\d{2}))$/;

function parseRfc3339Instant(value: string): number | undefined {
  if (typeof value !== "string") return undefined;
  const match = RFC3339_INSTANT.exec(value);
  if (!match) return undefined;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const hour = Number(hourText), minute = Number(minuteText), second = Number(secondText);
  const offsetHour = offsetHourText === undefined ? 0 : Number(offsetHourText);
  const offsetMinute = offsetMinuteText === undefined ? 0 : Number(offsetMinuteText);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export interface PathValidationResult {
  valid: boolean;
  normalized?: VaultRelativePath;
  reasonCodes: string[];
}

export function validateVaultRelativePath(raw: string): PathValidationResult {
  const reasonCodes: string[] = [];
  if (typeof raw !== "string" || raw.length === 0) return { valid: false, reasonCodes: ["PATH_EMPTY"] };
  if (raw.includes("\0")) reasonCodes.push("PATH_NUL");
  if (/%(?:00|2e|2f|5c)/i.test(raw)) reasonCodes.push("PATH_ENCODED_TRAVERSAL");
  if (/^[A-Za-z]:/.test(raw)) reasonCodes.push("PATH_DRIVE_ABSOLUTE");
  if (/^[\\/]{2}/.test(raw)) reasonCodes.push("PATH_UNC");
  if (/^[\\/]/.test(raw)) reasonCodes.push("PATH_ABSOLUTE");
  const normalizedUnicode = raw.normalize("NFC");
  const separated = normalizedUnicode.replace(/\\/g, "/");
  const segments = separated.split("/");
  if (segments.some((segment) => segment === "..")) reasonCodes.push("PATH_TRAVERSAL");
  if (segments.some((segment) => segment === "." || segment.length === 0)) reasonCodes.push("PATH_EMPTY_SEGMENT");
  if (segments.some((segment) => /[. ]$/.test(segment))) reasonCodes.push("PATH_TRAILING_DOT_OR_SPACE");
  if (segments.some((segment) => RESERVED_DEVICE.test(segment))) reasonCodes.push("PATH_RESERVED_DEVICE");
  if (segments.some((segment) => /[<>:"|?*]/.test(segment))) reasonCodes.push("PATH_PORTABILITY_HAZARD");
  if (reasonCodes.length) return { valid: false, reasonCodes: [...new Set(reasonCodes)].sort() };
  return { valid: true, normalized: normalizeVaultRelative(separated), reasonCodes: [] };
}

export function validateAgentGrant(grant: AgentGrant, at?: string): string[] {
  const reasons: string[] = [];
  if (!UUID_V7_RE.test(grant.agentId)) reasons.push("AGENT_ID_INVALID");
  if (!grant.enabled) reasons.push("GRANT_DISABLED");
  if (!grant.credentialId) reasons.push("CREDENTIAL_ID_MISSING");
  if (!validateVaultRelativePath(grant.allowedRoot).valid) reasons.push("GRANT_ROOT_INVALID");
  if (!grant.policyRef?.id || !grant.policyRef?.version || !grant.policyRef?.digest) reasons.push("POLICY_REF_INVALID");
  if (!Number.isInteger(grant.maxNoteBytes) || grant.maxNoteBytes < 1) reasons.push("MAX_NOTE_BYTES_INVALID");
  if (!Number.isInteger(grant.maxWritesPerMinute) || grant.maxWritesPerMinute < 1) reasons.push("WRITE_RATE_INVALID");
  const evaluatedAt = at === undefined ? undefined : parseRfc3339Instant(at);
  const expiresAt = grant.expiresAt === undefined ? undefined : parseRfc3339Instant(grant.expiresAt);
  if (at === undefined) reasons.push("GRANT_EVALUATION_TIME_REQUIRED");
  else if (evaluatedAt === undefined) reasons.push("GRANT_EVALUATION_TIME_INVALID");
  if (grant.expiresAt !== undefined && expiresAt === undefined) reasons.push("GRANT_EXPIRY_INVALID");
  if (evaluatedAt !== undefined && expiresAt !== undefined && evaluatedAt >= expiresAt) reasons.push("GRANT_EXPIRED");
  return [...new Set(reasons)].sort();
}

export function resolveAgentNotePath(input: {
  grant: AgentGrant;
  capability: AgentCapability;
  noteName: string;
  at: string;
  existingPaths?: readonly string[];
}): PathValidationResult {
  const grantReasons = validateAgentGrant(input.grant, input.at);
  if (!input.grant.capabilities.includes(input.capability)) grantReasons.push("CAPABILITY_DENIED");
  const root = validateVaultRelativePath(input.grant.allowedRoot);
  const note = validateVaultRelativePath(input.noteName);
  const reasons = [...grantReasons, ...root.reasonCodes, ...note.reasonCodes];
  if (reasons.length || !root.normalized || !note.normalized) return { valid: false, reasonCodes: [...new Set(reasons)].sort() };
  const normalized = `${root.normalized}/${note.normalized}`;
  const folded = normalized.toLowerCase();
  const collision = (input.existingPaths ?? []).map((path) => normalizeVaultRelative(path).normalize("NFC"))
    .find((path) => path !== normalized && path.toLowerCase() === folded);
  if (collision) return { valid: false, reasonCodes: ["PATH_CASE_OR_UNICODE_COLLISION"] };
  return { valid: true, normalized, reasonCodes: [] };
}

export function pathIsWithinRoot(path: string, root: string): boolean {
  const target = validateVaultRelativePath(path);
  const allowed = validateVaultRelativePath(root);
  return !!target.normalized && !!allowed.normalized && (target.normalized === allowed.normalized || target.normalized.startsWith(`${allowed.normalized}/`));
}
