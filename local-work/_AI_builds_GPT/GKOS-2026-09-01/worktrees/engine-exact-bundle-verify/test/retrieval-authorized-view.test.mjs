import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  RetrievalCoordinator,
  chunkMarkdown,
  retrievalCanonicalDigest,
} from "../dist/retrieval.mjs";
import {
  bindGkxRetrievalCandidateChunks,
  buildGkxRetrievalGeneration,
  projectGkxRetrievalCorpus,
} from "../dist/retrieval-host.mjs";

const POLICY_DIGEST = retrievalCanonicalDigest({ policy: "decision-a-public-only" });
const CONFIGURATION_DIGEST = retrievalCanonicalDigest({ projection: "decision-a-test" });
const OLD = "018f0000-0000-7000-8000-000000000801";
const NEW = "018f0000-0000-7000-8000-000000000802";

function note(uid, title, createdAt, { extra = "", body = `# ${title}\nNeedle ${title}.\n`, sensitivity = "public" } = {}) {
  return `---\ngkx_version: "2.3"\nuid: "${uid}"\ntitle: "${title}"\ntype: "policy"\ncreated_at: "${createdAt}"\nepistemic_state: "reported"\nsensitivity: "${sensitivity}"\n${extra}---\n${body}`;
}

function source(relativePath, content, createdAt) {
  return { relativePath, extension: "md", content, createdTime: Date.parse(createdAt) };
}

function resealCandidateSource(candidate) {
  const { candidate_digest: _old, ...base } = candidate;
  candidate.candidate_digest = retrievalCanonicalDigest(base);
}

function setParserFingerprint(input, fingerprint) {
  for (const candidate of input.candidate_sources) {
    candidate.parser_content_fingerprint = fingerprint;
    resealCandidateSource(candidate);
  }
}

function markCandidateUnknown(candidate, input) {
  candidate.valid_from = null;
  candidate.validity_origin = "unknown";
  candidate.reason_codes = candidate.reason_codes
    .filter((code) => !code.startsWith("VALIDITY_FROM_"))
    .concat("VALIDITY_UNKNOWN")
    .sort();
  resealCandidateSource(candidate);
  for (const chunk of input.candidate_chunks.filter((item) => item.record_key === candidate.record_key)) chunk.chunk.valid_from = null;
}

function markCandidateValidityUnknown(input, sourcePath) {
  const matches = input.candidate_sources.filter((item) => item.source_path === sourcePath);
  assert.equal(matches.length, 1);
  markCandidateUnknown(matches[0], input);
}

function markCandidateValidityUnknownByTitle(input, title) {
  const matches = input.candidate_sources.filter((item) => item.source_metadata.title === title);
  assert.equal(matches.length, 1);
  markCandidateUnknown(matches[0], input);
}

function attachVectors(input) {
  input.embedding_provider_id = "decision-a-vector";
  input.embedding_model_id = "decision-a-2d";
  input.embedding_dimensions = 2;
  input.vectors = input.candidate_chunks.map((candidate) => ({
    candidate_chunk_key: candidate.candidate_chunk_key,
    vector: [1, 0],
  }));
}

function rewriteCandidateValidityOrigin(input, title, origin) {
  const matches = input.candidate_sources.filter((item) => item.source_metadata.title === title);
  assert.equal(matches.length, 1);
  const candidate = matches[0];
  candidate.assertion_time = null;
  candidate.assertion_origin = null;
  delete candidate.source_metadata.authored_at;
  candidate.validity_origin = origin;
  candidate.reason_codes = [
    "ASSERTION_TIME_UNAVAILABLE",
    "LEDGER_BINDING_UNAVAILABLE",
    "LINEAGE_ID_UNAVAILABLE",
    origin === "source_created_time" ? "VALIDITY_FROM_SOURCE_CREATED_TIME" : "VALIDITY_FROM_SOURCE_MODIFIED_TIME",
  ].sort();
  resealCandidateSource(candidate);
  for (const chunk of input.candidate_chunks.filter((item) => item.record_key === candidate.record_key)) {
    delete chunk.chunk.metadata.authored_at;
  }
}

async function buildCorpus(files, mutate) {
  const root = await mkdtemp(join(tmpdir(), "gkos-authorized-view-"));
  const projected = projectGkxRetrievalCorpus(files);
  assert.deepEqual(projected.rejections, []);
  const candidateChunks = projected.sources.flatMap((item) => bindGkxRetrievalCandidateChunks(
    item.record_key,
    chunkMarkdown(item.chunk_input),
  ));
  const input = {
    state_directory: join(root, "state"),
    vault_id: "decision-a-vault",
    source_snapshot_digest: retrievalCanonicalDigest(files.map((file) => [file.relativePath, file.content])),
    configuration_digest: CONFIGURATION_DIGEST,
    policy_digest: POLICY_DIGEST,
    lexical_backend: "sqlite_lexical_scan",
    candidate_sources: projected.sources.map((item) => item.candidate_source),
    candidate_declarations: projected.declarations,
    candidate_chunks: candidateChunks,
    embedding_eligible_candidate_chunk_keys: candidateChunks.map((item) => item.candidate_chunk_key),
  };
  mutate?.(input);
  const generation = buildGkxRetrievalGeneration(input);
  return {
    generation,
    contents: new Map(files.map((file) => [file.relativePath, Buffer.from(file.content, "utf8")])),
  };
}

