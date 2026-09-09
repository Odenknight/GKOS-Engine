import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readBoundedJson } from "./verify-documentation-artifact.mjs";
const SCHEMA_PIN = Object.freeze({ standardTag: "v0.81", standardCommit: "8f2a158c6d4b8cabd907d98765766d281aec1247", schemaVersion: "1.0.0", files: Object.freeze({ "refusal-receipt.schema.json": "11017113221f8ebc51b03c7de8078bdba3258a7d32b084d675ffd3de28c0182f", "gkx-common.defs.json": "b040687a4a9b6d17bce9e86fae28e6db7e667af8e2ebbe59f60ab9f2eea04c4b" }) });
function assertPinnedRefusalSchema(name, bytes) {
  if (!Object.hasOwn(SCHEMA_PIN.files, name) || createHash("sha256").update(bytes).digest("hex") !== SCHEMA_PIN.files[name]) throw Object.assign(new Error("REFUSAL_SCHEMA_PIN_MISMATCH"), { code: "REFUSAL_SCHEMA_PIN_MISMATCH" });
}
let validate;
function validateClaimedRefusalReceipt(value) {
  if (!validate) {
    const schemas = {};
    for (const name of Object.keys(SCHEMA_PIN.files)) {
      const bytes = readFileSync(new URL("../contracts/documentation-verifier/v0.81/" + name, import.meta.url));
      assertPinnedRefusalSchema(name, bytes);
      schemas[name] = JSON.parse(bytes);
    }
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    addFormats(ajv);
    ajv.addKeyword({ keyword: "x-gkx-set-order", schemaType: "string", valid: true });
    ajv.addSchema(schemas["gkx-common.defs.json"]);
    validate = ajv.compile(schemas["refusal-receipt.schema.json"]);
  }
  const valid = validate(value);
  return { schema: "gkos-refusal-schema-validation/1", status: valid ? "SCHEMA_VALID" : "SCHEMA_INVALID", schemaPin: SCHEMA_PIN, scope: "JSON-Schema-only; not gate registration, CBOR canonicalization, digest truth, signature, authority or profile conformance", errors: valid ? [] : validate.errors.slice(0, 16).map((e) => ({ keyword: e.keyword, instancePath: e.instancePath.slice(0, 160), schemaPath: e.schemaPath.slice(0, 160) })) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw Error("usage");
    const result = validateClaimedRefusalReceipt(readBoundedJson(process.argv[2]));
    console.log(JSON.stringify(result));
    process.exitCode = result.status === "SCHEMA_VALID" ? 0 : 1;
  } catch (error) {
    console.log(JSON.stringify({ schema: "gkos-refusal-schema-validation/1", status: "REFUSED", code: error.code === "REFUSAL_SCHEMA_PIN_MISMATCH" ? error.code : "REFUSAL_INPUT_UNREADABLE" }));
    process.exitCode = 2;
  }
}
export {
  SCHEMA_PIN,
  assertPinnedRefusalSchema,
  validateClaimedRefusalReceipt
};
