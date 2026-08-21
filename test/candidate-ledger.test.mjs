import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  inspectCanonicalCandidateLedger,
  inspectScopedCandidateResolution,
  TrustedCanonicalCandidateIndex,
} from "../dist/retrieval-host.mjs";
import * as rootApi from "../dist/gkos-engine.mjs";
import * as gkxApi from "../dist/gkx.mjs";
import * as retrievalApi from "../dist/retrieval.mjs";
import { assembleGraph, buildGraph, parseSourceFile } from "../dist/gkos-engine.mjs";

const UID_A = "018f0000-0000-7000-8000-000000000901";
const UID_B = "018f0000-0000-7000-8000-000000000902";
const UID_C = "018f0000-0000-7000-8000-000000000903";

function note(uid, title, extra = "", body = "body") {
  return `---\ngkx_version: "2.3"\nuid: "${uid}"\ntitle: "${title}"\ntype: "policy"\ncreated_at: "2026-08-01T00:00:00Z"\nepistemic_state: "reported"\nsensitivity: "public"\n${extra}---\n# ${title}\n${body}\n`;
}

function source(relativePath, content, extra = {}) {
  return { relativePath, content, createdTime: 1_700_000_000_000, modifiedTime: 1_700_000_000_000, ...extra };
}

function ledger(files) {
  const index = new TrustedCanonicalCandidateIndex();
  const graph = index.setFiles(files).graph;
  return { index, graph, ledger: inspectCanonicalCandidateLedger(graph) };
}

function stableLedger(value) {
  return {
    records: value.records.map(({ snapshot, ...record }) => ({
      ...record,
      snapshot: {
        ...snapshot,
        gkx: snapshot.gkx,
      },
    })),
    declarations: value.declarations,
  };
}

test("candidate ledger captures path multiplicity before compatibility maps and is permutation-stable", () => {
  const first = source("same.md", note(UID_A, "First", "", "first bytes"));
  const second = source("same.md", note(UID_B, "Second", "", "second bytes"));
  const left = ledger([first, second]);
  const right = ledger([second, first]);
  assert.equal(left.index.noteCount, 1, "compatibility graph remains path-keyed");
  assert.equal(left.ledger.records.length, 2, "candidate authority retains both records");
  assert.deepEqual(stableLedger(left.ledger), stableLedger(right.ledger));
  assert.deepEqual(left.graph.nodes, right.graph.nodes, "deterministic representative is input-order independent");

  const exact = ledger([first, structuredClone(first)]).ledger.records;
  assert.equal(exact.length, 2, "indistinguishable duplicates retain multiplicity");
  assert.notEqual(exact[0].record_key, exact[1].record_key);
  assert.match(exact[0].record_key, /:0$/u);
  assert.match(exact[1].record_key, /:1$/u);
});

test("candidate descriptors use parser-effective fields, SHA-256, and strict numeric preflight", () => {
  const content = note(UID_A, "Canonical", "", "Café 😀 decomposed e\u0301");
  const omitted = ledger([source("A.MD", content)]).ledger.records[0];
  const explicit = ledger([source("A.MD", content, { extension: "MD", kind: "note", size: content.length })]).ledger.records[0];
  assert.equal(omitted.record_key, explicit.record_key);
  assert.equal(omitted.source_digest, `sha256:${createHash("sha256").update(content).digest("hex")}`);
  assert.throws(() => ledger([source("bad.md", content, { size: -1 })]), /GKX_CANONICAL_SOURCE_SIZE_INVALID/u);
  assert.throws(() => ledger([source("bad.md", content, { modifiedTime: Number.NaN })]), /GKX_CANONICAL_SOURCE_TIME_INVALID/u);
  // These fixed 12-code-unit strings collide under the legacy parser FNV
  // fingerprint but not SHA-256. Both physical candidates must survive the
  // pre-policy ledger; Decision-A classifies the collision only in a scoped
  // authorized/nonfuture view.
  const collision = ledger([
    source("collision-a.md", "4kszgmse5lxd"),
    source("collision-b.md", "htz4xhtjlm59"),
  ]).ledger.records;
  assert.equal(collision.length, 2);
  assert.equal(collision[0].snapshot.parser_content_fingerprint, collision[1].snapshot.parser_content_fingerprint);
  assert.notEqual(collision[0].snapshot.source_digest, collision[1].snapshot.source_digest);
  assert.notEqual(collision[0].record_key, collision[1].record_key);
});

