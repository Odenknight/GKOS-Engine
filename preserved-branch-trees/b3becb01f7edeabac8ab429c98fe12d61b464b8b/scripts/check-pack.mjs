import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

function assertWellFormedJsonStrings(value, coordinate) {
  if (typeof value === "string") {
    for (let index = 0; index < value.length; index++) {
      const code = value.charCodeAt(index);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = value.charCodeAt(index + 1);
        if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error(`${coordinate} contains an unpaired UTF-16 surrogate`);
        index++;
      } else if (code >= 0xdc00 && code <= 0xdfff) throw new Error(`${coordinate} contains an unpaired UTF-16 surrogate`);
    }
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    assertWellFormedJsonStrings(key, `${coordinate} object key`);
    assertWellFormedJsonStrings(item, `${coordinate}.${key}`);
  }
}

function codeUnitCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort(codeUnitCompare).map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  throw new Error("watcher pack contains a non-canonical JSON value");
}

const ingestPackDirectory = new URL("../contracts/ingest/gkos-ingest-validation-1.0.0-draft.1/", import.meta.url);
const ingestContract = JSON.parse(readFileSync(new URL("contract.json", ingestPackDirectory), "utf8"));
if (ingestContract.status !== "frozen" || ingestContract.frozen !== true || ingestContract.hash_manifest_issued !== true) {
  throw new Error("ingest contract pack is not frozen and hash-manifest-issued");
}

const evaluationPackDirectory = new URL("../contracts/retrieval/gkos-retrieval-evaluation-1.0.0-draft.1/", import.meta.url);
const evaluationPackFiles = readdirSync(evaluationPackDirectory).sort();
let evaluationPackBytes = 0;
for (const name of evaluationPackFiles) {
  const bytes = readFileSync(new URL(name, evaluationPackDirectory));
  evaluationPackBytes += bytes.length;
  if (bytes.length < 1 || bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
    || bytes.includes(0x0d) || bytes.at(-1) !== 0x0a || bytes.at(-2) === 0x0a) {
    throw new Error(`evaluation pack text encoding mismatch: ${name}`);
  }
  if (name.endsWith(".json")) {
    const parsed = JSON.parse(bytes.toString("utf8"));
    assertWellFormedJsonStrings(parsed, name);
  }
}
if (evaluationPackBytes > 128 * 1024 * 1024) throw new Error("evaluation pack exceeds 128 MiB aggregate cap");
const evaluationProviderBytes = readFileSync(new URL("fixed-provider.json", evaluationPackDirectory));
if (evaluationProviderBytes.length > 8 * 1024 * 1024) throw new Error("evaluation fixed provider exceeds 8 MiB file cap");
const evaluationContract = JSON.parse(readFileSync(new URL("contract.json", evaluationPackDirectory), "utf8"));
if (evaluationContract.status !== "provisional" || evaluationContract.frozen !== false || evaluationContract.hashes_frozen !== false) {
  throw new Error("evaluation Slice-A pack must remain provisional and unhashed");
}