function coordinator(built, {
  sourcePolicy = (record) => record.metadata.sensitivity === "public" ? "allow" : "deny",
  chunkPolicy = (record) => record.metadata.sensitivity === "public" ? "allow" : "deny",
  counters = { source_reads: 0, vector_calls: 0, rerank_calls: 0 },
  vectorProvider,
  rerankProvider,
} = {}) {
  return {
    counters,
    service: new RetrievalCoordinator(built.generation.database_path, {
      source_discoverability_policy: sourcePolicy,
      discoverability_policy: chunkPolicy,
      runtime_policy_digest: POLICY_DIGEST,
      lineage_view_freshness: "fresh",
      source_reader: async (path) => {
        counters.source_reads++;
        const bytes = built.contents.get(path);
        if (!bytes) throw new Error("missing fixture source");
        return bytes;
      },
      ...(vectorProvider ? { vector_provider: vectorProvider } : {}),
      ...(rerankProvider ? { rerank_provider: rerankProvider } : {}),
    }),
  };
}

test("Decision-A predecessor/successor boundaries bind scoped chunks, provenance, and exact citations", async () => {
  const built = await buildCorpus([
    source("old.md", note(OLD, "Old", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z"),
    source("new.md", note(NEW, "New", "2026-08-01T00:00:00Z", { extra: `supersedes:\n  - "${OLD}"\n` }), "2026-08-01T00:00:00Z"),
  ]);
  const { service } = coordinator(built);
  const historical = await service.search({ query: "Needle", as_of: "2026-07-15T00:00Z" });
  assert.deepEqual(historical.hits.map((hit) => hit.chunk.source_id), [OLD]);
  assert.equal(historical.temporal.coverage, "sufficient");
  assert.equal(historical.hits[0].chunk.valid_to, null);
  assert.deepEqual(historical.hits[0].chunk.superseded_by, []);
  assert.deepEqual(historical.hits[0].provenance.superseded_by, []);
  assert.equal(historical.hits[0].citation.matched_spans[0].text, "Needle");

  const boundary = await service.search({ query: "Needle", as_of: "2026-08-01T00:00Z" });
  assert.deepEqual(boundary.hits.map((hit) => hit.chunk.source_id), [NEW]);
  assert.deepEqual(boundary.hits[0].chunk.supersedes, [OLD]);
  assert.deepEqual(boundary.hits[0].provenance.supersedes, [OLD]);
  assert.equal(boundary.hits[0].chunk.valid_to, boundary.hits[0].provenance.valid_to);
  assert.equal("ledger_entry_sha256" in boundary.hits[0].provenance, false);
  assert.doesNotMatch(JSON.stringify(boundary), /gkx-record|candidate_chunk_key|raw_reference/u);
  service.close();
});

async function searchFresh(built, request, options) {
  const opened = coordinator(built, options);
  try { return { result: await opened.service.search(request), counters: opened.counters }; }
  finally { opened.service.close(); }
}

test("Decision-A hidden and future successors are byte-equivalent to physical absence", async () => {
  const old = source("old.md", note(OLD, "Old", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z");
  const absent = await buildCorpus([old]);
  const hidden = await buildCorpus([
    old,
    source("hidden.md", note(NEW, "Hidden", "2026-08-01T00:00:00Z", {
      sensitivity: "secret",
      extra: `supersedes:\n  - "${OLD}"\n`,
    }), "2026-08-01T00:00:00Z"),
  ]);
  const future = await buildCorpus([
    old,
    source("future.md", note(NEW, "Future", "2026-09-01T00:00:00Z", {
      extra: `supersedes:\n  - "${OLD}"\n`,
    }), "2026-09-01T00:00:00Z"),
  ]);
  const request = { query: "Needle", as_of: "2026-08-15T00:00Z" };
  const baseline = await searchFresh(absent, request);
  const denied = await searchFresh(hidden, request);
  const notYetCreated = await searchFresh(future, request);
  assert.deepEqual(denied.result, baseline.result);
  assert.deepEqual(notYetCreated.result, baseline.result);
  assert.equal(denied.counters.source_reads, 1, "hidden source bytes are never read");
  assert.equal(notYetCreated.counters.source_reads, 1, "future source bytes are never read");
});

test("Decision-A all-visible lineage branch returns one generic conflict before live/query/rerank work", async () => {
  const third = "018f0000-0000-7000-8000-000000000803";
  const built = await buildCorpus([
    source("old.md", note(OLD, "Old", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z"),
    source("new-a.md", note(NEW, "New A", "2026-08-01T00:00:00Z", { extra: `supersedes:\n  - "${OLD}"\n` }), "2026-08-01T00:00:00Z"),
    source("new-b.md", note(third, "New B", "2026-09-01T00:00:00Z", { extra: `supersedes:\n  - "${OLD}"\n` }), "2026-09-01T00:00:00Z"),
  ]);
  const counters = { source_reads: 0, vector_calls: 0, rerank_calls: 0 };
  const vectorProvider = {
    kind: "mcp", provider_id: "query-provider", model_id: "query-2d", dimensions: 2, timeout_ms: 100,
    async embed() { counters.vector_calls++; return [Float32Array.of(1, 0)]; },
  };
  const rerankProvider = {
    kind: "mcp", provider_id: "reranker", model_id: "reranker-v1", timeout_ms: 100,
    async rerank() { counters.rerank_calls++; return []; },
  };
  const opened = coordinator(built, { counters, vectorProvider, rerankProvider });
  await assert.rejects(
    opened.service.search({ query: "Needle", as_of: "2026-10-01T00:00Z" }),
    (error) => error instanceof Error && error.message === "RETRIEVAL_AUTHORIZED_VIEW_CONFLICT",
  );
  assert.deepEqual(counters, { source_reads: 0, vector_calls: 0, rerank_calls: 0 });
  opened.service.close();
});

async function assertGenericConflict(built, asOf = "2026-10-01T00:00Z") {
  const counters = { source_reads: 0, vector_calls: 0, rerank_calls: 0 };
  const opened = coordinator(built, {
    counters,
    vectorProvider: {
      kind: "mcp", provider_id: "zero-work-vector", model_id: "zero-work-2d", dimensions: 2, timeout_ms: 100,
      async embed() { counters.vector_calls++; return [Float32Array.of(1, 0)]; },
    },
    rerankProvider: {
      kind: "mcp", provider_id: "zero-work-rerank", model_id: "zero-work-rerank-v1", timeout_ms: 100,
      async rerank() { counters.rerank_calls++; return []; },
    },
  });
  await assert.rejects(
    opened.service.search({ query: "Needle", as_of: asOf }),
    (error) => error instanceof Error && error.message === "RETRIEVAL_AUTHORIZED_VIEW_CONFLICT",
  );
  assert.deepEqual(counters, { source_reads: 0, vector_calls: 0, rerank_calls: 0 });
  opened.service.close();
}

test("Decision-A all-visible identity, endpoint, declaration, and topology classes share one conflict", async (t) => {
  const third = "018f0000-0000-7000-8000-000000000803";
  const fourth = "018f0000-0000-7000-8000-000000000804";
  const cases = [
    ["identity", [
      source("identity-a.md", note(OLD, "Identity A", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z"),
      source("identity-b.md", note(OLD, "Identity B", "2026-08-01T00:00:00Z"), "2026-08-01T00:00:00Z"),
    ]],
    ["endpoint-resolution", [
      source("one/Target.md", note(OLD, "Target", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z"),
      source("two/Target.md", note(third, "Target", "2026-07-02T00:00:00Z"), "2026-07-02T00:00:00Z"),
      source("new.md", note(NEW, "New", "2026-08-01T00:00:00Z", { extra: "supersedes:\n  - \"Target\"\n" }), "2026-08-01T00:00:00Z"),
    ]],
    ["declaration-self", [
      source("self.md", note(OLD, "Self", "2026-07-01T00:00:00Z", { extra: `supersedes:\n  - "${OLD}"\n` }), "2026-07-01T00:00:00Z"),
    ]],
    ["topology-cycle", [
      source("a.md", note(OLD, "A", "2026-07-01T00:00:00Z", { extra: `supersedes:\n  - "${NEW}"\n` }), "2026-07-01T00:00:00Z"),
      source("b.md", note(NEW, "B", "2026-08-01T00:00:00Z", { extra: `supersedes:\n  - "${OLD}"\n` }), "2026-08-01T00:00:00Z"),
    ]],
    ["topology-order", [
      source("older.md", note(OLD, "Older", "2026-08-01T00:00:00Z"), "2026-08-01T00:00:00Z"),
      source("earlier-successor.md", note(fourth, "Earlier", "2026-07-01T00:00:00Z", { extra: `supersedes:\n  - "${OLD}"\n` }), "2026-07-01T00:00:00Z"),
    ]],
  ];
  for (const [name, files] of cases) {
    await t.test(name, async () => assertGenericConflict(await buildCorpus(files)));
  }
});

test("Decision-A governed unresolved relationships conflict while ordinary broken links remain non-conflicting", async () => {
  const governed = await buildCorpus([
    source("governed.md", note(OLD, "Governed", "2026-07-01T00:00:00Z", {
      extra: "relationships:\n  supports:\n    - target: \"Missing\"\n      origin: \"authored\"\n",
    }), "2026-07-01T00:00:00Z"),
  ]);
  await assertGenericConflict(governed);

  const ordinary = await buildCorpus([
    source("ordinary.md", note(OLD, "Ordinary", "2026-07-01T00:00:00Z", {
      body: "# Ordinary\nNeedle ordinary [[Missing]].\n",
    }), "2026-07-01T00:00:00Z"),
  ]);
  const searched = await searchFresh(ordinary, { query: "Needle", as_of: "2026-07-15T00:00Z" });
  assert.deepEqual(searched.result.hits.map((hit) => hit.chunk.source_id), [OLD]);
});

test("Decision-A hidden/future candidates equal absence across all four cross-record classes", async (t) => {
  const third = "018f0000-0000-7000-8000-000000000803";
  const fourth = "018f0000-0000-7000-8000-000000000804";
  const fifth = "018f0000-0000-7000-8000-000000000805";
  const request = { query: "Needle", as_of: "2026-08-15T00:00Z" };
  const cases = [
    {
      name: "identity",
      base: [source("identity.md", note(OLD, "Identity", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z")],
      hidden: source("hidden-identity.md", note(OLD, "Hidden Identity", "2026-07-02T00:00:00Z", { sensitivity: "secret" }), "2026-07-02T00:00:00Z"),
      future: source("future-identity.md", note(OLD, "Future Identity", "2026-09-01T00:00:00Z"), "2026-09-01T00:00:00Z"),
    },
    {
      name: "endpoint-resolution",
      base: [
        source("one/Target.md", note(OLD, "Target", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z"),
        source("new.md", note(NEW, "New", "2026-08-01T00:00:00Z", { extra: "supersedes:\n  - \"Target\"\n" }), "2026-08-01T00:00:00Z"),
      ],
      hidden: source("two/Target.md", note(third, "Target", "2026-07-02T00:00:00Z", { sensitivity: "secret" }), "2026-07-02T00:00:00Z"),
      future: source("two/Target.md", note(third, "Target", "2026-09-01T00:00:00Z"), "2026-09-01T00:00:00Z"),
    },
    {
      name: "declaration-reconciliation",
      base: [source("declaration.md", note(OLD, "Declaration", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z")],
      hidden: source("hidden-declaration.md", note(fourth, "Hidden Declaration", "2026-07-02T00:00:00Z", {
        sensitivity: "secret", extra: `superseded_by:\n  - "${OLD}"\n`,
      }), "2026-07-02T00:00:00Z"),
      future: source("future-declaration.md", note(fourth, "Future Declaration", "2026-09-01T00:00:00Z", {
        extra: `superseded_by:\n  - "${OLD}"\n`,
      }), "2026-09-01T00:00:00Z"),
    },
    {
      name: "topology",
      base: [
        source("old.md", note(OLD, "Old", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z"),
        source("new.md", note(NEW, "New", "2026-08-01T00:00:00Z", { extra: `supersedes:\n  - "${OLD}"\n` }), "2026-08-01T00:00:00Z"),
      ],
      hidden: source("hidden-branch.md", note(fifth, "Hidden Branch", "2026-08-02T00:00:00Z", {
        sensitivity: "secret", extra: `supersedes:\n  - "${OLD}"\n`,
      }), "2026-08-02T00:00:00Z"),
      future: source("future-branch.md", note(fifth, "Future Branch", "2026-09-01T00:00:00Z", {
        extra: `supersedes:\n  - "${OLD}"\n`,
      }), "2026-09-01T00:00:00Z"),
    },
  ];
  for (const fixture of cases) {
    await t.test(fixture.name, async () => {
      const absent = await searchFresh(await buildCorpus(fixture.base), request);
      const hidden = await searchFresh(await buildCorpus([...fixture.base, fixture.hidden]), request);
      const future = await searchFresh(await buildCorpus([...fixture.base, fixture.future]), request);
      assert.deepEqual(hidden.result, absent.result);
      assert.deepEqual(future.result, absent.result);
      assert.equal(hidden.counters.source_reads, absent.counters.source_reads);
      assert.equal(future.counters.source_reads, absent.counters.source_reads);
    });
  }
});

test("Decision-A resolver falls through hidden/future preferred UID tiers and classifies scoped self", async () => {
  const preferredUid = "018f0000-0000-7000-8000-000000000806";
  const target = source(`${preferredUid}.md`, note(OLD, "Visible Target", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z");
  const successor = source("successor.md", note(NEW, "Successor", "2026-08-01T00:00:00Z", {
    extra: `supersedes:\n  - "${preferredUid}"\n`,
  }), "2026-08-01T00:00:00Z");
  const request = { query: "Needle", as_of: "2026-08-15T00:00Z" };
  const absent = await searchFresh(await buildCorpus([target, successor]), request);
  const hidden = await searchFresh(await buildCorpus([
    target,
    successor,
    source("hidden-preferred.md", note(preferredUid, "Hidden Preferred", "2026-07-02T00:00:00Z", { sensitivity: "secret" }), "2026-07-02T00:00:00Z"),
  ]), request);
  const future = await searchFresh(await buildCorpus([
    target,
    successor,
    source("future-preferred.md", note(preferredUid, "Future Preferred", "2026-09-01T00:00:00Z"), "2026-09-01T00:00:00Z"),
  ]), request);
  assert.deepEqual(hidden.result, absent.result);
  assert.deepEqual(future.result, absent.result);
  assert.deepEqual(absent.result.hits[0].provenance.supersedes, [OLD]);

  const self = source(`${preferredUid}.md`, note(OLD, "Scoped Self", "2026-07-01T00:00:00Z", {
    extra: `supersedes:\n  - "${preferredUid}"\n`,
  }), "2026-07-01T00:00:00Z");
  await assertGenericConflict(await buildCorpus([self]), "2026-08-15T00:00Z");
  await assertGenericConflict(await buildCorpus([
    self,
    source("hidden-preferred.md", note(preferredUid, "Hidden Preferred", "2026-07-02T00:00:00Z", { sensitivity: "secret" }), "2026-07-02T00:00:00Z"),
  ]), "2026-08-15T00:00Z");
  await assertGenericConflict(await buildCorpus([
    self,
    source("future-preferred.md", note(preferredUid, "Future Preferred", "2026-09-01T00:00:00Z"), "2026-09-01T00:00:00Z"),
  ]), "2026-08-15T00:00Z");
});

test("Decision-A scoped parser-fingerprint collisions ignore hidden/future rows", async () => {
  const third = "018f0000-0000-7000-8000-000000000803";
  const baseFiles = [source("visible.md", note(OLD, "Visible", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z")];
  const request = { query: "Needle", as_of: "2026-08-15T00:00Z" };
  const baseline = await searchFresh(await buildCorpus(baseFiles, (input) => setParserFingerprint(input, "same:fingerprint")), request);
  const hidden = await searchFresh(await buildCorpus([
    ...baseFiles,
    source("hidden.md", note(third, "Hidden", "2026-07-02T00:00:00Z", { sensitivity: "secret", body: "# Hidden\nNeedle different.\n" }), "2026-07-02T00:00:00Z"),
  ], (input) => setParserFingerprint(input, "same:fingerprint")), request);
  const future = await searchFresh(await buildCorpus([
    ...baseFiles,
    source("future.md", note(third, "Future", "2026-09-01T00:00:00Z", { body: "# Future\nNeedle different.\n" }), "2026-09-01T00:00:00Z"),
  ], (input) => setParserFingerprint(input, "same:fingerprint")), request);
  assert.deepEqual(hidden.result, baseline.result);
  assert.deepEqual(future.result, baseline.result);
  await assertGenericConflict(await buildCorpus([
    ...baseFiles,
    source("visible-two.md", note(third, "Visible Two", "2026-07-02T00:00:00Z", { body: "# Visible Two\nNeedle different.\n" }), "2026-07-02T00:00:00Z"),
  ], (input) => setParserFingerprint(input, "same:fingerprint")), "2026-08-15T00:00Z");

});

test("Decision-A public chunk collisions remain physical candidates and conflict only in the scoped view", async () => {
  const exact = note(OLD, "Duplicate", "2026-07-01T00:00:00Z");
  const baselineFiles = [source("visible.md", exact, "2026-07-01T00:00:00Z")];
  const hiddenDuplicate = source("hidden.md", exact.replace('sensitivity: "public"', 'sensitivity: "secret"'), "2026-07-01T00:00:00Z");
  const exactDuplicate = source("second-visible.md", exact, "2026-07-01T00:00:00Z");
  const request = { query: "Needle", as_of: "2026-08-15T00:00Z" };

  const baseline = await searchFresh(await buildCorpus(baselineFiles), request);
  const hidden = await searchFresh(await buildCorpus([...baselineFiles, hiddenDuplicate]), request);
  assert.deepEqual(hidden.result, baseline.result);

  const allVisible = await buildCorpus([...baselineFiles, exactDuplicate]);
  assert.equal(allVisible.generation.manifest.candidate_chunk_count, 2);
  await assertGenericConflict(allVisible, "2026-08-15T00:00Z");
});

test("Decision-A duplicate portable paths are scoped after policy/time partition", async () => {
  const third = "018f0000-0000-7000-8000-000000000803";
  const visible = source("same.md", note(OLD, "Visible", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z");
  const hidden = source("same.md", note(NEW, "Hidden", "2026-07-02T00:00:00Z", {
    sensitivity: "secret",
    body: "# Hidden\nNeedle hidden path candidate.\n",
  }), "2026-07-02T00:00:00Z");
  const future = source("same.md", note(NEW, "Future", "2026-09-01T00:00:00Z", {
    body: "# Future\nNeedle future path candidate.\n",
  }), "2026-09-01T00:00:00Z");
  const request = { query: "Needle", as_of: "2026-08-15T00:00Z" };
  // The visible candidate is last so this synthetic trusted-host fixture's
  // path reader returns the exact currently visible bytes for the shared path.
  const baseline = await searchFresh(await buildCorpus([visible]), request);
  const denied = await searchFresh(await buildCorpus([hidden, visible]), request);
  const notYetCreated = await searchFresh(await buildCorpus([future, visible]), request);
  assert.deepEqual(denied.result, baseline.result);
  assert.deepEqual(notYetCreated.result, baseline.result);
  assert.equal(denied.counters.source_reads, baseline.counters.source_reads);
  assert.equal(notYetCreated.counters.source_reads, baseline.counters.source_reads);

  await assertGenericConflict(await buildCorpus([
    source("same.md", note(third, "Other Visible", "2026-07-02T00:00:00Z"), "2026-07-02T00:00:00Z"),
    visible,
  ]), "2026-08-15T00:00Z");
});

test("Decision-A known-created conflict wins over unknown temporal coverage with zero work", async () => {
  const third = "018f0000-0000-7000-8000-000000000803";
  const unknown = "018f0000-0000-7000-8000-000000000804";
  const files = [
    source("old.md", note(OLD, "Old", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z"),
    source("new-a.md", note(NEW, "New A", "2026-08-01T00:00:00Z", { extra: `supersedes:\n  - "${OLD}"\n` }), "2026-08-01T00:00:00Z"),
    source("new-b.md", note(third, "New B", "2026-08-02T00:00:00Z", { extra: `supersedes:\n  - "${OLD}"\n` }), "2026-08-02T00:00:00Z"),
    source("unknown.md", note(unknown, "Unknown", "2026-07-03T00:00:00Z"), "2026-07-03T00:00:00Z"),
  ];
  const built = await buildCorpus(files, (input) => markCandidateValidityUnknown(input, "unknown.md"));
  await assertGenericConflict(built, "2026-08-15T00:00Z");

  const coverage = await buildCorpus([files[0], files[3]], (input) => markCandidateValidityUnknown(input, "unknown.md"));
  const counters = { source_reads: 0, vector_calls: 0, rerank_calls: 0 };
  const opened = coordinator(coverage, { counters });
  const result = await opened.service.search({ query: "Needle", as_of: "2026-08-15T00:00Z" });
  assert.equal(result.temporal.coverage, "insufficient");
  assert.deepEqual(result.temporal.reason_codes, ["TEMPORAL_COVERAGE_INSUFFICIENT"]);
  assert.equal(result.hits.length, 0);
  assert.deepEqual(counters, { source_reads: 0, vector_calls: 0, rerank_calls: 0 });
  opened.service.close();
});

test("Decision-A candidate-key SQL gates vector/rerank inputs before host scoring", async () => {
  const visible = source("visible.md", note(OLD, "Visible", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z");
  const hidden = source("hidden.md", note(NEW, "Hidden", "2026-07-02T00:00:00Z", {
    sensitivity: "secret",
    body: "# Hidden\nNeedle hidden sentinel must not reach query stages.\n",
  }), "2026-07-02T00:00:00Z");
  const baseline = await buildCorpus([visible], attachVectors);
  const withHidden = await buildCorpus([visible, hidden], attachVectors);
  const request = { query: "Needle", as_of: "2026-08-15T00:00Z" };

  async function run(built) {
    const seen = { source_reads: 0, vector_calls: 0, rerank_calls: 0, rerank_texts: [] };
    return searchFresh(built, request, {
      counters: seen,
      vectorProvider: {
        kind: "mcp", provider_id: "decision-a-vector", model_id: "decision-a-2d", dimensions: 2, timeout_ms: 100,
        async embed(texts) {
          seen.vector_calls++;
          assert.deepEqual(texts, ["Needle"]);
          return [Float32Array.of(1, 0)];
        },
      },
      rerankProvider: {
        kind: "mcp", provider_id: "decision-a-rerank", model_id: "decision-a-rerank-v1", timeout_ms: 100,
        async rerank(_query, candidates) {
          seen.rerank_calls++;
          seen.rerank_texts.push(...candidates.map((candidate) => candidate.text));
          return candidates.map((candidate, index) => ({ chunk_id: candidate.chunk_id, score: 1 - index / 10 }));
        },
      },
    });
  }

  const absent = await run(baseline);
  const denied = await run(withHidden);
  assert.deepEqual(denied.result, absent.result);
  assert.deepEqual(denied.counters, absent.counters);
  assert.equal(denied.counters.vector_calls, 1);
  assert.equal(denied.counters.rerank_calls, 1);
  assert.equal(denied.counters.rerank_texts.some((text) => text.includes("hidden sentinel")), false);
});

test("Decision-A gate order is source policy, typed filters, then whole-source chunk policy", async () => {
  const visible = source("visible.md", note(OLD, "Visible", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z");
  const filtered = source("filtered.md", note(NEW, "Filtered", "2026-07-02T00:00:00Z"), "2026-07-02T00:00:00Z");
  const built = await buildCorpus([visible, filtered]);
  const calls = [];
  const result = await searchFresh(built, {
    query: "Needle",
    as_of: "2026-08-15T00:00Z",
    filters: { path_include: ["visible.md"] },
  }, {
    sourcePolicy(record) {
      calls.push(`source:${record.source_path}`);
      assert.equal(Object.isFrozen(record), true);
      assert.equal(Object.isFrozen(record.metadata), true);
      assert.equal("record_key" in record, false);
      assert.equal(record.valid_to, null);
      assert.deepEqual(record.supersedes, []);
      assert.deepEqual(record.superseded_by, []);
      return "allow";
    },
    chunkPolicy(record) {
      calls.push(`chunk:${record.source_path}`);
      assert.equal(Object.isFrozen(record), true);
      assert.equal(Object.isFrozen(record.metadata), true);
      assert.equal(record.valid_to, null);
      assert.deepEqual(record.supersedes, []);
      assert.deepEqual(record.superseded_by, []);
      return "allow";
    },
  });
  assert.deepEqual(calls.sort(), ["chunk:visible.md", "source:filtered.md", "source:visible.md"]);
  assert.deepEqual(result.result.hits.map((hit) => hit.chunk.source_id), [OLD]);

  const sectioned = source("sectioned.md", note(OLD, "Sectioned", "2026-07-01T00:00:00Z", {
    body: "# Allowed\nNeedle allowed.\n\n# Denied\nNeedle denied section.\n",
  }), "2026-07-01T00:00:00Z");
  const denied = await searchFresh(await buildCorpus([sectioned]), {
    query: "Needle", as_of: "2026-08-15T00:00Z",
  }, {
    chunkPolicy: (record) => record.text.includes("denied section") ? "deny" : "allow",
  });
  const absent = await searchFresh(await buildCorpus([]), {
    query: "Needle", as_of: "2026-08-15T00:00Z",
  });
  assert.deepEqual(denied.result, absent.result);
  assert.equal(denied.counters.source_reads, 0);
});

test("schema-3 runtime policy identity fails before policy, live-source, or query-provider work", async () => {
  const built = await buildCorpus([
    source("visible.md", note(OLD, "Visible", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z"),
  ], attachVectors);
  const counters = { policy: 0, source_reads: 0, vector_calls: 0 };
  assert.throws(() => new RetrievalCoordinator(built.generation.database_path, {
    source_discoverability_policy() { counters.policy++; return "allow"; },
    discoverability_policy() { counters.policy++; return "allow"; },
    runtime_policy_digest: retrievalCanonicalDigest({ policy: "wrong" }),
    lineage_view_freshness: "fresh",
    source_reader: async () => { counters.source_reads++; return Buffer.alloc(0); },
    vector_provider: {
      kind: "mcp", provider_id: "decision-a-vector", model_id: "decision-a-2d", dimensions: 2, timeout_ms: 100,
      async embed() { counters.vector_calls++; return [Float32Array.of(1, 0)]; },
    },
  }), /RETRIEVAL_RUNTIME_POLICY_DIGEST_MISMATCH/u);
  assert.deepEqual(counters, { policy: 0, source_reads: 0, vector_calls: 0 });
});

test("schema-3 policy-bound vector eligibility mismatch fails before live/query work", async () => {
  const built = await buildCorpus([
    source("visible.md", note(OLD, "Visible", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z"),
  ], (input) => {
    attachVectors(input);
    input.embedding_eligible_candidate_chunk_keys = [];
    input.vectors = [];
  });
  const counters = { source_reads: 0, vector_calls: 0, rerank_calls: 0 };
  const opened = coordinator(built, {
    counters,
    vectorProvider: {
      kind: "mcp", provider_id: "decision-a-vector", model_id: "decision-a-2d", dimensions: 2, timeout_ms: 100,
      async embed() { counters.vector_calls++; return [Float32Array.of(1, 0)]; },
    },
  });
  await assert.rejects(
    opened.service.search({ query: "Needle", as_of: "2026-08-15T00:00Z" }),
    /RETRIEVAL_RUNTIME_VECTOR_ELIGIBILITY_MISMATCH/u,
  );
  assert.deepEqual(counters, { source_reads: 0, vector_calls: 0, rerank_calls: 0 });
  opened.service.close();
});

test("Decision-A zero-chunk successors participate in scoped time without fabricating hits", async () => {
  const old = source("old.md", note(OLD, "Old", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z");
  const blankSuccessor = source("blank.md", note(NEW, "Blank", "2026-08-01T00:00:00Z", {
    extra: `supersedes:\n  - "${OLD}"\n`,
    body: "",
  }), "2026-08-01T00:00:00Z");
  const built = await buildCorpus([old, blankSuccessor]);
  assert.equal(built.generation.manifest.candidate_source_count, 2);
  assert.equal(built.generation.manifest.represented_candidate_source_count, 1);
  assert.equal(built.generation.manifest.candidate_chunk_count, 1);

  const before = await searchFresh(built, { query: "Needle", as_of: "2026-07-15T00:00Z" });
  assert.deepEqual(before.result.hits.map((hit) => hit.chunk.source_id), [OLD]);
  const boundary = await searchFresh(built, { query: "Needle", as_of: "2026-08-01T00:00Z" });
  assert.equal(boundary.result.temporal.coverage, "sufficient");
  assert.equal(boundary.result.hits.length, 0);
  assert.equal(boundary.result.eligible_result_count, 0);
  assert.equal(boundary.counters.source_reads, 0);

  const absent = await searchFresh(await buildCorpus([old]), { query: "Needle", as_of: "2026-07-15T00:00Z" });
  const hidden = await searchFresh(await buildCorpus([
    old,
    source("hidden-blank.md", note(NEW, "Hidden Blank", "2026-08-01T00:00:00Z", {
      sensitivity: "secret",
      extra: `supersedes:\n  - "${OLD}"\n`,
      body: "",
    }), "2026-08-01T00:00:00Z"),
  ]), { query: "Needle", as_of: "2026-07-15T00:00Z" });
  assert.deepEqual(hidden.result, absent.result);
});

test("Decision-A source/chunk policy throws and non-allow values fail closed as physical absence", async () => {
  const old = source("old.md", note(OLD, "Old", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z");
  const successor = source("successor.md", note(NEW, "Successor", "2026-08-01T00:00:00Z", {
    extra: `supersedes:\n  - "${OLD}"\n`,
  }), "2026-08-01T00:00:00Z");
  const request = { query: "Needle", as_of: "2026-08-15T00:00Z" };
  const absent = await searchFresh(await buildCorpus([old]), request);
  const built = await buildCorpus([old, successor]);
  const sourceThrow = await searchFresh(built, request, {
    sourcePolicy(record) {
      if (record.source_path === "successor.md") throw new Error("private policy failure");
      return "allow";
    },
  });
  const chunkIndeterminate = await searchFresh(built, request, {
    chunkPolicy(record) {
      return record.source_path === "successor.md" ? "indeterminate" : "allow";
    },
  });
  assert.deepEqual(sourceThrow.result, absent.result);
  assert.deepEqual(chunkIndeterminate.result, absent.result);
  assert.equal(sourceThrow.counters.source_reads, absent.counters.source_reads);
  assert.equal(chunkIndeterminate.counters.source_reads, absent.counters.source_reads);
});

test("Decision-A unknown candidates cannot create any cross-record conflict class", async (t) => {
  const third = "018f0000-0000-7000-8000-000000000803";
  const fourth = "018f0000-0000-7000-8000-000000000804";
  const cases = [
    ["identity", [
      source("visible.md", note(OLD, "Visible", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z"),
      source("unknown.md", note(OLD, "Unknown Duplicate", "2026-07-02T00:00:00Z"), "2026-07-02T00:00:00Z"),
    ]],
    ["endpoint-resolution", [
      source("one/Target.md", note(OLD, "Target", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z"),
      source("new.md", note(NEW, "New", "2026-08-01T00:00:00Z", { extra: "supersedes:\n  - \"Target\"\n" }), "2026-08-01T00:00:00Z"),
      source("unknown.md", note(third, "Target", "2026-07-02T00:00:00Z"), "2026-07-02T00:00:00Z"),
    ]],
    ["declaration-reconciliation", [
      source("visible.md", note(OLD, "Visible", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z"),
      source("unknown.md", note(third, "Unknown Declaration", "2026-07-02T00:00:00Z", {
        extra: `superseded_by:\n  - "${OLD}"\n`,
      }), "2026-07-02T00:00:00Z"),
    ]],
    ["topology", [
      source("old.md", note(OLD, "Old", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z"),
      source("new.md", note(NEW, "New", "2026-08-01T00:00:00Z", { extra: `supersedes:\n  - "${OLD}"\n` }), "2026-08-01T00:00:00Z"),
      source("unknown.md", note(fourth, "Unknown Branch", "2026-07-02T00:00:00Z", { extra: `supersedes:\n  - "${OLD}"\n` }), "2026-07-02T00:00:00Z"),
    ]],
  ];
  for (const [name, files] of cases) {
    await t.test(name, async () => {
      const built = await buildCorpus(files, (input) => markCandidateValidityUnknown(input, "unknown.md"));
      const counters = { source_reads: 0, vector_calls: 0, rerank_calls: 0 };
      const opened = coordinator(built, {
        counters,
        vectorProvider: {
          kind: "mcp", provider_id: "unknown-vector", model_id: "unknown-2d", dimensions: 2, timeout_ms: 100,
          async embed() { counters.vector_calls++; return [Float32Array.of(1, 0)]; },
        },
        rerankProvider: {
          kind: "mcp", provider_id: "unknown-rerank", model_id: "unknown-rerank-v1", timeout_ms: 100,
          async rerank() { counters.rerank_calls++; return []; },
        },
      });
      const result = await opened.service.search({ query: "Needle", as_of: "2026-08-15T00:00Z" });
      assert.equal(result.temporal.coverage, "insufficient");
      assert.deepEqual(result.temporal.reason_codes, ["TEMPORAL_COVERAGE_INSUFFICIENT"]);
      assert.equal(result.hits.length, 0);
      assert.deepEqual(counters, { source_reads: 0, vector_calls: 0, rerank_calls: 0 });
      opened.service.close();
    });
  }
});

test("Decision-A unknown duplicate UID/path rows remain only a coverage bit in the complete envelope", async () => {
  const third = "018f0000-0000-7000-8000-000000000803";
  const fourth = "018f0000-0000-7000-8000-000000000804";
  const fifth = "018f0000-0000-7000-8000-000000000805";
  const visible = source("visible.md", note(OLD, "Visible", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z");
  const coverage = source("coverage.md", note(third, "Coverage Unknown", "2026-07-02T00:00:00Z"), "2026-07-02T00:00:00Z");
  const request = { query: "Needle", as_of: "2026-08-15T00:00Z" };
  async function built(files, unknownTitles) {
    return buildCorpus(files, (input) => {
      for (const title of unknownTitles) markCandidateValidityUnknownByTitle(input, title);
    });
  }
  const baseline = await searchFresh(await built([visible, coverage], ["Coverage Unknown"]), request);
  const duplicateUid = await searchFresh(await built([
    visible,
    coverage,
    source("duplicate-uid.md", note(OLD, "Unknown Duplicate UID", "2026-07-03T00:00:00Z"), "2026-07-03T00:00:00Z"),
  ], ["Coverage Unknown", "Unknown Duplicate UID"]), request);
  const duplicatePath = await searchFresh(await built([
    visible,
    coverage,
    source("visible.md", note(fourth, "Unknown Duplicate Path", "2026-07-03T00:00:00Z"), "2026-07-03T00:00:00Z"),
  ], ["Coverage Unknown", "Unknown Duplicate Path"]), request);
  const uniqueUnknown = await searchFresh(await built([
    visible,
    coverage,
    source("unique-unknown.md", note(fifth, "Unique Unknown", "2026-07-03T00:00:00Z"), "2026-07-03T00:00:00Z"),
  ], ["Coverage Unknown", "Unique Unknown"]), request);
  assert.equal(baseline.result.temporal.coverage, "insufficient");
  assert.deepEqual(duplicateUid.result, baseline.result);
  assert.deepEqual(duplicatePath.result, baseline.result);
  assert.deepEqual(uniqueUnknown.result, baseline.result);
  assert.equal(baseline.counters.source_reads, 0);
  assert.equal(duplicateUid.counters.source_reads, 0);
  assert.equal(duplicatePath.counters.source_reads, 0);
  assert.equal(uniqueUnknown.counters.source_reads, 0);
});

test("Decision-A scoped coordinate binds safe validity provenance while hidden/future origins do not interfere", async () => {
  const fallback = source("fallback.md", note(OLD, "Fallback", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z");
  const request = { query: "Needle", as_of: "2026-08-15T00:00Z" };
  const createdResult = await searchFresh(await buildCorpus([fallback], (input) => {
    rewriteCandidateValidityOrigin(input, "Fallback", "source_created_time");
  }), request);
  const modifiedResult = await searchFresh(await buildCorpus([fallback], (input) => {
    rewriteCandidateValidityOrigin(input, "Fallback", "source_modified_time");
  }), request);
  assert.equal(createdResult.result.hits[0].provenance.validity_origin, "source_created_time");
  assert.equal(modifiedResult.result.hits[0].provenance.validity_origin, "source_modified_time");
  assert.equal(createdResult.result.hits[0].provenance.valid_from, modifiedResult.result.hits[0].provenance.valid_from);
  assert.notEqual(createdResult.result.projection_id, modifiedResult.result.projection_id);
  assert.notEqual(createdResult.result.projection_digest, modifiedResult.result.projection_digest);

  const visible = source("visible.md", note(NEW, "Visible", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z");
  const hidden = source("hidden.md", note("018f0000-0000-7000-8000-000000000803", "Hidden", "2026-07-01T00:00:00Z", {
    sensitivity: "secret",
  }), "2026-07-01T00:00:00Z");
  const hiddenA = await searchFresh(await buildCorpus([visible, hidden], (input) => {
    rewriteCandidateValidityOrigin(input, "Hidden", "source_created_time");
  }), request);
  const hiddenB = await searchFresh(await buildCorpus([visible, hidden], (input) => {
    rewriteCandidateValidityOrigin(input, "Hidden", "source_modified_time");
  }), request);
  assert.deepEqual(hiddenB.result, hiddenA.result);

  const future = source("future.md", note("018f0000-0000-7000-8000-000000000804", "Future", "2026-09-01T00:00:00Z"), "2026-09-01T00:00:00Z");
  const futureA = await searchFresh(await buildCorpus([visible, future], (input) => {
    rewriteCandidateValidityOrigin(input, "Future", "source_created_time");
  }), request);
  const futureB = await searchFresh(await buildCorpus([visible, future], (input) => {
    rewriteCandidateValidityOrigin(input, "Future", "source_modified_time");
  }), request);
  assert.deepEqual(futureB.result, futureA.result);
});
