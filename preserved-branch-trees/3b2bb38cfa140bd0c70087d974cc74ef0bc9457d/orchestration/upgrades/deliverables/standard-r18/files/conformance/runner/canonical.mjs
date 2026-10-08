import { createHash } from "node:crypto";
import cbor from "cbor";
import { isCanonicalTimestamp } from "./canonical-time.mjs";

const { encodeCanonical, decodeFirstSync } = cbor;

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const clone = (value) => structuredClone(value);

const inspectCanonicalValue = (value, path = "$") => {
  if (typeof value === "string") {
    if (!value.isWellFormed()) throw new Error(`GKOS-GATE-L6-005 invalid Unicode text at ${path}`);
    if (value !== value.normalize("NFC")) throw new Error(`GKOS-GATE-L6-005 non-NFC text at ${path}`);
    if ((path.endsWith("_at") || path.endsWith("_from") || path.endsWith("_until")) && !isCanonicalTimestamp(value)) {
      throw new Error(`GKOS-GATE-L6-004 invalid canonical timestamp at ${path}`);
    }
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new Error(`GKOS-GATE-L6-003 prohibited numeric value at ${path}`);
    return;
  }
  if (value === undefined) throw new Error(`GKOS-GATE-L6-006 undefined is not a canonical artifact value at ${path}`);
  if (value === null || typeof value === "boolean" || typeof value === "bigint") return;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      if (!Object.hasOwn(value, index)) throw new Error(`GKOS-GATE-L6-006 sparse array at ${path}[${index}]`);
      inspectCanonicalValue(value[index], `${path}[${index}]`);
    }
    return;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`unsupported canonical value at ${path}`);
  for (const [key, item] of Object.entries(value)) {
    inspectCanonicalValue(key, `${path}.<key>`);
    inspectCanonicalValue(item, `${path}.${key}`);
  }
};

export const canonicalEncode = (value) => {
  inspectCanonicalValue(value);
  return encodeCanonical(value);
};

export const canonicalHash = (value) => sha256(canonicalEncode(value));

export const verifyCanonicalBytes = (bytes) => {
  let decoded;
  try {
    decoded = decodeFirstSync(bytes, { required: true, preventDuplicateKeys: true, preferMap: false });
  } catch (error) {
    if (error.code === "ERR_ENCODING_INVALID_ENCODED_DATA") throw new Error("GKOS-GATE-L6-005 invalid UTF-8", { cause: error });
    throw new Error("GKOS-GATE-L6-001 invalid canonical CBOR", { cause: error });
  }
  const reencoded = canonicalEncode(decoded);
  if (!Buffer.from(bytes).equals(reencoded)) throw new Error("GKOS-GATE-L6-001 non-canonical CBOR encoding");
  return decoded;
};

const canonicalSet = (values) => [...values]
  .map((value) => ({ value, bytes: canonicalEncode(value) }))
  .sort((left, right) => left.bytes.compare(right.bytes))
  .map(({ value }) => value);

export const captureSelection = (captured) => {
  const selection = clone(captured);
  selection.known_omissions = canonicalSet(selection.known_omissions ?? []);
  selection.closure_inputs = canonicalSet(selection.closure_inputs ?? []);
  canonicalEncode(selection);
  return selection;
};

const artifactKey = (reference) => `${reference.artifact_id}\u0000${reference.artifact_version}\u0000${reference.digest.value}`;

export const validateRequiredClosure = (selection, eligibleSnapshot) => {
  const captured = new Set(selection.closure_inputs.map((item) => `${item.kind}\u0000${artifactKey(item.object_ref)}`));
  for (const required of eligibleSnapshot.required_closure ?? []) {
    const key = `${required.kind}\u0000${artifactKey(required.object_ref)}`;
    if (!captured.has(key)) throw new Error(`GKOS-GATE-L6-009 required ${required.kind} omitted: ${required.object_ref.artifact_id}`);
  }
  return true;
};

const digestRef = (artifactId, artifactVersion, digest) => ({
  artifact_id: artifactId,
  artifact_version: artifactVersion,
  digest: { algorithm: "sha-256", canonical_profile: "GKX-CBOR-1", value: digest },
});

export const assembleContext = (selection, inputs) => {
  const selectionBytes = canonicalEncode(selection);
  const resolved = inputs.resolved_content ?? {};
  for (const member of selection.members) {
    const expected = member.object_ref.digest.value;
    const content = resolved[expected];
    if (typeof content !== "string" || sha256(Buffer.from(content, "utf8")) !== expected) {
      throw new Error(`GKOS-GATE-L6-007 unresolved or mismatched content ${member.object_ref.artifact_id}`);
    }
  }
  for (const closure of selection.closure_inputs) {
    const expected = closure.object_ref.digest.value;
    const content = resolved[expected];
    if (typeof content !== "string" || sha256(Buffer.from(content, "utf8")) !== expected) {
      throw new Error(`GKOS-GATE-L6-007 unresolved or mismatched closure ${closure.object_ref.artifact_id}`);
    }
  }

  const selectedMembers = selection.members.map((member) => ({ kind: "context", object_ref: clone(member.object_ref) }));
  const closureMembers = selection.closure_inputs.map((item) => ({ kind: item.kind, object_ref: clone(item.object_ref) }));
  const manifest = {
    canonical_profile: "GKX-CBOR-1",
    artifact_type: "context-manifest",
    schema_version: "1.0.0",
    manifest_id: inputs.manifest_id,
    manifest_version: inputs.manifest_version,
    purpose: selection.purpose,
    recipient: selection.recipient,
    selection_set_ref: digestRef(selection.selection_set_id, selection.selection_set_version, sha256(selectionBytes)),
    policy_ref: clone(inputs.policy_ref),
    compiler_ref: clone(inputs.compiler_ref),
    compiled_at: inputs.compiled_at,
    members: [...selectedMembers, ...closureMembers],
    known_omissions: canonicalSet(selection.known_omissions),
  };
  canonicalEncode(manifest);
  return manifest;
};

const orderForRendering = (value) => {
  if (Array.isArray(value)) return value.map(orderForRendering);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value)
    .map((key) => ({ key, bytes: canonicalEncode(key) }))
    .sort((left, right) => left.bytes.compare(right.bytes))
    .map(({ key }) => [key, orderForRendering(value[key])]));
};

export const renderDiagnosticJson = (bytes) => {
  const decoded = verifyCanonicalBytes(bytes);
  return `${JSON.stringify({
    rendering_format: "GKX-DIAGNOSTIC-JSON-1",
    artifact_hash: { algorithm: "sha-256", canonical_profile: "GKX-CBOR-1", value: sha256(bytes) },
    canonical_cbor_base64: Buffer.from(bytes).toString("base64"),
    decoded: orderForRendering(decoded),
  }, null, 2)}\n`;
};

export const parseDiagnosticJson = (rendering) => {
  const parsed = JSON.parse(rendering);
  if (parsed.rendering_format !== "GKX-DIAGNOSTIC-JSON-1") throw new Error("GKOS-GATE-L6-008 unsupported rendering format");
  const bytes = Buffer.from(parsed.canonical_cbor_base64, "base64");
  const decoded = verifyCanonicalBytes(bytes);
  if (JSON.stringify(orderForRendering(decoded)) !== JSON.stringify(parsed.decoded)) {
    throw new Error("GKOS-GATE-L6-008 rendered fields do not match canonical bytes");
  }
  if (sha256(bytes) !== parsed.artifact_hash?.value) throw new Error("GKOS-GATE-L6-008 rendering hash mismatch");
  return bytes;
};