const watcherPackDirectory = new URL("../contracts/watcher/gkos-watcher-recovery-1.0.0-draft.1/", import.meta.url);
const watcherPackFiles = readdirSync(watcherPackDirectory).sort(codeUnitCompare);
const expectedWatcherPackFiles = [
  "README.md",
  "TECHNICAL_README.md",
  "authority.schema.json",
  "batch.schema.json",
  "coherent-manifest.schema.json",
  "conformance.schema.json",
  "journal.schema.json",
  "pack-manifest.json",
  "sample-plan.schema.json",
  "source-removal.schema.json",
  "status.schema.json",
  "topology.schema.json",
  "transition.schema.json",
  "watcher-cli-fixture.json",
  "watcher-conformance-fixture.json",
  "watcher-recovery-fixture.json",
  "watcher-sample-plan.json",
  "watcher-storage-fixture.json",
];
if (JSON.stringify(watcherPackFiles) !== JSON.stringify(expectedWatcherPackFiles)) {
  throw new Error("watcher recovery pack all-and-only file set mismatch");
}
for (const name of watcherPackFiles) {
  const bytes = readFileSync(new URL(name, watcherPackDirectory));
  if (bytes.length < 1 || bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf || bytes.includes(0x0d)) {
    throw new Error(`watcher recovery pack text encoding mismatch: ${name}`);
  }
  if (name === "watcher-sample-plan.json") {
    if (bytes.at(-1) === 0x0a) throw new Error("watcher SamplePlan must not have a terminal LF");
  } else if (bytes.at(-1) !== 0x0a || bytes.at(-2) === 0x0a) {
    throw new Error(`watcher recovery pack terminal LF mismatch: ${name}`);
  }
  if (name.endsWith(".json")) assertWellFormedJsonStrings(JSON.parse(bytes.toString("utf8")), name);
}
const watcherManifest = JSON.parse(readFileSync(new URL("pack-manifest.json", watcherPackDirectory), "utf8"));
const watcherManifestFiles = expectedWatcherPackFiles.filter((name) => name !== "pack-manifest.json");
if (watcherManifest.contract_version !== "gkos-watcher-recovery-pack-manifest/1.0.0-draft.1"
    || watcherManifest.pack_contract_version !== "gkos-watcher-recovery/1.0.0-draft.1"
    || watcherManifest.file_count !== 17
    || !Array.isArray(watcherManifest.files)
    || JSON.stringify(watcherManifest.files.map((row) => row.file)) !== JSON.stringify(watcherManifestFiles)) {
  throw new Error("watcher recovery pack manifest envelope mismatch");
}
let watcherPackBytes = 0;
for (const row of watcherManifest.files) {
  if (Object.keys(row).sort(codeUnitCompare).join(",") !== "byte_size,file,raw_sha256") {
    throw new Error(`watcher recovery pack manifest row keys mismatch: ${String(row.file)}`);
  }
  const bytes = readFileSync(new URL(row.file, watcherPackDirectory));
  const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  if (row.byte_size !== bytes.length || row.raw_sha256 !== digest) {
    throw new Error(`watcher recovery pack manifest row mismatch: ${row.file}`);
  }
  watcherPackBytes += bytes.length;
}
const watcherManifestMaterial = { ...watcherManifest };
delete watcherManifestMaterial.pack_digest;
const expectedWatcherPackDigest = `sha256:${createHash("sha256").update(canonicalJson(watcherManifestMaterial)).digest("hex")}`;
if (watcherManifest.total_bytes !== watcherPackBytes || watcherManifest.pack_digest !== expectedWatcherPackDigest) {
  throw new Error("watcher recovery pack aggregate/digest mismatch");
}
const identityPackFiles = [];
for (const version of ["draft.1", "draft.2"]) {
  const directory = new URL(`../contracts/identity/GKOS-AGENT-IDENTITY-MCP-CONTRACT-1.0.0-${version}/`, import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL("pack-manifest.json", directory), "utf8"));
  const names = readdirSync(directory).sort(codeUnitCompare);
  const declared = ["pack-manifest.json", ...manifest.leaves.map((row) => row.path)].sort(codeUnitCompare);
  if (JSON.stringify(names) !== JSON.stringify(declared)) throw new Error(`identity ${version} pack closure mismatch`);
  for (const row of manifest.leaves) {
    const bytes = readFileSync(new URL(row.path, directory));
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (row.size !== bytes.length || row.sha256 !== digest) throw new Error(`identity ${version} manifest mismatch: ${row.path}`);
  }
  identityPackFiles.push(...names.map((name) => `contracts/identity/GKOS-AGENT-IDENTITY-MCP-CONTRACT-1.0.0-${version}/${name}`));
}
for (const fixtureName of ["conformance-fixture.json", "storage-conformance-fixture.json", "cli-conformance-fixture.json"]) {
  const fixture = JSON.parse(readFileSync(new URL(fixtureName, ingestPackDirectory), "utf8"));
  if (fixture.status !== "frozen" || fixture.frozen !== true) throw new Error(`${fixtureName} is not frozen`);
}
for (const name of readdirSync(ingestPackDirectory).filter((item) => item.endsWith(".json"))) {
  const parsed = JSON.parse(readFileSync(new URL(name, ingestPackDirectory), "utf8"));
  assertWellFormedJsonStrings(parsed, name);
}
const ingestEvidence = readFileSync(
  new URL("../evidence/2026-08-21-functional-uplift-phase-3.md", import.meta.url),
  "utf8",
);
const ingestHashManifest = new Map([...ingestEvidence.matchAll(
  /^\| `([^`]+)` \| (\d+) \| `([0-9a-f]{64})` \|$/gmu,
)].map((match) => [match[1], { bytes: Number(match[2]), sha256: match[3] }]));
const ingestPackFiles = readdirSync(ingestPackDirectory).sort();
if (ingestHashManifest.size !== ingestPackFiles.length) throw new Error("ingest hash manifest file count mismatch");
for (const name of ingestPackFiles) {
  const bytes = readFileSync(new URL(name, ingestPackDirectory));
  const expected = ingestHashManifest.get(name);
  if (!expected || expected.bytes !== bytes.length
    || expected.sha256 !== createHash("sha256").update(bytes).digest("hex")) {
    throw new Error(`ingest hash manifest mismatch: ${name}`);
  }
  if (bytes.length < 1 || bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
    || bytes.includes(0x0d) || bytes.at(-1) !== 0x0a || bytes.at(-2) === 0x0a) {
    throw new Error(`ingest pack text encoding mismatch: ${name}`);
  }
}

const raw = execFileSync(
  process.execPath,
  [process.env.npm_execpath, "pack", "--dry-run", "--json"],
  {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    env: { ...process.env, npm_config_ignore_scripts: "true" },
  },
);
const jsonStart = raw.indexOf("[");
const jsonEnd = raw.lastIndexOf("]");
if (jsonStart < 0 || jsonEnd < jsonStart) throw new Error(`npm pack did not return JSON:\n${raw}`);
const report = JSON.parse(raw.slice(jsonStart, jsonEnd + 1))[0];
const files = report.files.map((entry) => entry.path);
const forbidden = files.filter((file) =>
  /(?:^|\/)(?:gkos-agent-[^/]+|sea-config\.json|sea-prep\.blob)$/.test(file),
);
if (forbidden.length) {
  throw new Error(`npm package contains platform-specific SEA artifacts:\n${forbidden.join("\n")}`);
}
for (const name of evaluationPackFiles) {
  const required = `contracts/retrieval/gkos-retrieval-evaluation-1.0.0-draft.1/${name}`;
  if (!files.includes(required)) throw new Error(`npm package is missing ${required}`);
}
for (const name of watcherPackFiles) {
  const required = `contracts/watcher/gkos-watcher-recovery-1.0.0-draft.1/${name}`;
  if (!files.includes(required)) throw new Error(`npm package is missing ${required}`);
}
for (const required of identityPackFiles) {
  if (!files.includes(required)) throw new Error(`npm package is missing ${required}`);
}
for (const required of [
  "dist/gkos-engine.mjs",
  "dist/adapter.mjs",
  "dist/gkx.mjs",
  "dist/graphiti-adapter.mjs",
  "dist/gkos-desktop-agent.mjs",
  "dist/service-stdio.mjs",
  "dist/service/stdio.d.ts",
  "bin/gkos-mcp-stdio.mjs",
  "dist/navigation.mjs",
  "dist/navigation/index.d.ts",
  "dist/governance.mjs",
  "dist/governance/index.d.ts",
  "dist/retrieval.mjs",
  "dist/retrieval-host.mjs",
  "dist/retrieval-path-security.mjs",
  "dist/retrieval/index.d.ts",
  "dist/admission-policy.mjs",
  "dist/admission-policy/index.d.ts",
  "dist/ingest-host.mjs",
  "dist/ingest/host.d.ts",
  "dist/watcher-contracts.mjs",
  "contracts/retrieval/gkos-retrieval-1.0.0-draft.1/contract.json",
  "contracts/retrieval/gkos-retrieval-1.0.0-draft.1/chunk.schema.json",
  "contracts/retrieval/gkos-retrieval-1.0.0-draft.1/result.schema.json",
  "contracts/retrieval/gkos-retrieval-1.0.0-draft.1/conformance-fixture.json",
  "contracts/retrieval/gkos-retrieval-1.0.0-draft.1/canonical-fixture.json",
  "contracts/retrieval/gkos-retrieval-1.0.0-draft.1/gkos-toml-lexical-fixture.json",
  "contracts/retrieval/gkos-retrieval-1.0.0-draft.1/projection.schema.json",
  "contracts/retrieval/gkos-retrieval-1.0.0-draft.1/gkos-config.schema.json",
  "contracts/retrieval/gkos-retrieval-1.0.0-draft.2/README.md",
  "contracts/retrieval/gkos-retrieval-1.0.0-draft.2/contract.json",
  "contracts/retrieval/gkos-retrieval-1.0.0-draft.2/chunk.schema.json",
  "contracts/retrieval/gkos-retrieval-1.0.0-draft.2/projection.schema.json",
  "contracts/retrieval/gkos-retrieval-1.0.0-draft.2/provenance.schema.json",
  "contracts/retrieval/gkos-retrieval-1.0.0-draft.2/stored-provenance.schema.json",
  "contracts/retrieval/gkos-retrieval-1.0.0-draft.2/result.schema.json",
  "contracts/retrieval/gkos-retrieval-1.0.0-draft.2/conformance-fixture.json",
  "contracts/ingest/gkos-ingest-validation-1.0.0-draft.1/README.md",
  "contracts/ingest/gkos-ingest-validation-1.0.0-draft.1/contract.json",
  "contracts/ingest/gkos-ingest-validation-1.0.0-draft.1/profile-coordinate.schema.json",
  "contracts/ingest/gkos-ingest-validation-1.0.0-draft.1/normalized-profile.schema.json",
  "contracts/ingest/gkos-ingest-validation-1.0.0-draft.1/finding.schema.json",
  "contracts/ingest/gkos-ingest-validation-1.0.0-draft.1/rejection.schema.json",
  "contracts/ingest/gkos-ingest-validation-1.0.0-draft.1/result.schema.json",
  "contracts/ingest/gkos-ingest-validation-1.0.0-draft.1/conformance-fixture.json",
  "contracts/ingest/gkos-ingest-validation-1.0.0-draft.1/state-common.schema.json",
  "contracts/ingest/gkos-ingest-validation-1.0.0-draft.1/rejection-journal.schema.json",
  "contracts/ingest/gkos-ingest-validation-1.0.0-draft.1/owner-generation.schema.json",
  "contracts/ingest/gkos-ingest-validation-1.0.0-draft.1/active-pointer.schema.json",
  "contracts/ingest/gkos-ingest-validation-1.0.0-draft.1/migration.schema.json",
  "contracts/ingest/gkos-ingest-validation-1.0.0-draft.1/legacy-tombstone.schema.json",
  "contracts/ingest/gkos-ingest-validation-1.0.0-draft.1/activation-root.schema.json",
  "contracts/ingest/gkos-ingest-validation-1.0.0-draft.1/authority-witness.schema.json",
  "contracts/ingest/gkos-ingest-validation-1.0.0-draft.1/authority-lock.schema.json",
  "contracts/ingest/gkos-ingest-validation-1.0.0-draft.1/attempt-status.schema.json",
  "contracts/ingest/gkos-ingest-validation-1.0.0-draft.1/index-result.schema.json",
  "contracts/ingest/gkos-ingest-validation-1.0.0-draft.1/storage-conformance-fixture.json",
  "contracts/ingest/gkos-ingest-validation-1.0.0-draft.1/cli-conformance-fixture.json",
  "contracts/admission-policy/1.0.0/policy.schema.json",
  "contracts/admission-policy/1.0.0/request.schema.json",
  "contracts/admission-policy/1.0.0/decision-receipt.schema.json",
  "contracts/admission-policy/1.0.0/reason-codes.json",
  "contracts/admission-policy/1.0.0/semantic-validation-rules.json",
  "contracts/admission-policy/1.0.0/artifact-manifest.json",
  "contracts/admission-policy/1.0.0/vectors/adversarial.json",
  "contracts/admission-policy/1.0.0/vectors/manifest.json",
  "docs/ADMISSION-POLICY-PROVIDER-V1.md",
  "evidence/2026-08-26-admission-policy-provider-v1.md",
  "evidence/2026-08-27-sol-pr31-repair.md",
  "docs/citations.md",
  "contracts/navigation/ENGINE-NAV-CONTRACT-1.0.0/manifest.json",
  "contracts/navigation/ENGINE-NAV-CONTRACT-1.0.0/fixtures.manifest.json",
  "contracts/navigation/ENGINE-NAV-CONTRACT-1.0.0/standard-requirements.json",
  "docs/NAVIGATION-CONTRACT.md",
  "docs/NAVIGATION-AUTHORITY-BOUNDARY.md",
  "docs/NAVIGATION-CONSUMER-MATRIX.md",
  "README.md",
  "TECHNICAL_README.md",
  "BEGINNERS_GUIDE.md",
  "COMPAT.md",
  "TRACEABILITY.md",
  "evidence/ENGINE-NAV-CONTRACT-1.0.0.json",
  "evidence/2026-08-16-navigation-2.1.0-verification.md",
  "services/gkos-intelligence/pyproject.toml",
  "services/gkos-intelligence/src/gkos_intelligence/server.py",
]) {
  if (!files.includes(required)) throw new Error(`npm package is missing ${required}`);
}
console.log(`package contents verified: ${files.length} files, ${report.size} bytes`);