test("candidate authority is an immutable parse-time snapshot, not the compatibility record", () => {
  const built = ledger([source("A.md", note(UID_A, "Original"))]);
  const before = stableLedger(built.ledger);
  const live = built.index.getRecords().get("A.md");
  live.parsed.aliases.push("mutated");
  live.gkx.projection.authored.title = "mutated";
  live.gkx.projection.diagnostics.push({ code: "MUTATED", severity: "critical", message: "x", deterministic: true });
  const next = built.index.applyChanges({ folders: ["Folder"] }).graph;
  assert.deepEqual(stableLedger(inspectCanonicalCandidateLedger(next)), before);
});

test("scoped resolver uses exact frozen precedence, fallthrough, ambiguity stop, and scoped self", () => {
  const hiddenUid = source("Hidden.md", note(UID_A, "Hidden UID"));
  const pathFallback = source(`${UID_A}.md`, note(UID_B, "Path fallback"));
  const newer = source("New.md", note(UID_C, "New", `supersedes:\n  - "${UID_A}"\n`));
  const view = ledger([hiddenUid, pathFallback, newer]).ledger;
  const byUid = new Map(view.records.map((record) => [record.source_uid, record.record_key]));
  const receipt = view.declarations.find((item) => item.category === "lineage" && item.source_record_key === byUid.get(UID_C));
  assert.deepEqual(receipt.resolution_tiers.map((tier) => tier.basis), [
    "uid_exact", "path_exact", "path_without_extension_exact", "basename_title", "alias",
  ]);
  const fallenThrough = inspectScopedCandidateResolution(receipt, {
    known_created: new Set([byUid.get(UID_B), byUid.get(UID_C)]),
    future: new Set(),
    unknown: new Set(),
  });
  assert.deepEqual(fallenThrough, { status: "resolved", record_key: byUid.get(UID_B), basis: "path_without_extension_exact" });

  const ambiguousView = ledger([
    source("a/Target.md", note(UID_A, "Target A")),
    source("b/Target.md", note(UID_B, "Target B")),
    source("Alias.md", note("018f0000-0000-7000-8000-000000000904", "Alias", "aliases:\n  - Target\n")),
    source("New.md", note(UID_C, "New", "supersedes:\n  - Target\n")),
  ]).ledger;
  const ambiguousSource = ambiguousView.records.find((record) => record.source_uid === UID_C);
  const ambiguousReceipt = ambiguousView.declarations.find((item) => item.category === "lineage" && item.source_record_key === ambiguousSource.record_key);
  const ambiguous = inspectScopedCandidateResolution(ambiguousReceipt, {
    known_created: new Set(ambiguousView.records.map((record) => record.record_key)), future: new Set(), unknown: new Set(),
  });
  assert.deepEqual(ambiguous, { status: "ambiguous", basis: "basename_title" }, "first ambiguous tier does not fall through to alias");

  const selfView = ledger([
    source("Hidden.md", note(UID_A, "Hidden")),
    source(`${UID_A}.md`, note(UID_B, "Self", `supersedes:\n  - "${UID_A}"\n`)),
  ]).ledger;
  const selfSource = selfView.records.find((record) => record.source_uid === UID_B);
  const selfReceipt = selfView.declarations.find((item) => item.category === "lineage" && item.source_record_key === selfSource.record_key);
  assert.equal(inspectScopedCandidateResolution(selfReceipt, {
    known_created: new Set(selfView.records.map((record) => record.record_key)), future: new Set(), unknown: new Set(),
  }).status, "resolved", "visible higher-precedence UID target wins");
  assert.deepEqual(inspectScopedCandidateResolution(selfReceipt, {
    known_created: new Set([selfSource.record_key]), future: new Set(), unknown: new Set(),
  }), { status: "self", record_key: selfSource.record_key, basis: "path_without_extension_exact" });
});

