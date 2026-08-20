import assert from "node:assert/strict";
import { access, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

async function exists(path) { try { await access(path); return true; } catch { return false; } }

function specifiers(text) {
  const found = [];
  const pattern = /(?:\bfrom\s*|\bimport\s*\()\s*["']([^"']+)["']/g;
  for (const match of text.matchAll(pattern)) found.push(match[1]);
  return found;
}

async function resolveLocal(from, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(from), specifier);
  for (const candidate of [base, `${base}.ts`, join(base, "index.ts")]) {
    if (await exists(candidate) && (await stat(candidate)).isFile()) return candidate;
  }
  throw new Error(`Unresolved local architecture import ${specifier} from ${from}`);
}

async function reachableFrom(entry) {
  const pending = [resolve(entry)], seen = new Set(), files = new Map();
  while (pending.length) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const text = await readFile(file, "utf8");
    files.set(file, text);
    for (const specifier of specifiers(text)) {
      if (/^(?:node:)?(?:fs|fs\/promises)$/.test(specifier) || specifier === "node:child_process") throw new Error(`NavigationCore reaches mutation-capable module ${specifier} through ${file}`);
      const local = await resolveLocal(file, specifier);
      if (local) pending.push(local);
    }
  }
  return files;
}

function assertNoMutationCalls(files) {
  const mutation = /\b(?:writeFile|writeFileSync|appendFile|appendFileSync|rename|renameSync|rm|rmSync|unlink|unlinkSync|mkdir|mkdirSync|rmdir|rmdirSync|truncate|createWriteStream)\s*\(/;
  for (const [file, text] of files) assert.doesNotMatch(text, mutation, file);
}

test("NavigationCore cannot transitively reach filesystem mutation primitives", async () => {
  const reachable = await reachableFrom("src/navigation/index.ts");
  assert.ok(reachable.size > 10);
  assertNoMutationCalls(reachable);
});

test("architecture gate proves it catches a transitive hidden writer", async () => {
  const root = await mkdtemp(join(tmpdir(), "nav-architecture-negative-"));
  await writeFile(join(root, "index.ts"), 'export * from "./helper";\n');
  await writeFile(join(root, "helper.ts"), 'import { writeFile } from "node:fs/promises"; export const mutate = writeFile;\n');
  await assert.rejects(reachableFrom(join(root, "index.ts")), /mutation-capable module/);
});

test("deterministic Navigation modules contain no hidden wall clock, locale, random, or model source", async () => {
  const names = await readdir(resolve("src/navigation"));
  for (const name of names.filter((value) => value.endsWith(".ts"))) {
    const text = await readFile(resolve("src/navigation", name), "utf8");
    assert.doesNotMatch(text, /\bDate\.now\s*\(|\bMath\.random\s*\(|\brandomUUID\s*\(|\.localeCompare\s*\(/, name);
  }
});

test("checker type and evaluator have no replacement-classification input", async () => {
  const types = await readFile(resolve("src/navigation/types.ts"), "utf8");
  const checker = /export interface CheckerEscalation\s*\{([\s\S]*?)\n\}/.exec(types)?.[1] ?? "";
  assert.match(checker, /escalateToMajor:\s*boolean/);
  assert.doesNotMatch(checker, /classification|decision|routine/);
  const all = await Promise.all((await readdir(resolve("src/navigation"))).filter((name) => name.endsWith(".ts")).map((name) => readFile(resolve("src/navigation", name), "utf8")));
  assert.equal(all.join("\n").includes("checkerClassification"), false);
});

async function contractFiles() {
  const root = resolve("contracts/navigation/ENGINE-NAV-CONTRACT-1.0.0");
  return (await readdir(root)).filter((name) => name.endsWith(".json")).map((name) => join(root, name));
}

test("Engine Navigation contract pack is mechanically integration-only", async () => {
  const files = await contractFiles();
  assert.ok(files.length >= 3);
  for (const file of files) {
    const text = await readFile(file, "utf8");
    const value = JSON.parse(text);
    assert.doesNotMatch(text, /profiles_claimed|qualifying_profiles|GKOS-conformant|certif(?:y|ied|ication)/i, file);
    if (value.suite) {
      assert.equal(value.standing, "integration-only");
      assert.equal(value.gkos_conformance, false);
    }
  }
  const manifest = JSON.parse(await readFile(resolve("contracts/navigation/ENGINE-NAV-CONTRACT-1.0.0/manifest.json"), "utf8"));
  assert.equal(manifest.suite, "ENGINE-NAV-CONTRACT-1.0.0");
  const fixtures = JSON.parse(await readFile(resolve("contracts/navigation/ENGINE-NAV-CONTRACT-1.0.0/fixtures.manifest.json"), "utf8"));
  const fixtureIds = new Set(fixtures.fixtures.map((fixture) => fixture.id));
  for (const required of [
    "nav-governance-receipt-unavailable", "nav-governance-operation-replay-idempotent",
    "nav-delegation-expired-rejection", "nav-delegation-wrong-subject-rejection",
    "nav-delegation-widened-child-rejection", "nav-deterministic-major-no-downgrade",
    "nav-deterministic-indeterminate-no-downgrade", "nav-deferred-review-overdue-grant-freeze",
    "nav-reentry-standing-inheritance-rejection", "nav-inferred-supersession-rejection",
    "nav-core-no-source-write-reachability", "nav-capability-truthfulness",
  ]) assert.ok(fixtureIds.has(required), `missing required Engine fixture ${required}`);
});

test("pinned R15 traceability references only active allocated identifiers", async () => {
  const snapshot = JSON.parse(await readFile(resolve("contracts/navigation/ENGINE-NAV-CONTRACT-1.0.0/standard-requirements.json"), "utf8"));
  assert.equal(snapshot.pinned_standard_commit, "f3a3a1695263f162d2660b0f7b37116bba7db12e");
  const active = new Set(snapshot.active_requirement_ids);
  const traceability = await readFile(resolve("TRACEABILITY.md"), "utf8");
  const referenced = [...new Set(traceability.match(/GKOS-[A-Z]+-\d{3}/g) ?? [])];
  for (const id of referenced) assert.ok(active.has(id), `inactive or unknown traceability ID ${id}`);
  for (const id of ["GKOS-RECEIPT-001", "GKOS-REENTRY-004", "GKOS-DELEGATION-006"]) assert.ok(referenced.includes(id), `missing R15 traceability ${id}`);
});

test("package exports and build products include Navigation, Governance, and contract pack", async () => {
  const pkg = JSON.parse(await readFile(resolve("package.json"), "utf8"));
  assert.equal(pkg.version, "2.1.2");
  assert.equal(pkg.exports["./navigation"].types, "./dist/navigation/index.d.ts");
  assert.equal(pkg.exports["./governance"].types, "./dist/governance/index.d.ts");
  await Promise.all(["dist/navigation/index.d.ts", "dist/governance/index.d.ts", "dist/navigation.mjs", "dist/governance.mjs"].map((path) => readFile(resolve(path))));
});

test("2.1.2 release metadata and documentation claims are synchronized", async () => {
  const [pkg, lock, version, pyproject, pythonInit, readme, changelog, compat] = await Promise.all([
    readFile(resolve("package.json"), "utf8"), readFile(resolve("package-lock.json"), "utf8"),
    readFile(resolve("src/version.ts"), "utf8"), readFile(resolve("services/gkos-intelligence/pyproject.toml"), "utf8"),
    readFile(resolve("services/gkos-intelligence/src/gkos_intelligence/__init__.py"), "utf8"),
    readFile(resolve("README.md"), "utf8"), readFile(resolve("CHANGELOG.md"), "utf8"), readFile(resolve("COMPAT.md"), "utf8"),
  ]);
  assert.equal(JSON.parse(pkg).version, "2.1.2");
  assert.equal(JSON.parse(lock).version, "2.1.2");
  assert.equal(JSON.parse(lock).packages[""].version, "2.1.2");
  assert.match(version, /ENGINE_VERSION\s*=\s*"2\.1\.2"/);
  assert.match(pyproject, /^version\s*=\s*"2\.1\.2"/m);
  assert.match(pythonInit, /PROGRAM_VERSION\s*=\s*"2\.1\.2"/);
  assert.match(readme, /GKOS-Engine 2\.1\.2/);
  assert.match(readme, /source-content read-only/);
  assert.match(changelog, /^## 2\.1\.2$/m);
  assert.match(compat, /2\.1\.1 \| 2\.1\.2/);
});
