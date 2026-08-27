import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalSha256 } from "../dist/gkos-engine.mjs";
import { evaluateAdmissionPolicy } from "../dist/admission-policy.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contractDir = join(root, "contracts", "admission-policy", "1.0.0");
const vectorDir = join(contractDir, "vectors");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
const byteSha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

const policyPath = join(vectorDir, "policy.json");
const policy = readJson(policyPath);
const policyHash = await canonicalSha256(policy);

const manifestPath = join(vectorDir, "manifest.json");
const manifest = readJson(manifestPath);
manifest.policy.canonicalHash = policyHash;

for (const fixture of manifest.cases) {
  const requestPath = join(vectorDir, fixture.requestPath);
  const request = readJson(requestPath);
  request.policyRef.digest = policyHash;
  writeJson(requestPath, request);
  fixture.requestHash = await canonicalSha256(request);
  const receipt = await evaluateAdmissionPolicy(request, policy);
  fixture.outcome = receipt.outcome;
  fixture.reasonCodes = receipt.reasonCodes;
  fixture.decisionReceiptHash = receipt.decisionReceiptHash;
}
writeJson(manifestPath, manifest);

const artifactPaths = [
  "decision-receipt.schema.json",
  "policy.schema.json",
  "reason-codes.json",
  "request.schema.json",
  "semantic-validation-rules.json",
  "vectors/adversarial.json",
  "vectors/manifest.json",
  "vectors/policy.json",
  ...manifest.cases.map((fixture) => `vectors/${fixture.requestPath}`),
].sort();

const artifactManifest = {
  schema: "gkos.admission-policy.artifact-manifest.v1",
  contractVersion: "1.0.0",
  digestDomain: "exact Git blob bytes; UTF-8 with LF line endings",
  artifacts: artifactPaths.map((relativePath) => {
    const path = join(contractDir, relativePath);
    return {
      path: relativePath.replaceAll("\\", "/"),
      bytes: statSync(path).size,
      sha256: byteSha256(path),
    };
  }),
};
writeJson(join(contractDir, "artifact-manifest.json"), artifactManifest);

console.log(`generated ${manifest.cases.length} receipts and ${artifactPaths.length} artifact digests`);