test("future/unknown removal causes remain distinct and ordinary links remain evidence-only", () => {
  const view = ledger([
    source("Target.md", note(UID_A, "Target")),
    source("New.md", note(UID_B, "New", "supersedes:\n  - Target\n", "[[Missing ordinary link]]")),
  ]).ledger;
  const target = view.records.find((record) => record.source_uid === UID_A);
  const newer = view.records.find((record) => record.source_uid === UID_B);
  const lineageReceipt = view.declarations.find((item) => item.category === "lineage" && item.source_record_key === newer.record_key);
  assert.equal(inspectScopedCandidateResolution(lineageReceipt, {
    known_created: new Set([newer.record_key]), future: new Set([target.record_key]), unknown: new Set(),
  }).status, "suppressed_future");
  assert.equal(inspectScopedCandidateResolution(lineageReceipt, {
    known_created: new Set([newer.record_key]), future: new Set(), unknown: new Set([target.record_key]),
  }).status, "suppressed_unknown");
  const ordinary = view.declarations.find((item) => item.category === "link" && item.source_record_key === newer.record_key);
  assert.equal(ordinary.global_status, "unresolved");
  assert.match(ordinary.field, /^links\./u, "ordinary link receipts stay category-distinct from ratified conflicts");
});

test("hidden candidates never alter future/unknown removal causes at any tier", () => {
  const base = {
    source_record_key: "source",
    category: "lineage",
    field: "supersedes",
    origin: "authored",
    declaration_index: 0,
    raw_reference: "internal",
    global_status: "ambiguous",
    global_resolved_record_key: null,
    global_duplicate: false,
  };
  const evaluate = (tiers, future = [], unknown = []) => inspectScopedCandidateResolution({ ...base, resolution_tiers: tiers }, {
    known_created: new Set(["source"]), future: new Set(future), unknown: new Set(unknown),
  });
  const cases = [
    {
      withHidden: [{ basis: "uid_exact", candidate_record_keys: ["hidden"] }, { basis: "path_exact", candidate_record_keys: ["future"] }],
      absent: [{ basis: "uid_exact", candidate_record_keys: [] }, { basis: "path_exact", candidate_record_keys: ["future"] }],
      future: ["future"], unknown: [], expected: "suppressed_future",
    },
    {
      withHidden: [{ basis: "uid_exact", candidate_record_keys: ["unknown"] }, { basis: "path_exact", candidate_record_keys: ["hidden"] }],
      absent: [{ basis: "uid_exact", candidate_record_keys: ["unknown"] }, { basis: "path_exact", candidate_record_keys: [] }],
      future: [], unknown: ["unknown"], expected: "suppressed_unknown",
    },
    {
      withHidden: [{ basis: "uid_exact", candidate_record_keys: ["hidden", "future"] }, { basis: "path_exact", candidate_record_keys: ["unknown", "hidden-lower"] }],
      absent: [{ basis: "uid_exact", candidate_record_keys: ["future"] }, { basis: "path_exact", candidate_record_keys: ["unknown"] }],
      future: ["future"], unknown: ["unknown"], expected: "suppressed_unknown",
    },
  ];
  for (const item of cases) {
    const withHidden = evaluate(item.withHidden, item.future, item.unknown);
    const absent = evaluate(item.absent, item.future, item.unknown);
    assert.deepEqual(withHidden, absent);
    assert.equal(withHidden.status, item.expected);
  }
});

