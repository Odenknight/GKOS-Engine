import test from "node:test";
import assert from "node:assert/strict";
import { link, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import * as core from "../dist/gkos-engine.mjs";
import * as gkx from "../dist/gkx.mjs";
import * as retrieval from "../dist/retrieval.mjs";
import * as retrievalHost from "../dist/retrieval-host.mjs";
import {
  INGEST_AUTHORITY_COORDINATES,
  INGEST_CURRENT_PROFILE_SELECTOR,
  INGEST_FINDING_CODES,
  INGEST_FINDING_SEVERITY_FLOORS,
  assertIngestValidationPlan,
  buildIngestValidationPlan,
  loadIngestProfile,
  sealIngestFindingEnvelope,
  sealIngestProfileCoordinate,
  sealIngestRejectionEnvelope,
  sealIngestValidationResultEnvelope,
  sealNormalizedIngestProfileEnvelope,
  validateIngestProfileLocalSelector,
} from "../dist/ingest-host.mjs";

const CONTRACT_DIRECTORY = new URL("../contracts/ingest/gkos-ingest-validation-1.0.0-draft.1/", import.meta.url);
const SCHEMA_NAMES = Object.freeze([
  "profile-coordinate.schema.json", "normalized-profile.schema.json", "finding.schema.json",
  "rejection.schema.json", "result.schema.json",
]);
const SCHEMAS = Object.freeze(Object.fromEntries(SCHEMA_NAMES.map((name) => [name, JSON.parse(readFileSync(new URL(name, CONTRACT_DIRECTORY), "utf8"))])));
const CONFORMANCE = JSON.parse(readFileSync(new URL("conformance-fixture.json", CONTRACT_DIRECTORY), "utf8"));
const CONTRACT = JSON.parse(readFileSync(new URL("contract.json", CONTRACT_DIRECTORY), "utf8"));

function clone(value) {
  return structuredClone(value);
}

function without(record, key) {
  const copy = { ...record };
  delete copy[key];
  return copy;
}

function resealFinding(value) {
  return { ...value, finding_id: retrieval.retrievalCanonicalDigest(without(value, "finding_id")) };
}

function resealRejection(value) {
  return { ...value, rejection_digest: retrieval.retrievalCanonicalDigest(without(value, "rejection_digest")) };
}

function sortSafeFindings(values) {
  return [...values].sort((left, right) =>
    (left.source_path ?? "") < (right.source_path ?? "") ? -1 :
      (left.source_path ?? "") > (right.source_path ?? "") ? 1 :
        (left.source_observation_ordinal ?? -1) - (right.source_observation_ordinal ?? -1) ||
        (left.line ?? Number.MAX_SAFE_INTEGER) - (right.line ?? Number.MAX_SAFE_INTEGER) ||
        (left.code < right.code ? -1 : left.code > right.code ? 1 :
          (left.field ?? "") < (right.field ?? "") ? -1 : (left.field ?? "") > (right.field ?? "") ? 1 :
            left.finding_id < right.finding_id ? -1 : left.finding_id > right.finding_id ? 1 : 0));
}

function sortSafeRejections(values) {
  return [...values].sort((left, right) =>
    left.source_path < right.source_path ? -1 : left.source_path > right.source_path ? 1 :
      left.source_observation_ordinal - right.source_observation_ordinal ||
      (left.rejection_digest < right.rejection_digest ? -1 : left.rejection_digest > right.rejection_digest ? 1 : 0));
}

function schemaValidators() {
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  for (const schema of Object.values(SCHEMAS)) ajv.addSchema(schema);
  return Object.freeze({
    ajv,
    coordinate: ajv.getSchema(SCHEMAS["profile-coordinate.schema.json"].$id),
    normalized: ajv.getSchema(SCHEMAS["normalized-profile.schema.json"].$id),
    finding: ajv.getSchema(SCHEMAS["finding.schema.json"].$id),
    rejection: ajv.getSchema(SCHEMAS["rejection.schema.json"].$id),
    result: ajv.getSchema(SCHEMAS["result.schema.json"].$id),
  });
}

const IDS = Object.freeze([
  "018f0000-0000-7000-8000-000000000301",
  "018f0000-0000-7000-8000-000000000302",
  "018f0000-0000-7000-8000-000000000303",
]);
const CREATED = "2026-08-01T00:00:00Z";
const CREATED_MS = Date.parse(CREATED);

function note(uid, title = "Validated", options = {}) {
  const sensitivity = options.omitSensitivity ? "" : `sensitivity: "${options.sensitivity ?? "public"}"\n`;
  return `---\ngkx_version: "2.3"\nuid: "${uid}"\ntitle: "${title}"\ntype: "policy"\ncreated_at: "${options.createdAt ?? CREATED}"\nepistemic_state: "reported"\n${sensitivity}${options.extra ?? ""}---\n# ${title}\n${options.body ?? "Validated body."}\n`;
}

function source(relativePath, content, extra = {}) {
  const name = relativePath.split("/").at(-1);
  const dot = name.lastIndexOf(".");
  return {
    relativePath,
    name,
    extension: dot < 0 ? "" : name.slice(dot + 1),
    size: Buffer.byteLength(content, "utf8"),
    createdTime: CREATED_MS,
    content,
    kind: "note",
    ...extra,
  };
}

function input(files, scanRejections = []) {
  return { files, folders: [], attachments: [], scan_rejections: scanRejections };
}

async function temporaryFile(t, name, content) {
  const directory = await mkdtemp(join(tmpdir(), "gkos-ingest-profile-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, name);
  await writeFile(path, content, "utf8");
  return { directory, path };
}

const OVERLAY = `contract_version = "gkos-frontmatter-profile/1.0.0-draft.1"
profile_id = "operator-strict"
required_fields = ["x-owner"]
unknown_fields = "warn"
minimum_sensitivity = "internal"

[severity]
GKX-SCHEMA-003 = "error"

[fields.title]
min_length = 4
max_length = 64

[fields.epistemic_state]
enum = ["reported", "supported"]

[fields.x-owner]
type = "string"
required = true
max_length = 32
`;

test("built-in and overlay profiles expose exact, path-free normalized authority envelopes", async (t) => {
  const builtIn = await loadIngestProfile();
  const named = await loadIngestProfile(INGEST_CURRENT_PROFILE_SELECTOR);
  assert.deepEqual(named, builtIn);
  assert.equal(builtIn.coordinate.standard_commit, "a2a2a6ca5c4dac32c6d9dc985ed7460f5f4350c6");
  assert.equal(builtIn.normalized.standard_commit, INGEST_AUTHORITY_COORDINATES.standard_commit);
  assert.equal(builtIn.normalized.standard_frontmatter_schema_sha256, INGEST_AUTHORITY_COORDINATES.standard_frontmatter_schema_sha256);
  assert.equal(builtIn.normalized.standard_common_defs_sha256, INGEST_AUTHORITY_COORDINATES.standard_common_defs_sha256);
  assert.equal(builtIn.normalized.standard_diagnostics_sha256, INGEST_AUTHORITY_COORDINATES.standard_diagnostics_sha256);
  assert.equal(builtIn.normalized.engine_projection_profile, INGEST_AUTHORITY_COORDINATES.engine_projection_profile);
  assert.equal(builtIn.normalized.engine_policy_id, INGEST_AUTHORITY_COORDINATES.engine_policy_id);
  assert.equal(builtIn.normalized.engine_policy_hash, INGEST_AUTHORITY_COORDINATES.engine_policy_hash);
  assert.equal(builtIn.coordinate.effective_profile_digest, retrieval.retrievalCanonicalDigest(builtIn.normalized));
  assert.equal(Object.isFrozen(builtIn), true);
  assert.equal(Object.isFrozen(builtIn.normalized), true);
  assert.equal(Object.isFrozen(builtIn.normalized.fields), true);

  const first = await temporaryFile(t, "profile-a.toml", OVERLAY);
  const second = await temporaryFile(t, "profile-b.toml", `# semantically inert comment\n${OVERLAY}\n`);
  const a = await loadIngestProfile(first.path);
  const b = await loadIngestProfile(second.path);
  assert.notEqual(a.coordinate.overlay_sha256, b.coordinate.overlay_sha256);
  assert.deepEqual(a.normalized, b.normalized);
  assert.equal(a.coordinate.effective_profile_digest, b.coordinate.effective_profile_digest);
  assert.equal(a.coordinate.effective_profile_digest, retrieval.retrievalCanonicalDigest(a.normalized));
  assert.equal(JSON.stringify({ coordinate: a.coordinate, normalized: a.normalized }).includes(first.directory), false);
  assert.deepEqual(a.normalized.required_fields, ["created_at", "epistemic_state", "gkx_version", "title", "type", "uid", "x-owner"]);
  assert.equal(a.normalized.minimum_sensitivity, "internal");
  assert.equal(a.normalized.unknown_fields, "warn");

  const raisedOptionalFile = await temporaryFile(t, "required-optional.toml", `contract_version = "gkos-frontmatter-profile/1.0.0-draft.1"
profile_id = "required-optional"
required_fields = ["updated_at"]
`);
  const raisedOptional = await loadIngestProfile(raisedOptionalFile.path);
  assert.ok(raisedOptional.normalized.required_fields.includes("updated_at"));
  assert.equal(raisedOptional.normalized.fields.find((field) => field.field === "sensitivity").required, false);
  assert.equal(raisedOptional.normalized.fields.find((field) => field.field === "updated_at").required, true);
  assert.equal(schemaValidators().normalized(raisedOptional.normalized), true);
});

test("strict TOML overlay algebra rejects widening, coercive, duplicate, and unsupported forms", async (t) => {
  for (const fixture of CONFORMANCE.profile_selector_pre_io_reject_inputs) {
    const selector = typeof fixture === "string" ? fixture : String.fromCharCode(...fixture.code_units);
    await assert.rejects(loadIngestProfile(selector), /GKX_INGEST_PROFILE_SELECTOR_INVALID/, `pre-I/O ${selector}`);
  }
  if (process.platform === "win32") {
    assert.throws(
      () => validateIngestProfileLocalSelector("profile.toml", String.raw`\\server\share\operator`),
      /GKX_INGEST_PROFILE_SELECTOR_INVALID/,
    );
  }
  const invalid = [
    ["duplicate", OVERLAY.replace('profile_id = "operator-strict"', 'profile_id = "operator-strict"\nprofile_id = "again"'), /GKX_INGEST_PROFILE_TOML_DUPLICATE_KEY/],
    ["float", OVERLAY.replace("max_length = 64", "max_length = 64.0"), /GKX_INGEST_PROFILE_TOML_VALUE_UNSUPPORTED/],
    ["datetime", OVERLAY.replace('profile_id = "operator-strict"', "profile_id = 2026-08-01T00:00:00Z"), /GKX_INGEST_PROFILE_TOML_VALUE_UNSUPPORTED/],
    ["single-quote", OVERLAY.replace('profile_id = "operator-strict"', "profile_id = 'operator-strict'"), /GKX_INGEST_PROFILE_TOML_VALUE_UNSUPPORTED/],
    ["escaped-slash", OVERLAY.replace('profile_id = "operator-strict"', 'profile_id = "operator\\/strict"'), /GKX_INGEST_PROFILE_TOML_STRING_INVALID/],
    ["inline-table", OVERLAY.replace('unknown_fields = "warn"', "unknown_fields = { mode = \"warn\" }"), /GKX_INGEST_PROFILE_TOML_VALUE_UNSUPPORTED/],
    ["dotted-key", OVERLAY.replace('profile_id = "operator-strict"', 'profile.id = "operator-strict"'), /GKX_INGEST_PROFILE_TOML_ASSIGNMENT_INVALID/],
    ["quoted-key", OVERLAY.replace('profile_id = "operator-strict"', '"profile_id" = "operator-strict"'), /GKX_INGEST_PROFILE_TOML_ASSIGNMENT_INVALID/],
    ["array-table", OVERLAY.replace("[fields.x-owner]", "[[fields.x-owner]]"), /GKX_INGEST_PROFILE_TOML_TABLE_INVALID/],
    ["nested-table", OVERLAY.replace("[fields.x-owner]", "[fields.x-owner.nested]"), /GKX_INGEST_PROFILE_TOML_TABLE_INVALID/],
    ["multiline-string", OVERLAY.replace('profile_id = "operator-strict"', 'profile_id = """operator-strict"""'), /GKX_INGEST_PROFILE_TOML_STRING_INVALID/],
    ["nan", OVERLAY.replace("max_length = 64", "max_length = nan"), /GKX_INGEST_PROFILE_TOML_VALUE_UNSUPPORTED/],
    ["infinity", OVERLAY.replace("max_length = 64", "max_length = inf"), /GKX_INGEST_PROFILE_TOML_VALUE_UNSUPPORTED/],
    ["exponent", OVERLAY.replace("max_length = 64", "max_length = 1e3"), /GKX_INGEST_PROFILE_TOML_VALUE_UNSUPPORTED/],
    ["signed-integer", OVERLAY.replace("max_length = 64", "max_length = +64"), /GKX_INGEST_PROFILE_TOML_VALUE_UNSUPPORTED/],
    ["negative-integer", OVERLAY.replace("max_length = 64", "max_length = -1"), /GKX_INGEST_PROFILE_TOML_VALUE_UNSUPPORTED/],
    ["leading-zero-integer", OVERLAY.replace("max_length = 64", "max_length = 064"), /GKX_INGEST_PROFILE_TOML_VALUE_UNSUPPORTED/],
    ["hex-integer", OVERLAY.replace("max_length = 64", "max_length = 0x40"), /GKX_INGEST_PROFILE_TOML_VALUE_UNSUPPORTED/],
    ["octal-integer", OVERLAY.replace("max_length = 64", "max_length = 0o100"), /GKX_INGEST_PROFILE_TOML_VALUE_UNSUPPORTED/],
    ["binary-integer", OVERLAY.replace("max_length = 64", "max_length = 0b1000000"), /GKX_INGEST_PROFILE_TOML_VALUE_UNSUPPORTED/],
    ["nested-array", OVERLAY.replace('enum = ["reported", "supported"]', 'enum = [["reported"], "supported"]'), /GKX_INGEST_PROFILE_TOML_(?:ARRAY_INVALID|VALUE_UNSUPPORTED)/],
    ["trailing-array-comma", OVERLAY.replace('enum = ["reported", "supported"]', 'enum = ["reported", "supported",]'), /GKX_INGEST_PROFILE_TOML_ARRAY_INVALID/],
    ["control-comment", `${OVERLAY}#\tforbidden\n`, /GKX_INGEST_PROFILE_TOML_CONTROL_INVALID/],
    ["vertical-tab", `${OVERLAY}#\vforbidden\n`, /GKX_INGEST_PROFILE_TOML_CONTROL_INVALID/],
    ["bare-carriage-return", OVERLAY.replace("\nprofile_id", "\rprofile_id"), /GKX_INGEST_PROFILE_TOML_CONTROL_INVALID/],
    ["nbsp-before-assignment", OVERLAY.replace("profile_id =", "profile_id\u00a0="), /GKX_INGEST_PROFILE_TOML_ASSIGNMENT_INVALID/],
    ["nbsp-after-assignment", OVERLAY.replace('profile_id = "operator-strict"', 'profile_id =\u00a0"operator-strict"'), /GKX_INGEST_PROFILE_TOML_VALUE_UNSUPPORTED/],
    ["nbsp-array-separator", OVERLAY.replace('["reported", "supported"]', '["reported",\u00a0"supported"]'), /GKX_INGEST_PROFILE_TOML_(?:ARRAY_INVALID|VALUE_UNSUPPORTED)/],
    ["feff-line-prefix", `\uFEFF${OVERLAY}`, /GKX_INGEST_PROFILE_TOML_ASSIGNMENT_INVALID/],
    ["feff-table-suffix", OVERLAY.replace("[fields.x-owner]", "[fields.x-owner]\uFEFF"), /GKX_INGEST_PROFILE_TOML_TABLE_INVALID/],
    ["trailing-junk", OVERLAY.replace('profile_id = "operator-strict"', 'profile_id = "operator-strict" junk'), /GKX_INGEST_PROFILE_TOML_(?:STRING_INVALID|VALUE_UNSUPPORTED)/],
    ["include-key", OVERLAY.replace('profile_id = "operator-strict"', 'profile_id = "operator-strict"\ninclude = "remote.toml"'), /GKX_INGEST_PROFILE_ROOT_FIELDS_INVALID/],
    ["schema-ref-key", OVERLAY.replace('profile_id = "operator-strict"', 'profile_id = "operator-strict"\nschema_ref = "remote"'), /GKX_INGEST_PROFILE_ROOT_FIELDS_INVALID/],
    ["unknown-severity", OVERLAY.replace("[severity]", "[severity]\nGKX-INVENTED-999 = \"error\""), /GKX_INGEST_PROFILE_SEVERITY_INVALID/],
    ["unknown-field-rule", OVERLAY.replace("max_length = 32", "max_length = 32\ndefault = \"owner\""), /GKX_INGEST_PROFILE_FIELD_RULE_INVALID/],
    ["canonical-type", `${OVERLAY}\n[fields.uid]\ntype = "integer"\n`, /GKX_INGEST_PROFILE_FIELD_TYPE_INVALID/],
    ["unfrozen-domain", `${OVERLAY}\n[fields.provenance]\ntype = "string"\n`, /GKX_INGEST_PROFILE_FIELD_ID_INVALID/],
    ["enum-widen", OVERLAY.replace('enum = ["reported", "supported"]', 'enum = ["reported", "invented"]'), /GKX_INGEST_PROFILE_FIELD_ENUM_INVALID/],
    ["length-widen", OVERLAY.replace("min_length = 4", "min_length = 0"), /GKX_INGEST_PROFILE_FIELD_LENGTH_INVALID/],
    ["required-downgrade", OVERLAY.replace("required = true", "required = false"), /GKX_INGEST_PROFILE_FIELD_REQUIRED_INVALID/],
    ["severity-downgrade", OVERLAY.replace('GKX-SCHEMA-003 = "error"', 'GKX-SCHEMA-004 = "warning"'), /GKX_INGEST_PROFILE_SEVERITY_INVALID/],
    ["extension-untyped", OVERLAY.replace('type = "string"\nrequired = true\nmax_length = 32', "required = true\nmax_length = 32"), /GKX_INGEST_PROFILE_FIELD_TYPE_INVALID/],
    ["dotted-extension-id", OVERLAY.replace("[fields.x-owner]", "[fields.x-owner.part]"), /GKX_INGEST_PROFILE_TOML_(?:SECTION|TABLE)_INVALID|GKX_INGEST_PROFILE_FIELD_ID_INVALID/],
    ["required-empty-domain", `contract_version = "gkos-frontmatter-profile/1.0.0-draft.1"\nprofile_id = "required-empty"\n[fields.updated_at]\nrequired = true\nmax_length = 0\n`, /GKX_INGEST_PROFILE_FIELD_DOMAIN_EMPTY/],
    ["required-extension-empty-domain", `contract_version = "gkos-frontmatter-profile/1.0.0-draft.1"\nprofile_id = "required-extension-empty"\n[fields.x-owner]\ntype = "string"\nrequired = true\nmax_length = 0\n`, /GKX_INGEST_PROFILE_FIELD_DOMAIN_EMPTY/],
    ["required-blank-enum", `contract_version = "gkos-frontmatter-profile/1.0.0-draft.1"\nprofile_id = "required-blank"\n[fields.title]\nenum = ["   "]\n`, /GKX_INGEST_PROFILE_FIELD_DOMAIN_EMPTY/],
    ["enum-length-empty", `contract_version = "gkos-frontmatter-profile/1.0.0-draft.1"\nprofile_id = "enum-length-empty"\n[fields.title]\nmin_length = 4\nenum = ["xx"]\n`, /GKX_INGEST_PROFILE_FIELD_DOMAIN_EMPTY/],
    ["sensitivity-empty", `contract_version = "gkos-frontmatter-profile/1.0.0-draft.1"\nprofile_id = "sensitivity-empty"\nminimum_sensitivity = "secret"\n[fields.sensitivity]\nrequired = true\nenum = ["public"]\n`, /GKX_INGEST_PROFILE_SENSITIVITY_REQUIRED_INVALID/],
    ["optional-sensitivity-empty", `contract_version = "gkos-frontmatter-profile/1.0.0-draft.1"\nprofile_id = "optional-sensitivity-empty"\nminimum_sensitivity = "secret"\n[fields.sensitivity]\nenum = ["public"]\n`, /GKX_INGEST_PROFILE_SENSITIVITY_DOMAIN_EMPTY/],
    ["string-ceiling", OVERLAY.replace("max_length = 32", "max_length = 262145"), /GKX_INGEST_PROFILE_FIELD_LENGTH_INVALID/],
    ["extension-id-too-long", OVERLAY.replace("x-owner", `x-${"a".repeat(64)}`), /GKX_INGEST_PROFILE_(?:FIELD_ID|REQUIRED_FIELDS)_INVALID/],
    ["sensitivity-required-list", `contract_version = "gkos-frontmatter-profile/1.0.0-draft.1"\nprofile_id = "sensitivity-required-list"\nrequired_fields = ["sensitivity"]\n`, /GKX_INGEST_PROFILE_SENSITIVITY_REQUIRED_INVALID/],
    ["sensitivity-required-rule", `contract_version = "gkos-frontmatter-profile/1.0.0-draft.1"\nprofile_id = "sensitivity-required-rule"\n[fields.sensitivity]\nrequired = true\n`, /GKX_INGEST_PROFILE_SENSITIVITY_REQUIRED_INVALID/],
    ["sensitivity-warning-escalation", `contract_version = "gkos-frontmatter-profile/1.0.0-draft.1"\nprofile_id = "sensitivity-severity"\n[severity]\nGKX-SENSITIVITY-001 = "error"\n`, /GKX_INGEST_PROFILE_SEVERITY_INVALID/],
  ];
  for (const [name, content, expected] of invalid) {
    const item = await temporaryFile(t, `${name}.toml`, content);
    await assert.rejects(loadIngestProfile(item.path), expected, name);
  }

  const overlayLines = OVERLAY.trimEnd().split(/\r?\n/u);
  for (const [label, newline] of [["lf", "\n"], ["crlf", "\r\n"]]) {
    for (const terminal of [false, true]) {
      const exactLines = [...Array(2048 - overlayLines.length).fill("#"), ...overlayLines].join(newline) +
        (terminal ? newline : "");
      const exact = await temporaryFile(t, `exact-lines-${label}-${terminal}.toml`, exactLines);
      assert.equal((await loadIngestProfile(exact.path)).coordinate.profile_id, "operator-strict");
    }
    const overLines = [...Array(2049 - overlayLines.length).fill("#"), ...overlayLines].join(newline) + newline;
    const over = await temporaryFile(t, `too-many-lines-${label}.toml`, overLines);
    await assert.rejects(loadIngestProfile(over.path), /GKX_INGEST_PROFILE_TOML_BOUNDS_EXCEEDED/);
  }
  const hardlinkOriginal = await temporaryFile(t, "hardlink-source.toml", OVERLAY);
  const hardlink = join(hardlinkOriginal.directory, "hardlink.toml");
  await link(hardlinkOriginal.path, hardlink);
  await assert.rejects(loadIngestProfile(hardlink), /GKX_INGEST_PROFILE_PATH_HARDLINK_REJECTED/);

  const allowed = await temporaryFile(t, "allowed-escapes.toml", OVERLAY
    .replace('profile_id = "operator-strict"', 'profile_id = "operator-\\u0073trict"')
    .replace("max_length = 32", 'max_length = 32\nenum = ["alpha\\\\beta", "\\u0063"]'));
  const allowedProfile = await loadIngestProfile(allowed.path);
  assert.equal(allowedProfile.coordinate.profile_id, "operator-strict");
  assert.deepEqual(allowedProfile.normalized.fields.find((field) => field.field === "x-owner").enum, ["alpha\\beta", "c"]);

  for (const [length, accepted] of [[512, true], [513, false]]) {
    const enumBoundary = await temporaryFile(t, `enum-item-${length}.toml`, `contract_version = "gkos-frontmatter-profile/1.0.0-draft.1"
profile_id = "enum-boundary-${length}"
[fields.x-enum-boundary]
type = "string"
enum = ["${"a".repeat(length)}"]
`);
    if (accepted) {
      const loaded = await loadIngestProfile(enumBoundary.path);
      assert.equal(loaded.normalized.fields.find((field) => field.field === "x-enum-boundary").enum[0].length, 512);
    } else await assert.rejects(loadIngestProfile(enumBoundary.path), /GKX_INGEST_PROFILE_FIELD_ENUM_INVALID/);
  }

  const asciiSpaceAndUnicodeValue = await temporaryFile(t, "unicode-local-π.toml", OVERLAY
    .replace('profile_id = "operator-strict"', '  profile_id   =   "operator-strict"   # NBSP \u00a0 and FEFF \uFEFF are inert inside comments')
    .replace("max_length = 32", 'max_length = 32\nenum = [ "a\u00a0b" , "x\uFEFFy" ]'));
  const asciiSpaceAndUnicodeProfile = await loadIngestProfile(asciiSpaceAndUnicodeValue.path);
  assert.deepEqual(asciiSpaceAndUnicodeProfile.normalized.fields.find((field) => field.field === "x-owner").enum,
    ["a\u00a0b", "x\uFEFFy"]);

  const boundaryId = `x-${"a".repeat(63)}`;
  const boundaryIdFile = await temporaryFile(t, "boundary-id.toml", `contract_version = "gkos-frontmatter-profile/1.0.0-draft.1"
profile_id = "boundary-id"
[fields.${boundaryId}]
type = "boolean"
`);
  const boundaryIdProfile = await loadIngestProfile(boundaryIdFile.path);
  assert.ok(boundaryIdProfile.normalized.fields.some((field) => field.field === boundaryId));

  const mixedSensitivityFile = await temporaryFile(t, "mixed-sensitivity.toml", `contract_version = "gkos-frontmatter-profile/1.0.0-draft.1"
profile_id = "mixed-sensitivity"
minimum_sensitivity = "secret"
[fields.sensitivity]
enum = ["public", "secret"]
`);
  const mixedSensitivity = await loadIngestProfile(mixedSensitivityFile.path);
  assert.deepEqual(mixedSensitivity.normalized.fields.find((field) => field.field === "sensitivity").enum, ["public", "secret"]);

  const extensionTables = (count, required) => Array.from({ length: count }, (_, index) => `
[fields.x-boundary-${String(index).padStart(3, "0")}]
type = "string"${required ? "\nrequired = true" : ""}
`).join("");
  const allOptionalRequired = ["aliases", "authorship_origin", "tags", "updated_at"]
    .map((field) => `\n[fields.${field}]\nrequired = true\n`).join("");
  const maximum = await temporaryFile(t, "maximum-effective-fields.toml", `contract_version = "gkos-frontmatter-profile/1.0.0-draft.1"
profile_id = "maximum-effective"
${extensionTables(245, true)}${allOptionalRequired}`);
  const maximumProfile = await loadIngestProfile(maximum.path);
  assert.equal(maximumProfile.normalized.fields.length, 256);
  assert.equal(maximumProfile.normalized.required_fields.length, 255);
  assert.equal(schemaValidators().normalized(maximumProfile.normalized), true);
  assert.doesNotThrow(() => sealNormalizedIngestProfileEnvelope(maximumProfile.normalized));

  const excessive = await temporaryFile(t, "excessive-effective-fields.toml", `contract_version = "gkos-frontmatter-profile/1.0.0-draft.1"
profile_id = "excessive-effective"
${extensionTables(246, false)}`);
  await assert.rejects(loadIngestProfile(excessive.path), /GKX_INGEST_PROFILE_EFFECTIVE_FIELDS_LIMIT_EXCEEDED/);
});

test("pure validator retains exact physical candidate multiplicity and is permutation deterministic", async () => {
  const profile = await loadIngestProfile();
  const valid = source("same.md", note(IDS[0], "Valid"));
  const invalid = source("same.md", note("invalid-authored-uid", "Invalid"));
  const forward = buildIngestValidationPlan(input([valid, invalid]), profile);
  const reverse = buildIngestValidationPlan(input([invalid, valid]), profile);
  assert.deepEqual(reverse, forward);
  assert.deepEqual(forward.result.summary, {
    observed_source_count: 2,
    valid_source_count: 1,
    rejected_source_count: 1,
    findings: forward.result.summary.findings,
  });
  assert.equal(forward.accepted_sources.length, 1);
  assert.equal(forward.accepted_sources[0].candidate_source.source_id, IDS[0]);
  assert.equal(forward.result.rejections.length, 1);
  assert.equal(forward.result.rejections[0].source_path, "same.md");
  assert.ok(forward.result.rejections[0].findings.some((finding) => finding.code === "CANONICAL_SOURCE_UID_UNAVAILABLE"));
  assert.ok(forward.result.rejections[0].findings.some((finding) => finding.severity === "warning"), "sealed rejection retains safe nonblocking source findings");
  assert.equal(JSON.stringify(forward.result).includes("invalid-authored-uid"), false);
  assert.equal(JSON.stringify(forward.result).includes("record_key"), false);
  assert.doesNotThrow(() => assertIngestValidationPlan(forward));
  assert.throws(() => assertIngestValidationPlan(structuredClone(forward)), /GKX_INGEST_VALIDATION_PLAN_CAPABILITY_INVALID/);
  assert.equal(Object.isFrozen(forward), true);
  assert.equal(Object.isFrozen(forward.accepted_sources), true);
  assert.equal(Object.isFrozen(forward.accepted_sources[0]), true);
  assert.equal(Object.isFrozen(forward.accepted_sources[0].chunk_input), true);
  assert.throws(() => { forward.accepted_sources[0].chunk_input.text = "mutated"; }, TypeError);

  const exactInvalid = source("duplicate.md", note("invalid-authored-uid", "Invalid"));
  const duplicates = buildIngestValidationPlan(input([exactInvalid, { ...exactInvalid }]), profile);
  assert.equal(duplicates.result.summary.observed_source_count, 2);
  assert.equal(duplicates.result.summary.rejected_source_count, 2);
  assert.deepEqual(duplicates.result.rejections.map((item) => item.source_observation_ordinal), [0, 1]);
  assert.equal(new Set(duplicates.result.rejections.map((item) => item.rejection_digest)).size, 2);
  assert.deepEqual(sealIngestValidationResultEnvelope(duplicates.result), duplicates.result);
});

test("validation-only extension domains are finite and enforced at exact boundaries", async (t) => {
  const profileFile = await temporaryFile(t, "extension-domains.toml", `contract_version = "gkos-frontmatter-profile/1.0.0-draft.1"
profile_id = "extension-domains"

[fields.x-count]
type = "integer"

[fields.x-items]
type = "array<string>"
`);
  const profile = await loadIngestProfile(profileFile.path);
  const countRule = profile.normalized.fields.find((field) => field.field === "x-count");
  const itemRule = profile.normalized.fields.find((field) => field.field === "x-items");
  assert.deepEqual(
    { minimum: countRule.integer_minimum, maximum: countRule.integer_maximum },
    { minimum: -2147483648, maximum: 2147483647 },
  );
  assert.deepEqual(
    { items: itemRule.array_max_items, itemLength: itemRule.array_item_max_length },
    { items: 256, itemLength: 1024 },
  );

  const exact = buildIngestValidationPlan(input([source("exact.md", note(IDS[0], "Exact", {
    extra: `x-count: 2147483647\nx-items: ["${"a".repeat(1024)}"]\n`,
  }))]), profile);
  assert.equal(exact.result.ingest_intrinsic_valid, true);
  assert.equal(exact.accepted_sources.length, 1);
  const positiveZero = buildIngestValidationPlan(input([source("positive-zero.md", note(IDS[2], "Positive zero", {
    extra: 'x-count: 0\nx-items: ["a"]\n',
  }))]), profile);
  assert.equal(positiveZero.result.ingest_intrinsic_valid, true);
  assert.equal(positiveZero.accepted_sources.length, 1);

  const overCases = [
    ["integer", `x-count: 2147483648\nx-items: ["a"]\n`],
    ["negative-zero", `x-count: -0\nx-items: ["a"]\n`],
    ["array-count", `x-count: 0\nx-items: [${Array.from({ length: 257 }, () => '"a"').join(", ")}]\n`],
    ["array-item", `x-count: 0\nx-items: ["${"a".repeat(1025)}"]\n`],
  ];
  for (const [name, extra] of overCases) {
    const plan = buildIngestValidationPlan(input([source(`${name}.md`, note(IDS[1], name, { extra }))]), profile);
    assert.equal(plan.result.ingest_intrinsic_valid, false, name);
    assert.equal(plan.accepted_sources.length, 0, name);
    const typeFinding = plan.result.findings.find((finding) => finding.code === "GKX_PROFILE_TYPE_INVALID");
    assert.ok(typeFinding, name);
    if (name === "negative-zero") assert.deepEqual(
      { field: typeFinding.field, basis: typeFinding.coordinate_basis, line: typeFinding.line },
      { field: "x-count", basis: "frontmatter_field", line: 9 },
    );
  }

  const requiredFile = await temporaryFile(t, "required-extension.toml", `contract_version = "gkos-frontmatter-profile/1.0.0-draft.1"
profile_id = "required-extension"
[fields.x-owner]
type = "string"
required = true
`);
  const requiredProfile = await loadIngestProfile(requiredFile.path);
  for (const newline of ["\n", "\r\n"]) {
    const optionalContent = note(IDS[1], "Optional null", { extra: "x-count: null\n" }).replace(/\n/gu, newline);
    const optional = buildIngestValidationPlan(input([source("optional-null.md", optionalContent)]), profile).result;
    const optionalFinding = optional.findings.find((item) => item.code === "GKX_PROFILE_TYPE_INVALID" && item.field === "x-count");
    assert.deepEqual(
      { basis: optionalFinding?.coordinate_basis, line: optionalFinding?.line },
      { basis: "frontmatter_field", line: 9 },
      `optional extension null ${newline === "\n" ? "LF" : "CRLF"}`,
    );

    const requiredContent = note(IDS[2], "Required null", { extra: "x-owner: null\n" }).replace(/\n/gu, newline);
    const required = buildIngestValidationPlan(input([source("required-null.md", requiredContent)]), requiredProfile).result;
    const requiredFinding = required.findings.find((item) => item.code === "GKX_PROFILE_TYPE_INVALID" && item.field === "x-owner");
    assert.deepEqual(
      { basis: requiredFinding?.coordinate_basis, line: requiredFinding?.line },
      { basis: "frontmatter_field", line: 9 },
      `required extension null ${newline === "\n" ? "LF" : "CRLF"}`,
    );
    assert.equal(required.findings.some((item) => item.code === "GKX_PROFILE_FIELD_REQUIRED" && item.field === "x-owner"), false);

    for (const [shape, sensitivity, expectedLine] of [
      ["flat", "sensitivity: null", 8],
      ["nested", "sensitivity:\n  level: null", 9],
    ]) {
      const canonicalContent = note(IDS[0], `Canonical ${shape}`).replace('sensitivity: "public"', sensitivity).replace(/\n/gu, newline);
      const canonical = buildIngestValidationPlan(input([source(`canonical-${shape}-null.md`, canonicalContent)]), profile).result;
      const canonicalFinding = canonical.findings.find((item) => item.code === "GKX_PROFILE_TYPE_INVALID" && item.field === "sensitivity");
      assert.deepEqual(
        { basis: canonicalFinding?.coordinate_basis, line: canonicalFinding?.line },
        { basis: "frontmatter_field", line: expectedLine },
        `canonical ${shape} null ${newline === "\n" ? "LF" : "CRLF"}`,
      );
    }
  }
});

test("statless notes use authored time authority while missing or invalid authored time rejects intrinsically", async () => {
  const profile = await loadIngestProfile();
  const statless = (relativePath, content) => {
    const { createdTime: _createdTime, modifiedTime: _modifiedTime, ...value } = source(relativePath, content);
    return value;
  };
  const authored = buildIngestValidationPlan(input([
    statless("authored.md", note(IDS[0], "Authored statless")),
  ]), profile);
  assert.equal(authored.result.status, "valid");
  assert.equal(authored.accepted_sources.length, 1);
  assert.equal(authored.accepted_sources[0].candidate_source.validity_origin, "gkx_authored_timestamp");
  assert.equal(authored.accepted_sources[0].candidate_source.valid_from, "2026-08-01T00:00:00.000Z");
  assert.equal(JSON.stringify(authored).includes("1970-01-01"), false, "internal parse fallback is not public authority");

  const missingCreated = note(IDS[1], "Missing authored time").replace(`created_at: "${CREATED}"\n`, "");
  const invalidCreated = note(IDS[2], "Invalid authored time", { createdAt: "2026-08-01 00:00:00" });
  for (const [name, content] of [["missing", missingCreated], ["invalid", invalidCreated]]) {
    const plan = buildIngestValidationPlan(input([statless(`${name}.md`, content)]), profile);
    assert.equal(plan.result.summary.valid_source_count, 0, name);
    assert.equal(plan.result.summary.rejected_source_count, 1, name);
    assert.equal(plan.accepted_sources.length, 0, name);
    assert.ok(plan.result.rejections[0].findings.some((item) => item.severity === "error"), name);
    assert.equal(plan.result.rejections[0].canonical_valid_from, null, name);
  }

  const visible = source("visible.md", note(IDS[0], "Visible"));
  const absent = buildIngestValidationPlan(input([visible]), profile);
  const present = buildIngestValidationPlan(input([visible, statless("invalid.md", invalidCreated)]), profile);
  assert.deepEqual(present.accepted_sources, absent.accepted_sources);
  assert.deepEqual(present.accepted_declarations, absent.accepted_declarations);
});

test("scanner receipts preserve all safe reasons in one sealed rejection", async () => {
  const profile = await loadIngestProfile();
  const result = buildIngestValidationPlan(input([], [{
    source_path: "broken.md",
    source_digest: null,
    size: null,
    classification: "rejected",
    reason_codes: ["SOURCE_READ_FAILED", "SOURCE_UTF8_INVALID"],
  }]), profile);
  assert.equal(result.result.summary.observed_source_count, 1);
  assert.equal(result.result.summary.rejected_source_count, 1);
  assert.deepEqual(result.result.rejections[0].findings.map((item) => item.code), ["SOURCE_READ_FAILED", "SOURCE_UTF8_INVALID"]);
  assert.deepEqual(result.result.findings.map((item) => item.code), ["SOURCE_READ_FAILED", "SOURCE_UTF8_INVALID"]);
  assert.equal(result.result.rejections[0].canonical_assertion_time, null);
  assert.equal(result.result.rejections[0].canonical_valid_from, null);
  assert.throws(() => buildIngestValidationPlan(input([], [{
    source_path: "duplicate.md",
    source_digest: null,
    size: null,
    classification: "rejected",
    reason_codes: ["SOURCE_UTF8_INVALID", "SOURCE_UTF8_INVALID"],
  }]), profile), /GKX_INGEST_SCAN_REJECTION_REASONS_INVALID/);

  const sameBinding = {
    source_path: "same-scan.md",
    source_digest: `sha256:${"a".repeat(64)}`,
    size: 10,
    classification: "rejected",
  };
  const first = { ...sameBinding, reason_codes: ["SOURCE_READ_FAILED"] };
  const second = { ...sameBinding, reason_codes: ["SOURCE_UTF8_INVALID"] };
  const forward = buildIngestValidationPlan(input([], [first, second]), profile);
  const reverse = buildIngestValidationPlan(input([], [second, first]), profile);
  assert.deepEqual(reverse, forward, "scan reason sets—not caller indices—order same-path observations");
  assert.deepEqual(forward.result.observations.map((item) => item.source_observation_ordinal), [0, 1]);

  const exactDuplicate = buildIngestValidationPlan(input([], [first, { ...first }]), profile);
  assert.deepEqual(exactDuplicate.result.observations.map((item) => item.source_observation_ordinal), [0, 1]);
  assert.equal(new Set(exactDuplicate.result.rejections.map((item) => item.rejection_digest)).size, 2);

  const physical = source("mixed.md", note(IDS[0], "Mixed"));
  const scan = { ...first, source_path: "mixed.md", source_digest: null, size: null };
  const mixed = buildIngestValidationPlan(input([physical], [scan]), profile);
  assert.deepEqual(mixed.result.observations.map((item) => [item.classification, item.source_observation_ordinal]), [
    ["rejected", 0], ["accepted", 1],
  ]);
  assert.deepEqual(sealIngestValidationResultEnvelope(mixed.result), mixed.result);
});

test("line coordinates are parser-owned and missing fields remain honestly null", async () => {
  const profile = await loadIngestProfile();
  const malformed = `---\ngkx_version: "2.3"\nuid: "${IDS[0]}"\ntype: "policy"\ncreated_at: "${CREATED}"\nepistemic_state: "reported"\nsensitivity: "public"\ntags: [a,,b]\n---\nBody\n`;
  const result = buildIngestValidationPlan(input([source("lines.md", malformed)]), profile).result;
  const flow = result.findings.find((item) => item.code === "GKX_YAML_FLOW_INVALID");
  assert.deepEqual({ line: flow?.line, basis: flow?.coordinate_basis }, { line: 8, basis: "document_line" });
  const missing = result.findings.find((item) => item.code === "GKX_PROFILE_FIELD_REQUIRED" && item.field === "title");
  assert.deepEqual({ line: missing?.line, basis: missing?.coordinate_basis }, { line: null, basis: "missing_field" });
  assert.equal(result.rejections[0].canonical_assertion_time, CREATED.replace("Z", ".000Z"));
  assert.equal(result.rejections[0].canonical_valid_from, CREATED.replace("Z", ".000Z"));

  for (const [name, content] of [
    ["lf", note(IDS[1], "   ")],
    ["crlf", note(IDS[2], "   ").replace(/\n/gu, "\r\n")],
  ]) {
    const blank = buildIngestValidationPlan(input([source(`${name}.md`, content)]), profile).result;
    const length = blank.findings.find((item) => item.code === "GKX_PROFILE_LENGTH_INVALID" && item.field === "title");
    assert.deepEqual({ line: length?.line, basis: length?.coordinate_basis }, { line: 4, basis: "frontmatter_field" }, name);
    const laundered = resealFinding({ ...clone(length), coordinate_basis: "missing_field", line: null });
    assert.throws(() => sealIngestFindingEnvelope(laundered), /GKX_INGEST_FINDING_PROFILE_FIELD_SHAPE_INVALID/, name);
  }
});

test("unknown top-level dotted keys use literal RFC6901 receipts rather than semantic dotted paths", async (t) => {
  const profileFile = await temporaryFile(t, "unknown.toml", `contract_version = "gkos-frontmatter-profile/1.0.0-draft.1"
profile_id = "unknown-lines"
unknown_fields = "warn"
`);
  const profile = await loadIngestProfile(profileFile.path);
  const literal = buildIngestValidationPlan(input([
    source("literal.md", note(IDS[0], "Literal", { extra: 'tags: []\nfoo.bar: "literal"\n' })),
  ]), profile).result.findings.find((item) => item.code === "GKX_PROFILE_UNKNOWN_FIELD");
  const nested = buildIngestValidationPlan(input([
    source("nested.md", note(IDS[1], "Nested", { extra: 'foo:\n  bar: "nested"\n' })),
  ]), profile).result.findings.find((item) => item.code === "GKX_PROFILE_UNKNOWN_FIELD");
  assert.deepEqual({ line: literal?.line, basis: literal?.coordinate_basis }, { line: 10, basis: "frontmatter_field" });
  assert.deepEqual({ line: nested?.line, basis: nested?.coordinate_basis }, { line: 9, basis: "frontmatter_field" });
});

test("minimum sensitivity blocks explicit lower values but preserves missing fail-closed secret semantics", async (t) => {
  const item = await temporaryFile(t, "sensitivity.toml", OVERLAY.replace('required_fields = ["x-owner"]', "required_fields = []").replace(/\n\[fields\.x-owner\][\s\S]*$/u, "\n"));
  const profile = await loadIngestProfile(item.path);
  const explicit = buildIngestValidationPlan(input([source("public.md", note(IDS[0], "Public"))]), profile);
  assert.equal(explicit.result.ingest_intrinsic_valid, false);
  assert.equal(explicit.result.rejections.length, 1);
  assert.ok(explicit.result.rejections[0].findings.some((finding) => finding.code === "GKX_PROFILE_SENSITIVITY_BELOW_MINIMUM"));

  const missing = buildIngestValidationPlan(input([source("missing.md", note(IDS[1], "Missing", { omitSensitivity: true }))]), profile);
  assert.equal(missing.result.ingest_intrinsic_valid, true);
  assert.equal(missing.result.rejections.length, 0);
  assert.equal(missing.accepted_sources[0].candidate_source.source_metadata.sensitivity, "secret");
  assert.equal(profile.normalized.fields.find((field) => field.field === "sensitivity").required, false);
  assert.ok(missing.result.findings.some((finding) => finding.code === "GKX-SENSITIVITY-001" && finding.severity === "warning"));
});

test("logical profile fields preserve canonical nested precedence, eligibility, and exact authored lines", async (t) => {
  const builtIn = await loadIngestProfile();
  const nested = note(IDS[0], "Nested", { sensitivity: "public" })
    .replace('epistemic_state: "reported"\nsensitivity: "public"', 'epistemic:\n  state: "reported"\nsensitivity:\n  level: "public"\nauthorship:\n  origin: "authored"');
  const accepted = buildIngestValidationPlan(input([source("nested.md", nested)]), builtIn);
  assert.equal(accepted.result.ingest_intrinsic_valid, true);
  assert.equal(accepted.result.rejections.length, 0);
  assert.equal(accepted.accepted_sources.length, 1);
  assert.equal(accepted.accepted_sources[0].candidate_source.source_metadata.sensitivity, "public");

  const rulesFile = await temporaryFile(t, "logical-fields.toml", `contract_version = "gkos-frontmatter-profile/1.0.0-draft.1"
profile_id = "logical-fields"
minimum_sensitivity = "internal"

[fields.epistemic_state]
enum = ["supported"]

[fields.authorship_origin]
enum = ["approved"]
`);
  const rules = await loadIngestProfile(rulesFile.path);
  const nestedResult = buildIngestValidationPlan(input([source("nested.md", nested)]), rules).result;
  const nestedFindings = new Map(nestedResult.findings.filter((item) => item.code.startsWith("GKX_PROFILE_")).map((item) => [item.field, item]));
  assert.deepEqual(
    ["epistemic_state", "authorship_origin", "sensitivity.level"].map((field) => ({ field, line: nestedFindings.get(field)?.line, basis: nestedFindings.get(field)?.coordinate_basis })),
    [
      { field: "epistemic_state", line: 8, basis: "frontmatter_field" },
      { field: "authorship_origin", line: 12, basis: "frontmatter_field" },
      { field: "sensitivity.level", line: 10, basis: "frontmatter_field" },
    ],
  );

  const flat = note(IDS[1], "Flat", { sensitivity: "public", extra: 'authorship_origin: "authored"\n' });
  const flatResult = buildIngestValidationPlan(input([source("flat.md", flat)]), rules).result;
  const flatFindings = new Map(flatResult.findings.filter((item) => item.code.startsWith("GKX_PROFILE_")).map((item) => [item.field, item]));
  assert.deepEqual(
    ["epistemic_state", "authorship_origin", "sensitivity.level"].map((field) => ({ field, line: flatFindings.get(field)?.line, basis: flatFindings.get(field)?.coordinate_basis })),
    [
      { field: "epistemic_state", line: 7, basis: "frontmatter_field" },
      { field: "authorship_origin", line: 9, basis: "frontmatter_field" },
      { field: "sensitivity.level", line: 8, basis: "frontmatter_field" },
    ],
  );
});

test("Decision-A cross-record classes are validate errors but never physical ingest rejections", async () => {
  const profile = await loadIngestProfile();
  const declarationConflict = [
    source("declared-old.md", note(IDS[0], "Declared Old", {
      extra: `superseded_by:\n  - "${IDS[2]}"\n`,
    })),
    source("declared-new.md", note(IDS[1], "Declared New", {
      extra: `supersedes:\n  - "${IDS[0]}"\n`,
    })),
    source("declared-other.md", note(IDS[2], "Declared Other")),
  ];
  const casesByClass = new Map([
    ["canonical_identity_collision", [
      source("identity-a.md", note(IDS[0], "Identity A")),
      source("identity-b.md", note(IDS[0], "Identity B")),
    ]],
    ["endpoint_resolution_ambiguity_or_unresolved", [
      source("one/Target.md", note(IDS[0], "Target")),
      source("two/Target.md", note(IDS[1], "Target")),
      source("new.md", note(IDS[2], "New", { extra: 'supersedes:\n  - "Target"\n' })),
    ]],
    ["forward_inverse_or_conflicting_declarations", declarationConflict],
    ["branch_cycle_or_temporal_order", [
      source("old.md", note(IDS[0], "Old")),
      source("new-a.md", note(IDS[1], "New A", { extra: `supersedes:\n  - "${IDS[0]}"\n` })),
      source("new-b.md", note(IDS[2], "New B", { extra: `supersedes:\n  - "${IDS[0]}"\n` })),
    ]],
  ]);
  for (const matrix of CONFORMANCE.decision_a_matrix) {
    assert.deepEqual(
      { finding: matrix.finding, classification: matrix.classification, ingest_rejection: matrix.ingest_rejection },
      { finding: "RETRIEVAL_AUTHORIZED_VIEW_CONFLICT", classification: "cross_record_report_only", ingest_rejection: false },
      matrix.class,
    );
    const files = casesByClass.get(matrix.class);
    assert.ok(files, matrix.class);
    const plan = buildIngestValidationPlan(input(files), profile);
    assert.equal(plan.result.status, "invalid");
    assert.equal(plan.result.corpus_valid, false);
    assert.equal(plan.result.ingest_intrinsic_valid, true);
    assert.equal(plan.result.rejections.length, 0);
    assert.equal(plan.accepted_sources.length, files.length);
    assert.deepEqual(plan.result.findings.filter((item) => item.classification === "cross_record_report_only").map((item) => item.code), ["RETRIEVAL_AUTHORIZED_VIEW_CONFLICT"]);
  }

  for (const files of [
    [
      source("same-path.md", note(IDS[0], "Path A")),
      source("same-path.md", note(IDS[1], "Path B")),
    ],
    [source("self.md", note(IDS[0], "Self", { extra: `supersedes:\n  - "${IDS[0]}"\n` }))],
  ]) {
    const plan = buildIngestValidationPlan(input(files), profile);
    assert.equal(plan.result.corpus_valid, false);
    assert.equal(plan.result.ingest_intrinsic_valid, true);
    assert.equal(plan.result.rejections.length, 0);
    assert.equal(plan.accepted_sources.length, files.length);
  }

  const reconciled = buildIngestValidationPlan(input(declarationConflict), profile);
  assert.equal(reconciled.accepted_declarations.filter((item) => item.category === "lineage").length, 2);
  assert.equal(reconciled.result.rejections.length, 0);
  assert.equal(JSON.stringify(reconciled.result).includes(IDS[0]), false, "raw declaration references stay outside the safe result");
  assert.equal(JSON.stringify(reconciled.result).includes(IDS[2]), false, "conflicting declaration endpoints stay non-oracular");

  const ordinary = buildIngestValidationPlan(input([
    source("ordinary.md", note(IDS[0], "Ordinary", { body: "Ordinary [[Missing]] link." })),
  ]), profile);
  assert.equal(ordinary.result.corpus_valid, true);
  assert.equal(ordinary.result.findings.some((item) => item.classification === "cross_record_report_only"), false);
});

test("authored declaration shape receipts preserve finite indexed fields and exact lines", async () => {
  const profile = await loadIngestProfile();
  const cases = [
    ["numeric", "relationships:\n  supports:\n    - 123\n", "relationships.supports[0]", 11],
    ["null", "relationships:\n  supports:\n    - null\n", "relationships.supports[0]", 11],
    ["blank", "relationships:\n  supports:\n    - \"\"\n", "relationships.supports[0]", 11],
    ["invalid-origin", "relationships:\n  supports:\n    - target: \"Target\"\n      origin: \"invented\"\n", "relationships.supports[0]", 11],
    ["conflicting-targets", "relationships:\n  supports:\n    - target: \"Target\"\n      uid: \"Other\"\n", "relationships.supports[0]", 11],
    ["extra-key", "relationships:\n  supports:\n    - target: \"Target\"\n      invented: true\n", "relationships.supports[0]", 11],
    ["lineage-array", `lineage:\n  predecessor_uid:\n    - \"${IDS[1]}\"\n`, "supersedes[0]", 11],
    ["unknown-relationship", "relationships:\n  attacker_controlled:\n    - \"Target\"\n", "relationships[0]", 11],
    ["invalid-container", "relationships: \"not-a-mapping\"\n", "relationships", 9],
  ];
  for (const [name, extra, field, line] of cases) {
    for (const newline of ["\n", "\r\n"]) {
      const content = note(IDS[0], name, { extra }).replace(/\n/gu, newline);
      const result = buildIngestValidationPlan(input([source(`${name}.md`, content)]), profile).result;
      const finding = result.findings.find((item) => item.code === "AUTHORED_RELATIONSHIP_REFERENCE_INVALID");
      assert.deepEqual(
        { field: finding?.field, line: finding?.line, basis: finding?.coordinate_basis },
        { field, line, basis: "frontmatter_field" },
        `${name} ${newline === "\n" ? "LF" : "CRLF"}`,
      );
      assert.equal(result.ingest_intrinsic_valid, false, name);
    }
  }

  const multiple = buildIngestValidationPlan(input([source("multiple.md", note(IDS[0], "Multiple", {
    extra: "relationships:\n  supports:\n    - 123\n    - \"\"\n",
  }))]), profile).result.findings.filter((item) => item.code === "AUTHORED_RELATIONSHIP_REFERENCE_INVALID");
  assert.deepEqual(multiple.map((item) => [item.field, item.line]), [
    ["relationships.supports[0]", 11],
    ["relationships.supports[1]", 12],
  ]);
  assert.equal(new Set(multiple.map((item) => item.finding_id)).size, 2);

  const proposedContent = note(IDS[0], "Proposed", {
    extra: `relationships:\n  supports:\n    - target: \"${IDS[1]}\"\n      origin: \"proposed\"\n`,
  });
  const proposed = buildIngestValidationPlan(input([source("proposed.md", proposedContent)]), profile);
  assert.equal(proposed.result.ingest_intrinsic_valid, true);
  assert.equal(proposed.result.findings.some((item) => item.code === "AUTHORED_RELATIONSHIP_REFERENCE_INVALID"), false);
  assert.equal(proposed.accepted_declarations.some((item) => item.field === "relationships.supports"), false);
  const publicProjection = gkx.buildGkx23Projection(proposedContent, "proposed.md", "proposed-hash", null);
  assert.equal(publicProjection.proposed.relationships.supports[0].target, IDS[1]);
});

test("ordinary malformed link receipts are line-exact and high-count parsing remains linear", { timeout: 10_000 }, async () => {
  const profile = await loadIngestProfile();
  const long = "x".repeat(513);
  const content = note(IDS[0], "Links", { body: `Valid [[Missing]] link.\nMalformed [[${long}]].\nMalformed [label](${long}).` });
  const result = buildIngestValidationPlan(input([source("links.md", content)]), profile).result;
  const findings = result.findings.filter((item) => item.code === "AUTHORED_LINK_REFERENCE_INVALID");
  assert.deepEqual(findings.map((item) => [item.field, item.line, item.coordinate_basis]), [
    [null, 12, "document_line"],
    [null, 13, "document_line"],
  ]);
  assert.equal(result.ingest_intrinsic_valid, false);

  const many = Array.from({ length: 50_000 }, (_, index) => `[[Target-${index}]]`).join("\n");
  const parsed = core.parseMarkdownFile(many);
  assert.equal(parsed.links.length, 50_000);
  assert.deepEqual(parsed.links[0], { kind: "wikilink", target: "Target-0", raw: "[[Target-0]]", alias: undefined, heading: undefined });
  assert.equal(parsed.links.at(-1).target, "Target-49999");
});

test("validation envelopes fail descriptor-first without getter or proxy observation", async () => {
  const profile = await loadIngestProfile();
  let reads = 0;
  const accessor = { ...source("accessor.md", note(IDS[0])) };
  Object.defineProperty(accessor, "content", { enumerable: true, get() { reads++; return note(IDS[0]); } });
  assert.throws(() => buildIngestValidationPlan(input([accessor]), profile), /GKX_INGEST_SOURCE_ENVELOPE_INVALID/);
  assert.equal(reads, 0);

  const proxy = new Proxy(input([]), { get(target, key, receiver) { reads++; return Reflect.get(target, key, receiver); } });
  assert.throws(() => buildIngestValidationPlan(proxy, profile), /GKX_INGEST_VALIDATION_INPUT_INVALID/);
  assert.equal(reads, 0);

  const outer = {};
  Object.defineProperty(outer, "files", { enumerable: true, get() { reads++; return []; } });
  assert.throws(() => buildIngestValidationPlan(outer, profile), /GKX_INGEST_VALIDATION_INPUT_INVALID/);
  assert.equal(reads, 0);

  assert.throws(() => buildIngestValidationPlan(outer, structuredClone(profile)), /GKX_INGEST_PROFILE_CAPABILITY_INVALID/);
  assert.equal(reads, 0, "profile capability is checked before source-envelope access");
  const malformedBytes = { ...source("bytes.md", "😀"), size: 2 };
  assert.throws(() => buildIngestValidationPlan(input([malformedBytes]), profile), /GKX_INGEST_SOURCE_BYTES_INVALID/);

  for (const [name, value, error] of [
    ["size", { ...source("negative-zero-size.md", note(IDS[0])), size: -0 }, /GKX_INGEST_SOURCE_BYTES_INVALID/],
    ["created", { ...source("negative-zero-created.md", note(IDS[0])), createdTime: -0 }, /GKX_INGEST_SOURCE_TIME_INVALID/],
    ["modified", { ...source("negative-zero-modified.md", note(IDS[0])), modifiedTime: -0 }, /GKX_INGEST_SOURCE_TIME_INVALID/],
  ]) {
    assert.throws(() => buildIngestValidationPlan(input([value]), profile), error, name);
  }
  const negativeZeroScan = {
    source_path: "negative-zero-scan.md", source_digest: null, size: -0,
    classification: "rejected", reason_codes: ["SOURCE_READ_FAILED"],
  };
  assert.throws(() => buildIngestValidationPlan(input([], [negativeZeroScan]), profile), /GKX_INGEST_SCAN_REJECTION_INVALID/);

  const malformedPath = `bad-\ud800.md`;
  assert.throws(
    () => buildIngestValidationPlan(input([source(malformedPath, note(IDS[0]))]), profile),
    /GKX_INGEST_SOURCE_PATH_INVALID/,
  );
  assert.throws(
    () => buildIngestValidationPlan({ files: [], folders: [malformedPath], attachments: [], scan_rejections: [] }, profile),
    /GKX_INGEST_FOLDERS_INVALID/,
  );
  assert.throws(
    () => buildIngestValidationPlan({ files: [], folders: [], attachments: [malformedPath], scan_rejections: [] }, profile),
    /GKX_INGEST_ATTACHMENTS_INVALID/,
  );
  assert.throws(
    () => buildIngestValidationPlan(input([], [{
      source_path: malformedPath, source_digest: null, size: null,
      classification: "rejected", reason_codes: ["SOURCE_READ_FAILED"],
    }]), profile),
    /GKX_INGEST_SCAN_REJECTION_INVALID/,
  );
});

test("frozen Draft 2020-12 schemas resolve project-owned refs and validate the exact executable fixture", async () => {
  assert.equal(CONTRACT.status, "frozen");
  assert.equal(CONTRACT.frozen, true);
  assert.equal(CONTRACT.hash_manifest_issued, true);
  assert.equal(CONFORMANCE.status, "frozen");
  assert.equal(CONFORMANCE.frozen, true);
  const validators = schemaValidators();
  for (const [name, schema] of Object.entries(SCHEMAS)) {
    assert.match(schema.$id, /^https:\/\/github\.com\/Odenknight\/GKOS-Engine\/contracts\/ingest\//, name);
    assert.ok(validators.ajv.getSchema(schema.$id), name);
    const bytes = readFileSync(new URL(name, CONTRACT_DIRECTORY));
    assert.equal(bytes.at(-1), 0x0a, `${name} has one terminal LF`);
    assert.notEqual(bytes.at(-2), 0x0a, `${name} has exactly one terminal LF`);
  }
  assert.equal(validators.result(CONFORMANCE.executable.expected_result), true, JSON.stringify(validators.result.errors));
  assert.equal(validators.normalized(CONFORMANCE.executable.expected_result.normalized_profile), true, JSON.stringify(validators.normalized.errors));
  assert.equal(validators.coordinate(CONFORMANCE.executable.expected_result.profile), true, JSON.stringify(validators.coordinate.errors));
  for (const item of CONFORMANCE.executable.expected_result.findings) assert.equal(validators.finding(item), true, JSON.stringify(validators.finding.errors));
  for (const item of CONFORMANCE.executable.expected_result.rejections) assert.equal(validators.rejection(item), true, JSON.stringify(validators.rejection.errors));

  const profile = await loadIngestProfile();
  const plan = buildIngestValidationPlan(CONFORMANCE.executable.input, profile);
  assert.deepEqual(plan.result, CONFORMANCE.executable.expected_result);
  assert.equal(plan.observation_snapshot_digest, CONFORMANCE.executable.expected_observation_snapshot_digest);
  assert.deepEqual(plan.accepted_sources.map((item) => item.candidate_source.source_id), CONFORMANCE.executable.expected_accepted_source_ids);
  assert.deepEqual(plan.result.rejections.map(({ source_path, source_observation_ordinal }) => ({ source_path, source_observation_ordinal })), CONFORMANCE.executable.expected_rejection_ordinals);
  assert.deepEqual(sealIngestValidationResultEnvelope(CONFORMANCE.executable.expected_result), CONFORMANCE.executable.expected_result);

  assert.equal(CONTRACT.profile.built_in_effective_profile_digest, profile.coordinate.effective_profile_digest);
  assert.equal(
    CONTRACT.profile.built_in_effective_profile_digest,
    SCHEMAS["profile-coordinate.schema.json"].allOf[0].then.properties.effective_profile_digest.const,
  );
  assert.equal(
    CONTRACT.profile.built_in_effective_profile_digest,
    CONFORMANCE.executable.expected_result.profile.effective_profile_digest,
  );
  assert.deepEqual(Object.keys(CONTRACT.safe_findings.finding_severity_floors).sort(), [...INGEST_FINDING_CODES].sort());
  assert.deepEqual(CONTRACT.safe_findings.finding_severity_floors, INGEST_FINDING_SEVERITY_FLOORS);
  assert.match(CONTRACT.cli.validate, /\[--schema <path-or-id>\]/u);
  assert.match(CONTRACT.cli.index, /\[--schema <path-or-id>\]/u);
  assert.equal(CONTRACT.cli.schema_built_in_id, INGEST_CURRENT_PROFILE_SELECTOR);
  assert.equal(CONTRACT.profile.built_in_selector, INGEST_CURRENT_PROFILE_SELECTOR);
  assert.equal(CONTRACT.profile.extension_field_id_grammar, "x-[a-z0-9][a-z0-9_-]{0,62}");

  const applyNormalizedMutations = (sourceProfile, mutations) => {
    const mutated = clone(sourceProfile);
    for (const mutation of mutations) {
      if (mutation.target === "profile") mutated[mutation.member] = clone(mutation.value);
      else if (mutation.target === "field") {
        const field = mutated.fields.find((item) => item.field === mutation.field);
        assert.ok(field, mutation.field);
        field[mutation.member] = clone(mutation.value);
      } else if (mutation.target === "severity") {
        const severity = mutated.severity.find((item) => item.code === mutation.code);
        assert.ok(severity, mutation.code);
        severity[mutation.member] = clone(mutation.value);
      } else if (mutation.target === "required_fields" && mutation.operation === "insert") {
        mutated.required_fields.push(mutation.value);
        mutated.required_fields.sort();
      } else assert.fail(`unsupported conformance mutation ${JSON.stringify(mutation)}`);
    }
    return mutated;
  };
  for (const item of CONFORMANCE.normalized_profile_sensitivity_cases) {
    const mutated = applyNormalizedMutations(profile.normalized, item.mutations);
    assert.equal(validators.normalized(mutated), item.schema_outcome === "accept", `${item.case} schema`);
    if (item.semantic_outcome === "accept") assert.deepEqual(sealNormalizedIngestProfileEnvelope(mutated), mutated, item.case);
    else assert.throws(
      () => sealNormalizedIngestProfileEnvelope(mutated),
      new RegExp(item.semantic_code),
      item.case,
    );
  }

  const missing = buildIngestValidationPlan(CONFORMANCE.missing_sensitivity_case.input, profile);
  const missingExpected = CONFORMANCE.missing_sensitivity_case.expected;
  assert.deepEqual({
    status: missing.result.status,
    corpus_valid: missing.result.corpus_valid,
    ingest_intrinsic_valid: missing.result.ingest_intrinsic_valid,
    valid_source_count: missing.result.summary.valid_source_count,
    rejected_source_count: missing.result.summary.rejected_source_count,
  }, {
    status: missingExpected.status,
    corpus_valid: missingExpected.corpus_valid,
    ingest_intrinsic_valid: missingExpected.ingest_intrinsic_valid,
    valid_source_count: missingExpected.valid_source_count,
    rejected_source_count: missingExpected.rejected_source_count,
  });
  const missingFinding = missing.result.findings.find((item) => item.code === "GKX-SENSITIVITY-001");
  assert.deepEqual(
    Object.fromEntries(Object.keys(missingExpected.finding).map((key) => [key, missingFinding[key]])),
    missingExpected.finding,
  );
  assert.equal(missing.accepted_sources[0].chunk_input.metadata.sensitivity, missingExpected.accepted_effective_sensitivity);

  assert.deepEqual([...CONFORMANCE.unicode_ordering.input].sort(), CONFORMANCE.unicode_ordering.expected_ecmascript_utf16);
  assert.deepEqual(
    [...CONFORMANCE.unicode_ordering.input].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right))),
    CONFORMANCE.unicode_ordering.expected_utf8_bytes,
  );
  assert.notDeepEqual(
    CONFORMANCE.unicode_ordering.expected_ecmascript_utf16,
    CONFORMANCE.unicode_ordering.expected_utf8_bytes,
  );

  const reconciliationFixture = CONFORMANCE.decision_a_declaration_reconciliation_case;
  const reconciliation = buildIngestValidationPlan(reconciliationFixture.input, profile);
  assert.deepEqual({
    status: reconciliation.result.status,
    corpus_valid: reconciliation.result.corpus_valid,
    ingest_intrinsic_valid: reconciliation.result.ingest_intrinsic_valid,
    accepted_source_count: reconciliation.accepted_sources.length,
    accepted_lineage_declaration_count: reconciliation.accepted_declarations.filter((item) => item.category === "lineage").length,
    rejected_source_count: reconciliation.result.rejections.length,
  }, Object.fromEntries(Object.entries(reconciliationFixture.expected).filter(([key]) => !["finding", "raw_reference_in_result"].includes(key))));
  const reconciliationFinding = reconciliation.result.findings.find((item) => item.code === "RETRIEVAL_AUTHORIZED_VIEW_CONFLICT");
  assert.deepEqual(
    Object.fromEntries(Object.keys(reconciliationFixture.expected.finding).map((key) => [key, reconciliationFinding[key]])),
    reconciliationFixture.expected.finding,
  );
  assert.equal(
    reconciliationFixture.input.files.some((file) => JSON.stringify(reconciliation.result).includes(JSON.parse(file.content.split("\n")[2].slice(5)))),
    reconciliationFixture.expected.raw_reference_in_result,
  );

  const predicateInputs = {
    intrinsic_error_or_critical: { classification: "intrinsic", severity: "error" },
    intrinsic_warning_or_info_only: { classification: "intrinsic", severity: "warning" },
    cross_record_error_or_critical: { classification: "cross_record_report_only", severity: "error" },
    cross_record_warning_or_info_only: { classification: "cross_record_report_only", severity: "warning" },
  };
  for (const [name, expected] of Object.entries(CONFORMANCE.predicate_matrix)) {
    const fixture = predicateInputs[name];
    assert.ok(fixture, name);
    const blocking = fixture.severity === "error" || fixture.severity === "critical";
    assert.deepEqual({
      validate_invalid: blocking,
      ingest_rejected: blocking && fixture.classification === "intrinsic",
    }, expected, name);
  }
  assert.deepEqual(
    CONFORMANCE.decision_a_matrix.map((item) => item.class),
    CONTRACT.decision_a.cross_record_classes,
  );

  for (const item of CONFORMANCE.semantic_negative_matrix) {
    assert.equal(item.semantic_outcome, "reject", item.class);
    if (item.class === "normalized_profile_widening_or_duplicate_coordinate") {
      const forged = clone(profile.normalized);
      const extension = {
        field: "x-fixture", type: "string", required: false, min_length: null, max_length: 32,
        integer_minimum: null, integer_maximum: null, array_max_items: null, array_item_max_length: null,
        enum: null, extension: true,
      };
      forged.fields.push(extension, { ...extension, max_length: 16 });
      forged.fields.sort((left, right) => left.field < right.field ? -1 : left.field > right.field ? 1 : 0);
      assert.equal(validators.normalized(forged), item.schema_may_be_insufficient, item.class);
      assert.throws(() => sealNormalizedIngestProfileEnvelope(forged), /GKX_INGEST_NORMALIZED_PROFILE_/u, item.class);
    } else if (item.class === "nonportable_source_path") {
      const forged = resealFinding({ ...clone(plan.result.findings[0]), source_path: "/absolute.md" });
      assert.equal(validators.finding(forged), false, item.class);
      assert.throws(() => sealIngestFindingEnvelope(forged), /GKX_INGEST_FINDING_PATH_INVALID/u, item.class);
    } else if (item.class === "forged_finding_classification_scope_coordinate_or_digest") {
      const forged = resealFinding({ ...clone(plan.result.findings[0]), classification: "cross_record_report_only" });
      assert.equal(validators.finding(forged), false, item.class);
      assert.throws(() => sealIngestFindingEnvelope(forged), /GKX_INGEST_FINDING_CLASSIFICATION_INVALID/u, item.class);
    } else if (item.class === "rejection_temporal_content_finding_order_or_digest_mismatch") {
      const forged = clone(plan.result.rejections[0]);
      forged.rejection_digest = `sha256:${"0".repeat(64)}`;
      assert.equal(validators.rejection(forged), true, item.class);
      assert.throws(() => sealIngestRejectionEnvelope(forged, profile.normalized), /GKX_INGEST_REJECTION_DIGEST_INVALID/u, item.class);
    } else if (item.class === "result_profile_predicate_count_partition_or_nested_subset_mismatch") {
      const forged = clone(plan.result);
      forged.summary.observed_source_count++;
      assert.equal(validators.result(forged), true, item.class);
      assert.throws(
        () => sealIngestValidationResultEnvelope(forged),
        /GKX_INGEST_RESULT_(?:SUMMARY|DERIVATION)_INVALID/u,
        item.class,
      );
    } else assert.fail(`unbound semantic-negative fixture class ${item.class}`);
  }

  assert.deepEqual(CONTRACT.profile.strict_toml_rejects, [
    "duplicate keys or tables",
    "dotted or quoted keys and quoted, dotted-extension, nested, or array tables",
    "floats, NaN, infinity, datetimes, exponent notation, signed integers, leading-zero integers, and hexadecimal, octal, or binary integers",
    "single-quoted, literal, or multiline strings and unsupported escapes including escaped slash",
    "inline tables, heterogeneous or non-string arrays, nested arrays, sparse/empty array items, and trailing array commas",
    "NUL, tab, bare carriage return, DEL, or other disallowed controls anywhere, including comments",
    "outside quoted strings and comments, syntax whitespace other than ASCII U+0020; this includes NBSP and FEFF",
    "trailing assignment or table junk and unsupported bare value forms",
    "include, import, reference, schema-ref, interpolation, or directive keys/forms",
    "unknown root, severity, or field-rule assignments",
  ]);
  assert.equal(CONTRACT.profile.raw_required_field_item_max_utf16_code_units, 128);
  assert.equal(CONTRACT.profile.raw_enum_item_max_utf16_code_units, 512);
  assert.deepEqual(CONTRACT.profile.basic_string_escape_set_after_backslash, [
    "b", "t", "n", "f", "r", "double_quote", "backslash", "u followed by exactly four ASCII hexadecimal digits",
  ]);
});

test("maximum physical frontmatter lines retain every parser finding within the proven rejection bound", async () => {
  const profile = await loadIngestProfile();
  const content = `---\n${"duplicate: 1e9\n".repeat(4096)}---\nBody\n`;
  const result = buildIngestValidationPlan(input([source("maximum-lines.md", content)]), profile).result;
  assert.equal(result.rejections.length, 1);
  assert.ok(result.rejections[0].findings.length > 8192, "regression exceeds the old unproven bound");
  assert.ok(result.rejections[0].findings.length <= 530000);
  assert.equal(result.rejections[0].findings.filter((item) => item.code === "GKX_YAML_DUPLICATE_KEY").length, 4095);
  assert.equal(result.rejections[0].findings.filter((item) => item.code === "GKX_YAML_NUMBER_UNSUPPORTED").length, 4096);
  const validators = schemaValidators();
  assert.equal(validators.rejection(result.rejections[0]), true, JSON.stringify(validators.rejection.errors));
  assert.equal(validators.result(result), true, JSON.stringify(validators.result.errors));
  assert.deepEqual(sealIngestValidationResultEnvelope(result), result);
});

test("normalized profile schema and semantic seal reject every widening or forged algebra output", async () => {
  const validators = schemaValidators();
  const baseline = clone(CONFORMANCE.executable.expected_result.normalized_profile);
  assert.deepEqual(sealNormalizedIngestProfileEnvelope(baseline), baseline);

  const schemaRejected = [
    ["empty required", (item) => { item.required_fields = []; }],
    ["arbitrary canonical-looking field", (item) => { item.fields.push({ ...item.fields[0], field: "provenance" }); }],
    ["duplicate canonical field", (item) => { item.fields.push({ ...item.fields[0], required: true }); }],
    ["canonical type widening", (item) => { item.fields.find((field) => field.field === "uid").type = "integer"; }],
    ["canonical enum widening", (item) => { item.fields.find((field) => field.field === "gkx_version").enum = ["2.3", "9.9"]; }],
    ["severity omission", (item) => { item.severity.pop(); }],
    ["severity lowering", (item) => { item.severity.find((rule) => rule.code === "GKX-SCHEMA-004").severity = "warning"; }],
    ["arbitrary severity code", (item) => { item.severity[0].code = "GKX-INVENTED-999"; }],
    ["nonstring length", (item) => { item.fields.find((field) => field.field === "tags").min_length = 1; }],
    ["extension flag mismatch", (item) => { item.fields.find((field) => field.field === "uid").extension = true; }],
    ["identity authority", (item) => { item.identity_rules.path_is_identity = true; }],
    ["relationship authority", (item) => { item.relationship_rules.second_resolution_pass = true; }],
    ["required zero-length domain", (item) => {
      const field = item.fields.find((rule) => rule.field === "updated_at");
      field.required = true;
      field.max_length = 0;
      item.required_fields.push("updated_at");
      item.required_fields.sort();
    }],
    ["required sensitivity", (item) => {
      const field = item.fields.find((rule) => rule.field === "sensitivity");
      field.required = true;
      item.required_fields.push("sensitivity");
      item.required_fields.sort();
    }],
    ["fixed sensitivity warning escalation", (item) => {
      item.severity.find((rule) => rule.code === "GKX-SENSITIVITY-001").severity = "error";
    }],
  ];
  for (const [name, mutate] of schemaRejected) {
    const forged = clone(baseline);
    mutate(forged);
    assert.equal(validators.normalized(forged), false, name);
    assert.throws(() => sealNormalizedIngestProfileEnvelope(forged), /GKX_INGEST_NORMALIZED_PROFILE_/, name);
  }

  const extension = {
    field: "x-owner", type: "string", required: true, min_length: null, max_length: 32,
    integer_minimum: null, integer_maximum: null, array_max_items: null, array_item_max_length: null,
    enum: null, extension: true,
  };
  const schemaValidSemanticForges = [
    ["duplicate extension coordinate", (item) => {
      item.fields.push(extension, { ...extension, max_length: 16 });
      item.required_fields.push("x-owner");
      item.fields.sort((a, b) => a.field < b.field ? -1 : a.field > b.field ? 1 : 0);
      item.required_fields.sort();
    }],
    ["required-fields mismatch", (item) => {
      item.fields.push(extension);
      item.fields.sort((a, b) => a.field < b.field ? -1 : a.field > b.field ? 1 : 0);
    }],
    ["noncanonical field order", (item) => { [item.fields[0], item.fields[1]] = [item.fields[1], item.fields[0]]; }],
    ["noncanonical severity order", (item) => { [item.severity[0], item.severity[1]] = [item.severity[1], item.severity[0]]; }],
    ["negative-zero bound", (item) => { item.fields.find((field) => field.field === "updated_at").min_length = -0; }],
    ["optional sensitivity below floor", (item) => {
      const field = item.fields.find((rule) => rule.field === "sensitivity");
      field.enum = ["public"];
      item.minimum_sensitivity = "secret";
    }],
  ];
  for (const [name, mutate] of schemaValidSemanticForges) {
    const forged = clone(baseline);
    mutate(forged);
    assert.equal(validators.normalized(forged), true, `${name} remains a residual Draft 2020-12 invariant`);
    assert.throws(() => sealNormalizedIngestProfileEnvelope(forged), /GKX_INGEST_NORMALIZED_PROFILE_/, name);
  }

  const finiteDomainForges = [
    ["unbounded extension string", {
      ...extension, required: false, max_length: null,
    }],
    ["widened extension integer", {
      ...extension, field: "x-count", type: "integer", required: false, min_length: null, max_length: null,
      integer_minimum: -2147483648, integer_maximum: 2147483648,
    }],
    ["widened extension array", {
      ...extension, field: "x-items", type: "array<string>", required: false, min_length: null, max_length: null,
      array_max_items: 257, array_item_max_length: 1024,
    }],
  ];
  for (const [name, field] of finiteDomainForges) {
    const forged = clone(baseline);
    forged.fields.push(field);
    forged.fields.sort((left, right) => left.field < right.field ? -1 : left.field > right.field ? 1 : 0);
    assert.equal(validators.normalized(forged), false, name);
    assert.throws(() => sealNormalizedIngestProfileEnvelope(forged), /GKX_INGEST_NORMALIZED_PROFILE_/, name);
  }
});

test("portable path, finding, rejection, and result semantic seals reject schema-valid forgeries", () => {
  const validators = schemaValidators();
  const expected = CONFORMANCE.executable.expected_result;
  const normalized = expected.normalized_profile;
  const baseFinding = expected.findings.find((item) => item.code === "SOURCE_READ_FAILED");
  const baseRejection = expected.rejections.find((item) => item.source_path === "unreadable.md");

  const invalidPaths = ["/absolute.md", "C:/drive.md", "dot/../escape.md", "dot/./file.md", "empty//file.md", "trailing./file.md", "folder/trailing. ", "back\\slash.md"];
  for (const path of invalidPaths) {
    const forged = resealFinding({ ...clone(baseFinding), source_path: path });
    assert.equal(validators.finding(forged), false, path);
    assert.throws(() => sealIngestFindingEnvelope(forged), /GKX_INGEST_FINDING_PATH_INVALID/, path);
  }

  const findingForges = [
    ["report-only intrinsic code", (item) => { item.classification = "cross_record_report_only"; }],
    ["scan scope", (item) => { item.scope = "frontmatter"; }],
    ["scan line", (item) => { item.coordinate_basis = "document_line"; item.line = 1; }],
  ];
  for (const [name, mutate] of findingForges) {
    const forged = clone(baseFinding);
    mutate(forged);
    Object.assign(forged, resealFinding(forged));
    assert.equal(validators.finding(forged), false, name);
    assert.throws(() => sealIngestFindingEnvelope(forged), /GKX_INGEST_FINDING_/, name);
  }
  const wrongFindingDigest = clone(baseFinding);
  wrongFindingDigest.finding_id = `sha256:${"0".repeat(64)}`;
  assert.equal(validators.finding(wrongFindingDigest), true, "JSON Schema cannot recompute a digest");
  assert.throws(() => sealIngestFindingEnvelope(wrongFindingDigest), /GKX_INGEST_FINDING_DIGEST_INVALID/);

  const uidFinding = expected.findings.find((item) => item.code === "GKX_INGEST_UID_REQUIRED");
  const exactFieldBindings = [
    ["ingest UID", "GKX_INGEST_UID_REQUIRED", "uid"],
    ["canonical UID", "CANONICAL_SOURCE_UID_UNAVAILABLE", "uid"],
    ["profile version", "GKX_INGEST_PROFILE_VERSION_REQUIRED", "gkx_version"],
    ["validity timestamp", "CANONICAL_VALIDITY_TIMESTAMP_NONPORTABLE", "created_at"],
    ["validity binding", "CANONICAL_VALIDITY_BINDING_MISMATCH", "created_at"],
    ["authored relationship", "AUTHORED_RELATIONSHIP_REFERENCE_INVALID", "relationships.supports"],
  ];
  for (const [name, code, field] of exactFieldBindings) {
    const valid = resealFinding({ ...clone(uidFinding), code, field });
    assert.deepEqual(sealIngestFindingEnvelope(valid), valid, `${name} canonical binding`);
    const forged = resealFinding({ ...valid, field: "title" });
    assert.equal(validators.finding(forged), false, `${name} is structurally frozen`);
    assert.throws(
      () => sealIngestFindingEnvelope(forged),
      /GKX_INGEST_FINDING_(?:FIELD_BINDING|AUTHORED_RELATIONSHIP_FIELD)_INVALID/,
      name,
    );
  }
  const noField = resealFinding({ ...clone(baseFinding), code: "CANONICAL_VALIDITY_REFERENCE_UNAVAILABLE" });
  assert.deepEqual(sealIngestFindingEnvelope(noField), noField);
  const forgedNoField = resealFinding({
    ...noField, scope: "field", coordinate_basis: "frontmatter_field", line: 1, field: "title",
  });
  assert.equal(validators.finding(forgedNoField), false, "fixed no-field code is structurally frozen");
  assert.throws(
    () => sealIngestFindingEnvelope(forgedNoField),
    /GKX_INGEST_FINDING_(?:FIELD_BINDING|CANONICAL_REASON_SHAPE)_INVALID/,
  );

  const unmapped = resealFinding({
    ...clone(uidFinding),
    code: "GKX_INGEST_CANONICAL_DIAGNOSTIC_UNMAPPED",
    severity: "error",
    classification: "intrinsic",
    scope: "frontmatter",
    coordinate_basis: "file_observation",
    line: null,
    field: null,
  });
  assert.deepEqual(sealIngestFindingEnvelope(unmapped), unmapped, "the unknown-code fallback is fully redacted");
  for (const [name, changes] of [
    ["attacker field", { scope: "field", coordinate_basis: "frontmatter_field", line: 2, field: "x-attacker" }],
    ["attacker line", { coordinate_basis: "document_line", line: 2 }],
  ]) {
    const forged = resealFinding({ ...unmapped, ...changes });
    assert.equal(validators.finding(forged), false, name);
    assert.throws(() => sealIngestFindingEnvelope(forged), /GKX_INGEST_FINDING_UNMAPPED_SHAPE_INVALID/, name);
  }

  const temporal = clone(expected.rejections.find((item) => item.canonical_valid_from !== null));
  temporal.canonical_valid_from = "2026-08-02T00:00:00.000Z";
  Object.assign(temporal, resealRejection(temporal));
  assert.equal(validators.rejection(temporal), true, "JSON Schema cannot assert timestamp equality");
  assert.throws(() => sealIngestRejectionEnvelope(temporal, normalized), /GKX_INGEST_REJECTION_TEMPORAL_BINDING_INVALID/);

  const sourceBinding = clone(baseRejection);
  sourceBinding.source_digest = `sha256:${"1".repeat(64)}`;
  sourceBinding.source_size_bytes = null;
  Object.assign(sourceBinding, resealRejection(sourceBinding));
  assert.equal(validators.rejection(sourceBinding), false);
  assert.throws(() => sealIngestRejectionEnvelope(sourceBinding, normalized), /GKX_INGEST_REJECTION_SOURCE_BINDING_INVALID/);

  const reordered = clone(expected.rejections.find((item) => item.findings.length > 1));
  reordered.findings.reverse();
  Object.assign(reordered, resealRejection(reordered));
  assert.equal(validators.rejection(reordered), true, "JSON Schema cannot enforce canonical finding order");
  assert.throws(() => sealIngestRejectionEnvelope(reordered, normalized), /GKX_INGEST_REJECTION_FINDINGS_INVALID/);

  const wrongRejectionDigest = clone(baseRejection);
  wrongRejectionDigest.rejection_digest = `sha256:${"0".repeat(64)}`;
  assert.equal(validators.rejection(wrongRejectionDigest), true, "JSON Schema cannot recompute a rejection digest");
  assert.throws(() => sealIngestRejectionEnvelope(wrongRejectionDigest, normalized), /GKX_INGEST_REJECTION_DIGEST_INVALID/);

  const negativeZeroOrdinal = clone(baseRejection);
  negativeZeroOrdinal.source_observation_ordinal = -0;
  Object.assign(negativeZeroOrdinal, resealRejection(negativeZeroOrdinal));
  assert.equal(validators.rejection(negativeZeroOrdinal), true);
  assert.throws(() => sealIngestRejectionEnvelope(negativeZeroOrdinal, normalized), /GKX_INGEST_REJECTION_INVALID/);

  const nestedOrdinal = clone(baseRejection);
  nestedOrdinal.findings[0].source_observation_ordinal = nestedOrdinal.source_observation_ordinal + 1;
  nestedOrdinal.findings[0] = resealFinding(nestedOrdinal.findings[0]);
  Object.assign(nestedOrdinal, resealRejection(nestedOrdinal));
  assert.throws(
    () => sealIngestRejectionEnvelope(nestedOrdinal, normalized),
    /GKX_INGEST_REJECTION_FINDINGS_INVALID/,
    "standalone journal rows bind every nested finding to the exact observation ordinal",
  );

  const loweredSeverity = clone(expected.rejections.find((item) => item.findings.some((finding) => finding.code === "GKX-PROVENANCE-001")));
  const loweredIndex = loweredSeverity.findings.findIndex((item) => item.code === "GKX-PROVENANCE-001");
  loweredSeverity.findings[loweredIndex].severity = "info";
  loweredSeverity.findings[loweredIndex] = resealFinding(loweredSeverity.findings[loweredIndex]);
  loweredSeverity.rejection_digest = retrieval.retrievalCanonicalDigest(without(loweredSeverity, "rejection_digest"));
  assert.equal(validators.rejection(loweredSeverity), false, "base severity floors are structurally frozen");
  assert.throws(
    () => sealIngestRejectionEnvelope(loweredSeverity, normalized),
    /GKX_INGEST_FINDING_SEVERITY_(?:FLOOR|BINDING)_INVALID/,
  );

  const profileFinding = (code, field, basis, line, scope = "field", severity = "error") => resealFinding({
    contract_version: "gkos-ingest-finding/1.0.0-draft.1",
    finding_id: `sha256:${"0".repeat(64)}`,
    code,
    severity,
    classification: "intrinsic",
    scope,
    coordinate_basis: basis,
    source_path: "unreadable.md",
    source_observation_ordinal: 0,
    line,
    field,
    deterministic: true,
  });
  const profileCorrelationForges = [
    ["unknown under allow", profileFinding("GKX_PROFILE_UNKNOWN_FIELD", null, "frontmatter_field", 1, "frontmatter", "warning"), /GKX_INGEST_FINDING_PROFILE_UNKNOWN_POLICY_INVALID/],
    ["non-required field", profileFinding("GKX_PROFILE_FIELD_REQUIRED", "updated_at", "missing_field", null), /GKX_INGEST_FINDING_PROFILE_RULE_INVALID/],
    ["enumless field", profileFinding("GKX_PROFILE_ENUM_INVALID", "updated_at", "frontmatter_field", 1), /GKX_INGEST_FINDING_PROFILE_RULE_INVALID/],
    ["non-string field", profileFinding("GKX_PROFILE_LENGTH_INVALID", "tags", "frontmatter_field", 1), /GKX_INGEST_FINDING_PROFILE_RULE_INVALID/],
    ["unknown type rule", profileFinding("GKX_PROFILE_TYPE_INVALID", "x-owner", "frontmatter_field", 1), /GKX_INGEST_FINDING_PROFILE_RULE_INVALID/],
    ["public sensitivity floor", profileFinding("GKX_PROFILE_SENSITIVITY_BELOW_MINIMUM", "sensitivity.level", "frontmatter_field", 1), /GKX_INGEST_FINDING_PROFILE_SENSITIVITY_INVALID/],
  ];
  for (const [name, forgedFinding, expectedError] of profileCorrelationForges) {
    const forged = clone(baseRejection);
    forged.findings = sortSafeFindings([...forged.findings, forgedFinding]);
    Object.assign(forged, resealRejection(forged));
    assert.equal(validators.rejection(forged), true, `${name} is cross-envelope semantic state`);
    assert.throws(() => sealIngestRejectionEnvelope(forged, normalized), expectedError, name);
  }
  const launderedPresentNull = profileFinding("GKX_PROFILE_TYPE_INVALID", "sensitivity", "missing_field", null);
  assert.equal(validators.finding(launderedPresentNull), false, "type failures cannot be laundered into missing-field coordinates");
  assert.throws(
    () => sealIngestFindingEnvelope(launderedPresentNull),
    /GKX_INGEST_FINDING_PROFILE_FIELD_SHAPE_INVALID/,
  );

  const rejectingUnknownProfile = clone(normalized);
  rejectingUnknownProfile.unknown_fields = "reject";
  const rejectingUnknownCoordinate = {
    ...clone(expected.profile),
    selector_id: "operator-overlay",
    overlay_sha256: `sha256:${"3".repeat(64)}`,
    effective_profile_digest: retrieval.retrievalCanonicalDigest(rejectingUnknownProfile),
  };
  const wrongUnknownSeverity = clone(baseRejection);
  wrongUnknownSeverity.profile = rejectingUnknownCoordinate;
  wrongUnknownSeverity.findings = sortSafeFindings([
    ...wrongUnknownSeverity.findings,
    profileFinding("GKX_PROFILE_UNKNOWN_FIELD", null, "frontmatter_field", 1, "frontmatter", "warning"),
  ]);
  Object.assign(wrongUnknownSeverity, resealRejection(wrongUnknownSeverity));
  assert.equal(validators.rejection(wrongUnknownSeverity), true);
  assert.throws(
    () => sealIngestRejectionEnvelope(wrongUnknownSeverity, rejectingUnknownProfile),
    /GKX_INGEST_FINDING_PROFILE_UNKNOWN_POLICY_INVALID/,
  );

  const resultForges = [
    ["finding summary", (item) => { item.summary.findings.error++; }],
    ["source partition", (item) => { item.summary.valid_source_count++; }],
    ["rejection count", (item) => { item.summary.rejected_source_count--; }],
    ["intrinsic predicate", (item) => { item.ingest_intrinsic_valid = true; }],
    ["negative-zero count", (item) => { item.summary.valid_source_count = -0; }],
  ];
  for (const [name, mutate] of resultForges) {
    const forged = clone(expected);
    mutate(forged);
    assert.equal(validators.result(forged), name === "intrinsic predicate" ? false : true, name);
    assert.throws(() => sealIngestValidationResultEnvelope(forged), /GKX_INGEST_RESULT_/, name);
  }

  const acceptedWithoutBytes = clone(expected);
  const acceptedObservation = acceptedWithoutBytes.observations.find((item) => item.classification === "accepted");
  acceptedObservation.source_digest = null;
  acceptedObservation.source_size_bytes = null;
  assert.equal(validators.result(acceptedWithoutBytes), false, "accepted observations require sealed bytes structurally");
  assert.throws(
    () => sealIngestValidationResultEnvelope(acceptedWithoutBytes),
    /GKX_INGEST_OBSERVATION_ACCEPTED_SOURCE_BINDING_REQUIRED/,
  );

  const orphan = clone(expected);
  const orphanFinding = resealFinding({
    ...clone(expected.findings.find((item) => item.code === "GKX-PROVENANCE-001")),
    source_path: "ghost.md",
    source_observation_ordinal: 0,
  });
  orphan.findings = sortSafeFindings([...orphan.findings, orphanFinding]);
  orphan.summary.findings.warning++;
  assert.equal(validators.result(orphan), true, "observation membership is a residual cross-row invariant");
  assert.throws(
    () => sealIngestValidationResultEnvelope(orphan),
    /GKX_INGEST_RESULT_FINDING_OBSERVATION_INVALID/,
  );

  const removedWarning = clone(expected);
  const rejectedIndex = removedWarning.rejections.findIndex((item) =>
    item.source_path === "same.md" && item.source_observation_ordinal === 1);
  removedWarning.rejections[rejectedIndex].findings = removedWarning.rejections[rejectedIndex].findings
    .filter((item) => item.code !== "GKX-PROVENANCE-001");
  removedWarning.rejections[rejectedIndex] = resealRejection(removedWarning.rejections[rejectedIndex]);
  assert.throws(
    () => sealIngestValidationResultEnvelope(removedWarning),
    /GKX_INGEST_RESULT_REJECTION_FINDING_SET_INVALID/,
    "a rejection seals every safe finding owned by its observation",
  );

  const escalated = clone(expected);
  const warningIndex = escalated.findings.findIndex((item) =>
    item.code === "GKX-PROVENANCE-001" && item.source_observation_ordinal === 0);
  escalated.findings[warningIndex].severity = "critical";
  escalated.findings[warningIndex] = resealFinding(escalated.findings[warningIndex]);
  escalated.findings = sortSafeFindings(escalated.findings);
  escalated.summary.findings.warning--;
  escalated.summary.findings.critical++;
  assert.throws(
    () => sealIngestValidationResultEnvelope(escalated),
    /GKX_INGEST_FINDING_SEVERITY_PROFILE_MISMATCH/,
    "a caller cannot mint a blocker above the bound normalized severity",
  );

  const schemaInfo = clone(expected);
  const inventedEscalation = resealFinding({
    ...clone(uidFinding),
    code: "GKX-SCHEMA-002",
    severity: "error",
    field: "gkx_version",
    line: 2,
  });
  schemaInfo.findings = sortSafeFindings([...schemaInfo.findings, inventedEscalation]);
  schemaInfo.summary.findings.error++;
  assert.throws(
    () => sealIngestValidationResultEnvelope(schemaInfo),
    /GKX_INGEST_FINDING_SEVERITY_PROFILE_MISMATCH/,
    "info diagnostics cannot be escalated into self-minted rejection authority",
  );

  const moveObservation = (source, path, from, to) => {
    const moved = clone(source);
    const replacementIds = new Map();
    moved.findings = moved.findings.map((item) => {
      if (item.source_path !== path || item.source_observation_ordinal !== from) return item;
      const replacement = resealFinding({ ...item, source_observation_ordinal: to });
      replacementIds.set(item.finding_id, replacement.finding_id);
      return replacement;
    });
    moved.findings = sortSafeFindings(moved.findings);
    const observation = moved.observations.find((item) =>
      item.source_path === path && item.source_observation_ordinal === from);
    observation.source_observation_ordinal = to;
    observation.finding_ids = observation.finding_ids.map((id) => replacementIds.get(id) ?? id).sort();
    observation.intrinsic_blocking_finding_ids = observation.intrinsic_blocking_finding_ids
      .map((id) => replacementIds.get(id) ?? id).sort();
    moved.observations.sort((left, right) => left.source_path < right.source_path ? -1 : left.source_path > right.source_path ? 1 :
      left.source_observation_ordinal - right.source_observation_ordinal);
    const rejectionIndex = moved.rejections.findIndex((item) =>
      item.source_path === path && item.source_observation_ordinal === from);
    if (rejectionIndex >= 0) {
      moved.rejections[rejectionIndex].source_observation_ordinal = to;
      moved.rejections[rejectionIndex].findings = moved.rejections[rejectionIndex].findings.map((item) =>
        moved.findings.find((candidate) => candidate.finding_id === replacementIds.get(item.finding_id)));
      moved.rejections[rejectionIndex] = resealRejection(moved.rejections[rejectionIndex]);
      moved.rejections = sortSafeRejections(moved.rejections);
    }
    return moved;
  };

  const nonzeroSingleton = moveObservation(expected, "unreadable.md", 0, 7);
  assert.equal(validators.result(nonzeroSingleton), true, "JSON Schema cannot correlate rejection multiplicity");
  assert.throws(
    () => sealIngestValidationResultEnvelope(nonzeroSingleton),
    /GKX_INGEST_RESULT_OBSERVATION_MULTIPLICITY_INVALID/,
    "singleton observations start at zero",
  );

  const withSecondUnreadable = (ordinal) => {
    const moved = moveObservation(expected, "unreadable.md", 0, ordinal);
    const forged = clone(expected);
    const secondObservation = moved.observations.find((item) => item.source_path === "unreadable.md");
    const secondRejection = moved.rejections.find((item) => item.source_path === "unreadable.md");
    const secondFindings = moved.findings.filter((item) => item.source_path === "unreadable.md");
    forged.findings = sortSafeFindings([...forged.findings, ...secondFindings]);
    forged.observations = [...forged.observations, secondObservation].sort((left, right) =>
      left.source_path < right.source_path ? -1 : left.source_path > right.source_path ? 1 :
        left.source_observation_ordinal - right.source_observation_ordinal);
    forged.rejections = sortSafeRejections([...forged.rejections, secondRejection]);
    forged.summary.observed_source_count++;
    forged.summary.rejected_source_count++;
    for (const finding of secondFindings) forged.summary.findings[finding.severity]++;
    return forged;
  };
  for (const [name, ordinal, schemaValid] of [["ordinal gap", 2, true], ["duplicate ordinal", 0, false]]) {
    const forged = withSecondUnreadable(ordinal);
    assert.equal(
      validators.result(forged),
      schemaValid,
      schemaValid ? `${name} remains a cross-row semantic invariant` : `${name} is also structurally rejected`,
    );
    assert.throws(
      () => sealIngestValidationResultEnvelope(forged),
      /GKX_INGEST_RESULT_(?:OBSERVATION_(?:MULTIPLICITY|ORDER)|FINDING_ORDER)_INVALID/,
      name,
    );
  }

  const foreignFinding = clone(expected);
  const foreignRejectionIndex = foreignFinding.rejections.findIndex((item) => item.source_path === "unreadable.md");
  const forgedNestedFinding = clone(foreignFinding.rejections[foreignRejectionIndex].findings[0]);
  forgedNestedFinding.code = "SOURCE_SIZE_LIMIT_EXCEEDED";
  foreignFinding.rejections[foreignRejectionIndex].findings[0] = resealFinding(forgedNestedFinding);
  foreignFinding.rejections[foreignRejectionIndex] = resealRejection(foreignFinding.rejections[foreignRejectionIndex]);
  assert.equal(validators.result(foreignFinding), true, "JSON Schema cannot bind nested findings to the result set");
  assert.throws(
    () => sealIngestValidationResultEnvelope(foreignFinding),
    /GKX_INGEST_RESULT_REJECTION_FINDING_(?:MISMATCH|SET_INVALID)/,
  );

  const schema004 = resealFinding({
    ...clone(uidFinding), code: "GKX-SCHEMA-004", severity: "error", field: "x-foo",
  });
  assert.equal(validators.finding(schema004), false, "GKX-SCHEMA-004 has a finite producer field set");
  assert.throws(
    () => sealIngestFindingEnvelope(schema004),
    /GKX_INGEST_FINDING_CANONICAL_DIAGNOSTIC_FIELD_INVALID/,
  );

  const badCoordinate = clone(expected.profile);
  badCoordinate.effective_profile_digest = `sha256:${"2".repeat(64)}`;
  assert.equal(validators.coordinate(badCoordinate), false, "built-in digest is frozen structurally");
  assert.throws(() => sealIngestProfileCoordinate(badCoordinate, normalized), /GKX_INGEST_PROFILE_COORDINATE_BINDING_INVALID|GKX_INGEST_BUILTIN_PROFILE_COORDINATE_INVALID/);
});

test("Phase-3 host authority remains absent from public bundles and Phase-2 projection bytes", async () => {
  const forbidden = [
    "buildIngestValidationPlan", "loadIngestProfile", "gkxRetrievalProjectionRejectionRecordKey",
    "gkxRecordValidationReceipt", "bindCanonicalCandidateRecord", "sealNormalizedIngestProfileEnvelope",
    "sealIngestProfileCoordinate", "sealIngestFindingEnvelope", "sealIngestRejectionEnvelope",
    "sealIngestValidationResultEnvelope",
  ];
  for (const surface of [core, gkx, retrieval]) {
    for (const name of forbidden) assert.equal(name in surface, false, name);
  }
  for (const name of forbidden) assert.equal(name in retrievalHost, false, name);
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(Object.hasOwn(packageJson.exports, "./ingest"), false);

  const projected = retrievalHost.projectGkxRetrievalCorpus([
    source("invalid.md", note("invalid-authored-uid", "Invalid")),
  ]);
  assert.equal(projected.rejections.length, 1);
  assert.deepEqual(Object.keys(projected.rejections[0]).sort(), ["reason_codes", "source_id", "source_path"]);
  assert.deepEqual(Reflect.ownKeys(projected.rejections[0]).sort(), ["reason_codes", "source_id", "source_path"]);
});