test("clean and incremental candidate ledgers converge across metadata changes and rename edge cases", () => {
  const a = source("A.md", note(UID_A, "A"), { modifiedTime: 1_700_000_000_001 });
  const b = source("B.md", note(UID_B, "B"), { modifiedTime: 1_700_000_000_002 });
  const incremental = new TrustedCanonicalCandidateIndex();
  incremental.setFiles([a]);
  const before = incremental.parseCount;
  const changed = incremental.applyChanges({ changed: [b, { ...a, modifiedTime: 1_700_000_000_003 }] }).graph;
  assert.equal(incremental.parseCount, before + 1, "new B parses; metadata-only A is rekeyed without parsing");
  const clean = ledger([{ ...a, modifiedTime: 1_700_000_000_003 }, b]).ledger;
  assert.deepEqual(stableLedger(inspectCanonicalCandidateLedger(changed)), stableLedger(clean));

  const rename = new TrustedCanonicalCandidateIndex();
  rename.setFiles([a, b]);
  assert.throws(() => rename.applyChanges({ renames: [{ from: "A.md", to: "B.md" }, { from: "A.md", to: "C.md" }] }), /GKX_INCREMENTAL_RENAME_SOURCE_DUPLICATE/u);
  const replaced = rename.applyChanges({ renames: [{ from: "A.md", to: "B.md" }] }).graph;
  assert.equal(inspectCanonicalCandidateLedger(replaced).records.length, 1, "out-of-batch rename target is replaced");
});

test("same-extension rename rebases every path-bound projection byte and extension changes require reparse", () => {
  const original = source("Folder/A.md", note(UID_A, "A"));
  const renamedSource = { ...original, relativePath: "Renamed/A.md" };
  const incremental = new TrustedCanonicalCandidateIndex();
  incremental.setFiles([original]);
  const renamed = incremental.applyChanges({ renames: [{ from: original.relativePath, to: renamedSource.relativePath }] }).graph;
  const clean = ledger([renamedSource]);
  assert.deepEqual(stableLedger(inspectCanonicalCandidateLedger(renamed)), stableLedger(clean.ledger));
  assert.deepEqual(renamed.nodes, clean.graph.nodes);
  assert.deepEqual(renamed.links, clean.graph.links);
  assert.deepEqual(renamed.gkxDiagnostics, clean.graph.gkxDiagnostics);
  assert.deepEqual(renamed.gkxAssessments, clean.graph.gkxAssessments);

  for (const [from, to] of [
    ["A.md", "A.txt"],
    ["A.md", "A.markdown"],
    ["A.markdown", "A.md"],
    ["A.md", "A.base"],
    ["A.base", "A.md"],
  ]) {
    const index = new TrustedCanonicalCandidateIndex();
    const beforeSource = source(from, note(UID_A, "A"));
    index.setFiles([beforeSource]);
    const recordsReference = index.getRecords();
    const before = {
      graph: structuredClone(index.graph),
      ledger: stableLedger(inspectCanonicalCandidateLedger(index.graph)),
      records: structuredClone([...recordsReference]),
      parseCount: index.parseCount,
    };
    assert.throws(
      () => index.applyChanges({ renames: [{ from, to }] }),
      /GKX_INCREMENTAL_RENAME_REPARSE_REQUIRED/u,
    );
    assert.strictEqual(index.getRecords(), recordsReference);
    assert.deepEqual(index.graph, before.graph);
    assert.deepEqual(stableLedger(inspectCanonicalCandidateLedger(index.graph)), before.ledger);
    assert.deepEqual([...recordsReference], before.records);
    assert.equal(index.parseCount, before.parseCount);
  }

  const reparsed = new TrustedCanonicalCandidateIndex();
  reparsed.setFiles([source("A.md", note(UID_A, "A"))]);
  assert.doesNotThrow(() => reparsed.applyChanges({
    removed: ["A.md"],
    changed: [source("A.txt", note(UID_A, "A"))],
  }));
  assert.equal(reparsed.getRecords().has("A.md"), false);
  assert.equal(reparsed.getRecords().get("A.txt")?.gkx, null);
});

test("public parseSourceFile -> assembleGraph remains compatible and buildGraph shares duplicate representatives", () => {
  const a = source("same.md", note(UID_A, "A"));
  const b = source("same.md", note(UID_B, "B"));
  assert.doesNotThrow(() => assembleGraph([parseSourceFile(a)], [], { now: 1_700_000_000_000 }));
  assert.deepEqual(
    buildGraph([a, b], [], 1_700_000_000_000).nodes,
    buildGraph([b, a], [], 1_700_000_000_000).nodes,
  );
  assert.equal(Object.hasOwn(rootApi, "assembleGraphWithCanonicalCandidates"), false);
});

test("incremental active-set rejection is transactional across every observable surface", () => {
  const index = new TrustedCanonicalCandidateIndex();
  index.setFiles([source("kept.md", "kept")]);
  const recordsReference = index.getRecords();
  const before = {
    graph: structuredClone(index.graph),
    ledger: stableLedger(inspectCanonicalCandidateLedger(index.graph)),
    records: structuredClone([...index.getRecords()]),
    parseCount: index.parseCount,
  };
  assert.throws(() => index.applyChanges({ changed: [source("invalid.md", "invalid", { size: -1 })] }), /GKX_CANONICAL_SOURCE_SIZE_INVALID/u);
  assert.deepEqual(index.graph, before.graph);
  assert.deepEqual(stableLedger(inspectCanonicalCandidateLedger(index.graph)), before.ledger);
  assert.strictEqual(index.getRecords(), recordsReference);
  assert.deepEqual([...index.getRecords()], before.records);
  assert.equal(index.parseCount, before.parseCount);
  assert.doesNotThrow(() => index.applyChanges({ changed: [source("valid.md", "different content")] }));
  assert.strictEqual(index.getRecords(), recordsReference);
  assert.equal(index.noteCount, 2, "a subsequent valid update succeeds from the pristine prior state");
  assert.equal(recordsReference.has("valid.md"), true, "the retained public Map receives successful updates");
});

test("full replacement rejection is transactional across every observable surface", () => {
  const index = new TrustedCanonicalCandidateIndex();
  index.setFiles([source("kept.md", note(UID_A, "Kept"))], ["Folder"], ["asset.png"]);
  const recordsReference = index.getRecords();
  const before = {
    graph: structuredClone(index.graph),
    ledger: stableLedger(inspectCanonicalCandidateLedger(index.graph)),
    records: structuredClone([...index.getRecords()]),
    parseCount: index.parseCount,
    folders: index.getFolders(),
    attachments: index.getAttachments(),
  };
  assert.throws(() => index.setFiles([
    source("valid.md", "valid"),
    source("invalid.md", "invalid", { size: -1 }),
  ], ["Changed"], ["other.png"]), /GKX_CANONICAL_SOURCE_SIZE_INVALID/u);
  assert.deepEqual(index.graph, before.graph);
  assert.deepEqual(stableLedger(inspectCanonicalCandidateLedger(index.graph)), before.ledger);
  assert.strictEqual(index.getRecords(), recordsReference);
  assert.deepEqual([...index.getRecords()], before.records);
  assert.equal(index.parseCount, before.parseCount);
  assert.deepEqual(index.getFolders(), before.folders);
  assert.deepEqual(index.getAttachments(), before.attachments);
  assert.doesNotThrow(() => index.setFiles([source("replacement.md", note(UID_B, "Replacement"))]));
  assert.strictEqual(index.getRecords(), recordsReference);
  assert.equal(index.noteCount, 1);
  assert.equal(recordsReference.has("replacement.md"), true, "the retained public Map receives replacement contents");
});

test("candidate receipts and scoped resolver capability are absent from ordinary public subpaths", async () => {
  for (const api of [rootApi, gkxApi, retrievalApi]) {
    for (const key of ["inspectCanonicalCandidateLedger", "inspectScopedCandidateResolution", "TrustedCanonicalCandidateIndex", "gkxCanonicalCandidateLedger", "resolveGkxScopedCandidateDeclaration"]) {
      assert.equal(Object.hasOwn(api, key), false, `${key} must remain trusted-host-only`);
    }
  }
  for (const file of ["dist/index.d.ts", "dist/gkx.d.ts", "dist/retrieval/index.d.ts"]) {
    const declaration = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(declaration, /inspectCanonicalCandidateLedger|inspectScopedCandidateResolution|gkxCanonicalCandidateLedger|resolveGkxScopedCandidateDeclaration/u);
  }
});
