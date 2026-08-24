import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const graphitiBundle = await esbuild.build({
  entryPoints: [resolve(root, "src/graphiti.ts")], bundle: true, write: false, format: "esm", platform: "node",
  target: "es2020", minify: false, sourcemap: false, logLevel: "silent",
});
const { buildGraphitiEpisodes: buildProductionGraphitiEpisodes } = await import(
  `data:text/javascript;base64,${Buffer.from(graphitiBundle.outputFiles[0].text).toString("base64")}`
);
const pack = resolve(root, "contracts/watcher/gkos-watcher-recovery-1.0.0-draft.1");
const PACK_VERSION = "gkos-watcher-recovery/1.0.0-draft.1";
const SCHEMA_ROOT = "https://gkos.example/contracts/watcher/gkos-watcher-recovery-1.0.0-draft.1/";
const PACK_FILE_NAMES = Object.freeze([
  "README.md", "TECHNICAL_README.md", "authority.schema.json", "batch.schema.json", "coherent-manifest.schema.json",
  "conformance.schema.json", "journal.schema.json", "sample-plan.schema.json", "source-removal.schema.json", "status.schema.json",
  "topology.schema.json", "transition.schema.json", "watcher-cli-fixture.json", "watcher-conformance-fixture.json",
  "watcher-recovery-fixture.json", "watcher-sample-plan.json", "watcher-storage-fixture.json",
]);
const SAMPLE_PLAN_DIGEST = "sha256:75b011dc253a445ec9c5fc192f600f57ec62411e8125dfa20c74a08f5faf301b";
const SAMPLE_PLAN_BASE64 = "eyJjb250cmFjdF92ZXJzaW9uIjoiZ2tvcy13YXRjaGVyLWNvbnZlcmdlbmNlLXNhbXBsZS1wbGFuLzEuMC4wLWRyYWZ0LjEiLCJleGVjdXRpb24iOnsiYXNfb2YiOiIyMDI2LTA4LTIwVDAwOjAwOjAwWiIsImV4dGVybmFsX3JlYWRlciI6ImdreF9zZWFyY2hfb3V0ZXJfY29oZXJlbnRfYXV0aG9yaXR5IiwibGltaXQiOjUsIm1lYXN1cmVkX2N5Y2xlX2NvdW50IjoxMCwibXV0YXRpb25fb3JkZXIiOlsiYWxwaGFfdG9fb21lZ2EiLCJvbWVnYV90b19hbHBoYSJdLCJzYW1wbGVfY291bnQiOjIwLCJzZWFyY2hlcyI6W3siZXhwZWN0ZWRfc291cmNlX2lkIjoiMDE5YjJkMTQtNDIzMC03ZGI3LTg3ZDQtN2Q4MWNmYWVjOTMyIiwibXV0YXRpb24iOiJhbHBoYV90b19vbWVnYSIsInF1ZXJ5IjoicGhhc2VmaXZlb21lZ2EifSx7ImV4cGVjdGVkX3NvdXJjZV9pZCI6IjAxOWIyZDE0LTQyMzAtN2RiNy04N2Q0LTdkODFjZmFlYzkzMiIsIm11dGF0aW9uIjoib21lZ2FfdG9fYWxwaGEiLCJxdWVyeSI6InBoYXNlZml2ZWFscGhhIn1dLCJ3YXJtdXBfY3ljbGVfY291bnQiOjEsIndhcm11cF9zYW1wbGVfY291bnQiOjIsIndyaXRlcl9vcGVyYXRpb24iOiJwaGFzZTNfc2FtZV9wYXJlbnRfMDYwMF90ZW1wX2ZzeW5jX2F0b21pY19yZXBsYWNlX3Bvc3RyZXBsYWNlX2ZpbGVfZnN5bmNfcGxhdGZvcm1fcGFyZW50X3N5bmMifSwiZml4dHVyZSI6eyJhbHBoYSI6eyJieXRlX3NpemUiOjQ5OSwic291cmNlX2J5dGVzX2Jhc2U2NCI6IkxTMHRDbWRyZUY5MlpYSnphVzl1T2lBaU1pNHpJZ3AxYVdRNklDSXdNVGxpTW1ReE5DMDBNak13TFRka1lqY3RPRGRrTkMwM1pEZ3hZMlpoWldNNU16SWlDblJwZEd4bE9pQWlRV2RsYm5RZ1YzSnBkR2x1WnlCUWIyeHBZM2tpQ25SNWNHVTZJQ0p3YjJ4cFkza2lDbU55WldGMFpXUmZZWFE2SUNJeU1ESTJMVEEzTFRBeFZEQXdPakF3T2pBd1dpSUtaWEJwYzNSbGJXbGpYM04wWVhSbE9pQWljbVZ3YjNKMFpXUWlDbk5sYm5OcGRHbDJhWFI1T2lBaWNIVmliR2xqSWdvdExTMEtJeUJCWjJWdWRDQlhjbWwwYVc1bklGQnZiR2xqZVFwQloyVnVkQzFqY21WaGRHVmtJRzV2ZEdWeklISmxjWFZwY21VZ1oyOTJaWEp1WldRZ1lYVjBhRzl5YVhwaGRHbHZiaXdnYUhWdFlXNGdjbVYyYVdWM0xDQmxlR0ZqZENCemIzVnlZMlVnYVc1MFpXZHlhWFI1TENCbWNtVnphQ0JqYVhSaGRHbHZibk1zSUdOdmJtWnNhV04wSUdoaGJtUnNhVzVuTENCc2FXNWxZV2RsSUdOb1pXTnJjeXdnWVc1a0lHRWdZbTkxYm1SbFpDQndhR0Z6WldacGRtVmhiSEJvWVNCa1pXTnBjMmx2Ymk0Z1NHbGtaR1Z1SUcxaGRHVnlhV0ZzSUcxMWMzUWdibVYyWlhJZ2FXNW1iSFZsYm1ObElHRnVJR0YxZEdodmNtbDZaV1FnY21WemRXeDBMZ29LSXlNZ1UzUmhZbXhsSUZObFkzUnBiMjRLY0doaGMyVm1hWFpsYzNSaFlteGxDZz09Iiwic291cmNlX2RpZ2VzdCI6InNoYTI1Njo0N2IwZDYyMjU4NDBmZjdjZDRkNjBmODYzOWQ4OWFhNzdlMzRmZjAyMzgyMDhmNWE2MzNiNDkyOGZmZTg4MzMwIn0sImNodW5rX2NvdW50IjoyLCJjb250cmFjdF92ZXJzaW9uIjoiZ2tvcy13YXRjaGVyLWNvbnZlcmdlbmNlLWZpeHR1cmUvMS4wLjAtZHJhZnQuMSIsIm9tZWdhIjp7ImJ5dGVfc2l6ZSI6NDk5LCJzb3VyY2VfYnl0ZXNfYmFzZTY0IjoiTFMwdENtZHJlRjkyWlhKemFXOXVPaUFpTWk0eklncDFhV1E2SUNJd01UbGlNbVF4TkMwME1qTXdMVGRrWWpjdE9EZGtOQzAzWkRneFkyWmhaV001TXpJaUNuUnBkR3hsT2lBaVFXZGxiblFnVjNKcGRHbHVaeUJRYjJ4cFkza2lDblI1Y0dVNklDSndiMnhwWTNraUNtTnlaV0YwWldSZllYUTZJQ0l5TURJMkxUQTNMVEF4VkRBd09qQXdPakF3V2lJS1pYQnBjM1JsYldsalgzTjBZWFJsT2lBaWNtVndiM0owWldRaUNuTmxibk5wZEdsMmFYUjVPaUFpY0hWaWJHbGpJZ290TFMwS0l5QkJaMlZ1ZENCWGNtbDBhVzVuSUZCdmJHbGplUXBCWjJWdWRDMWpjbVZoZEdWa0lHNXZkR1Z6SUhKbGNYVnBjbVVnWjI5MlpYSnVaV1FnWVhWMGFHOXlhWHBoZEdsdmJpd2dhSFZ0WVc0Z2NtVjJhV1YzTENCbGVHRmpkQ0J6YjNWeVkyVWdhVzUwWldkeWFYUjVMQ0JtY21WemFDQmphWFJoZEdsdmJuTXNJR052Ym1ac2FXTjBJR2hoYm1Sc2FXNW5MQ0JzYVc1bFlXZGxJR05vWldOcmN5d2dZVzVrSUdFZ1ltOTFibVJsWkNCd2FHRnpaV1pwZG1WdmJXVm5ZU0JrWldOcGMybHZiaTRnU0dsa1pHVnVJRzFoZEdWeWFXRnNJRzExYzNRZ2JtVjJaWElnYVc1bWJIVmxibU5sSUdGdUlHRjFkR2h2Y21sNlpXUWdjbVZ6ZFd4MExnb0tJeU1nVTNSaFlteGxJRk5sWTNScGIyNEtjR2hoYzJWbWFYWmxjM1JoWW14bENnPT0iLCJzb3VyY2VfZGlnZXN0Ijoic2hhMjU2OmZjZDFmYmYxYzc2Y2M0NWZkZWIxMzZmMzU3MzY1YzhjZjBiNWUzYTkwMGNkMzI4YWMxM2I5YmNiYmU0ZGY3YmYifSwic291cmNlX2NvdW50IjoxLCJzb3VyY2VfaWQiOiIwMTliMmQxNC00MjMwLTdkYjctODdkNC03ZDgxY2ZhZWM5MzIiLCJzb3VyY2VfcGF0aCI6InBvbGljeS9hZ2VudC13cml0aW5nLm1kIiwidmF1bHRfaWQiOiJwaGFzZTUtd2F0Y2hlci1jb252ZXJnZW5jZS12MSJ9LCJwZXJjZW50aWxlIjp7Im1ldGhvZCI6Im5lYXJlc3RfcmFuayIsInA1MCI6eyJpbmRleCI6OSwicmFuayI6MTB9LCJwOTUiOnsiaW5kZXgiOjE4LCJyYW5rIjoxOX0sInA5OSI6eyJpbmRleCI6MTksInJhbmsiOjIwfSwic29ydCI6ImFzY2VuZGluZ19pbnRlZ2VyX21pY3JvcyJ9LCJ0aHJlc2hvbGRzIjp7InA5NV9pbmNsdXNpdmVfdXBwZXJfYm91bmRfbWljcm9zIjo1MDAwMDAwLCJwZXJfc2FtcGxlX2luY2x1c2l2ZV91cHBlcl9ib3VuZF9taWNyb3MiOjUwMDAwMDB9LCJ0aW1pbmciOnsiZHVyYXRpb25fcm91bmRpbmciOiJjZWlsX25hbm9zZWNvbmRzX2RpdmlkZWRfYnlfMTAwMCIsImVuZF9ib3VuZGFyeSI6ImFmdGVyX2V4dGVybmFsX3NlYXJjaF9yZXNvbHZlc19hbmRfZXhwZWN0ZWRfY29oZXJlbnRfc291cmNlX3Jlc3VsdF9pc192ZXJpZmllZCIsImluY2x1ZGVzIjpbIm9zX2V2ZW50X2RlbGl2ZXJ5IiwiZGVib3VuY2UiLCJzZWN1cmVfc2NhbiIsInZhbGlkYXRpb24iLCJna3hfYXBwbHlfY2hhbmdlcyIsInJldHJpZXZhbF9idWlsZCIsImdyYXBoX3Byb2plY3Rpb24iLCJqb3VybmFsX2NvbW1pdHMiLCJvdXRlcl9wb2ludGVyX2FjdGl2YXRpb24iLCJleHRlcm5hbF9wcm9jZXNzX3N0YXJ0IiwiZXh0ZXJuYWxfc2VhcmNoIl0sInN0YXJ0X2JvdW5kYXJ5IjoiaW1tZWRpYXRlbHlfYWZ0ZXJfcGhhc2UzX2F0b21pY19yZXBsYWNlX2R1cmFiaWxpdHlfc2VxdWVuY2VfcmV0dXJucyJ9LCJ3YXRjaGVyIjp7ImNvbmZpZ3VyYXRpb25fZGlnZXN0Ijoic2hhMjU2OmUzODlmMzViOTEzMTRhY2JhOTNiYjZhMGQ5NTVhZjM0YTBkZjExYjUyNDcwMWI2ZDk0MDllMjQ1ZDhmNTVjMTEiLCJjb25maWd1cmF0aW9uX3ByZWltYWdlIjp7ImNvbnRyYWN0X3ZlcnNpb24iOiJna29zLXdhdGNoZXItY29udmVyZ2VuY2UtY29uZmlndXJhdGlvbi8xLjAuMC1kcmFmdC4xIiwiZGVib3VuY2VfbXMiOjUwMCwiZW1iZWRkaW5nX3JvbGUiOiJkaXNhYmxlZCIsImxleGljYWxfYmFja2VuZCI6InNxbGl0ZV9mdHM1IiwicmVyYW5rZXJfcm9sZSI6ImRpc2FibGVkIiwidmFsaWRhdGlvbl9tb2RlIjoibm9uX3N0cmljdCJ9LCJkZWJvdW5jZV9tcyI6NTAwLCJwb2xpY3lfZGlnZXN0Ijoic2hhMjU2OjJmYWYwMTNkZWQ3NTY2MzZhZGMyMmVkYWQ2MjMxMmMyMjVjODI1OGVmNjFiYTJlNDkyYTJkZTYzOWMxNTI3OTAiLCJwb2xpY3lfcHJlaW1hZ2UiOnsiY29udHJhY3RfdmVyc2lvbiI6Imdrb3Mtd2F0Y2hlci1jb252ZXJnZW5jZS1wb2xpY3kvMS4wLjAtZHJhZnQuMSIsImRpc2NvdmVyYWJpbGl0eSI6ImFsbG93Iiwic2Vuc2l0aXZpdHkiOiJwdWJsaWMiLCJ2YXVsdF9pZCI6InBoYXNlNS13YXRjaGVyLWNvbnZlcmdlbmNlLXYxIn0sInJldHJpZXZhbF9tb2RlIjoic3FsaXRlX2Z0czUiLCJ2YWxpZGF0aW9uX21vZGUiOiJub25fc3RyaWN0In19";

function compare(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

function stable(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) {
      throw new TypeError("watcher generator canonical JSON number is invalid");
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort(compare).map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  throw new TypeError("watcher generator canonical JSON input is invalid");
}

function sha(value) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function digest(value) { return sha(stable(value)); }
function sealed(material, field) { return { ...material, [field]: digest(material) }; }
function resealed(value, field, changes) {
  const material = { ...value, ...changes };
  delete material[field];
  return sealed(material, field);
}
function pretty(value) {
  return `${JSON.stringify(JSON.parse(stable(value)), null, 2)}\n`;
}
function clone(value) { return structuredClone(value); }

const GRAPH_SET_ARRAY_KEYS = new Set([
  "aliases", "areas", "diagnostic_codes", "labels", "lineageWarnings", "statuses", "supersededByIds", "supersedes", "supersedesIds", "tags", "types",
]);
const GKX_STATS_KEYS = ["files", "folders", "unresolved", "links", "wikilinks", "markdownLinks", "propertyLinks", "orphans"];
const GKX_DIAGNOSTICS_KEYS = ["notes", "folders", "attachments", "unresolvedLinks", "ambiguousLinks", "lineageEdges", "lineageCycles", "lineageWarnings", "residualCollisions"];
function normalizeGraphValue(value, key = null) {
  if (Array.isArray(value)) {
    const mapped = value.map((item) => normalizeGraphValue(item));
    return key !== null && GRAPH_SET_ARRAY_KEYS.has(key) && mapped.every((item) => typeof item === "string")
      ? [...new Set(mapped)].sort(compare) : mapped;
  }
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    const result = {};
    for (const childKey of Object.keys(value).sort(compare)) {
      if (value[childKey] === undefined) continue;
      result[childKey] = normalizeGraphValue(value[childKey], childKey);
    }
    return result;
  }
  return value;
}
function normalizeGeneratorGraph(graph) {
  const nodes = graph.nodes.map((node) => normalizeGraphValue(node)).sort((left, right) => compare(`${left.id}\u0000${left.path}`, `${right.id}\u0000${right.path}`));
  const links = graph.links.map((link) => normalizeGraphValue(link)).sort((left, right) => compare(`${left.id}\u0000${left.source}\u0000${left.target}\u0000${left.kind}`, `${right.id}\u0000${right.source}\u0000${right.target}\u0000${right.kind}`));
  const assessments = Array.isArray(graph.gkxAssessments) ? graph.gkxAssessments.map((item) => normalizeGraphValue(item)).sort((left, right) => compare(stable(left), stable(right))) : [];
  const diagnostics = Array.isArray(graph.gkxDiagnostics) ? graph.gkxDiagnostics.map((item) => normalizeGraphValue(item)).sort((left, right) => compare(stable(left), stable(right))) : [];
  const stats = Object.fromEntries(GKX_STATS_KEYS.map((key) => [key, graph.stats[key]]));
  const graphDiagnostics = Object.fromEntries(GKX_DIAGNOSTICS_KEYS.map((key) => [key, graph.diagnostics[key]]));
  return {
    contract_version: "gkos-watcher-canonical-gkx-graph/1.0.0-draft.1",
    normalized_graph: {
      nodes, links, stats: normalizeGraphValue(stats, "stats"), areas: normalizeGraphValue(graph.areas, "areas"),
      tags: normalizeGraphValue(graph.tags, "tags"), statuses: normalizeGraphValue(graph.statuses, "statuses"), types: normalizeGraphValue(graph.types, "types"),
      diagnostics: normalizeGraphValue(graphDiagnostics, "diagnostics"), __timeSpan: normalizeGraphValue(graph.__timeSpan),
      gkxProfile: normalizeGraphValue(graph.gkxProfile), gkxUidIndex: normalizeGraphValue(graph.gkxUidIndex),
      gkxAssessments: assessments, gkxDiagnostics: diagnostics,
    },
  };
}
function deriveGeneratorGraphiti(graph, vaultId) {
  const episodes = buildProductionGraphitiEpisodes(graph, {
    vault: vaultId, vaultIdentity: vaultId, processingTime: "1970-01-01T00:00:00.000Z",
  }).map((episode) => ({ ...episode, episode_body: stable(JSON.parse(episode.episode_body)) }));
  return { contract_version: "gkos-watcher-graphiti-projection/1.0.0-draft.1", processing_time: "1970-01-01T00:00:00.000Z", episodes };
}

const samplePlanV1 = JSON.parse(Buffer.from(SAMPLE_PLAN_BASE64, "base64").toString("utf8"));
const samplePlan = {
  ...samplePlanV1,
  contract_version: "gkos-watcher-convergence-sample-plan/1.0.0-draft.2",
  watcher: {
    configuration_digest: "sha256:082dffdb5390813e9d4e0b43097f730ccb98ac2f18ebd3549e03986a860fcdba",
    configuration_preimage: {
      canonical_authority: {
        standard_commit: "a2a2a6ca5c4dac32c6d9dc985ed7460f5f4350c6",
        projection_profile: "gkx-2.3-validating-projection",
      },
      mode: "fts",
      chunker: {
        version: "gkos-heading-chunker/1", tokenizer: "gkos-ascii-whitespace/1", max_tokens: 400, overlap_tokens: 0,
      },
      lexical: {
        provider: "sqlite_fts5", tokenizer: "unicode61 remove_diacritics 2",
        boosts: { title: 3, heading_path: 2, tags: 1.5, topic: 2, category: 2, text: 1 },
      },
      fusion: { rrf_k: 60 },
      diversity: { enabled: false, mmr_lambda: 0.7 },
      parent_expansion: true,
      parent_expansion_max_child_tokens: 80,
      configured_host: null,
    },
    debounce_ms: 500,
    effective_profile_digest: "sha256:9ab3b07da4cdfb584c2766762a32dc71653dffd87537ad0a4c9190e3a69015c5",
    policy_digest: "sha256:2a24f03ee235def9d6de500b8144f3660814be9aa3c8bf3d104b3fb57e808317",
    policy_preimage: { id: "engine.cli.public-only-discoverability", version: "1.0.0" },
    retrieval_mode: "sqlite_fts5",
    validation_mode: "non_strict",
  },
};
const samplePlanBytes = Buffer.from(stable(samplePlan));
if (samplePlanBytes.length !== 4363 || sha(samplePlanBytes) !== SAMPLE_PLAN_DIGEST) throw new Error("ratified watcher sample-plan transport mismatch");
if (stable(samplePlan) !== samplePlanBytes.toString("utf8")) throw new Error("ratified watcher sample plan is not canonical JSON");

function exactObject(properties, required = Object.keys(properties)) {
  return { type: "object", additionalProperties: false, unevaluatedProperties: false, required, properties };
}

function schemaRef(file, definition) {
  return { $ref: `${SCHEMA_ROOT}${file}#/$defs/${definition}` };
}

const digestSchema = { type: "string", pattern: "^sha256:[0-9a-f]{64}$" };
const nullableDigest = { anyOf: [digestSchema, { type: "null" }] };
const iso = { type: "string", format: "date-time", pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$" };
const label = { type: "string", pattern: "^[a-z0-9](?:[a-z0-9._:-]{0,127})$" };
const uuid7 = { type: "string", pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$" };
const authoredUid = { type: "string", pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$" };
const watcherGenerationId = { type: "string", pattern: "^watcher:[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$" };
const decimal = { type: "string", pattern: "^(?:0|[1-9][0-9]*)$" };
const pathSchema = { type: "string", minLength: 1, maxLength: 1024, pattern: "^(?!/)(?![A-Za-z]:)(?![A-Za-z][A-Za-z0-9+.-]*:)(?!.*:)(?!.*\\\\)(?!.*(?:^|/)\\.\\.?(?:/|$))(?!.*//)[^\\u0000-\\u001f<>:\"|?*\\u007f]+$" };
const safeInteger = { type: "integer", minimum: 0, maximum: 9007199254740991 };
const positiveInteger = { type: "integer", minimum: 1, maximum: 9007199254740991 };
const phase3SourceByteSize = { type: "integer", minimum: 0, maximum: 67108864 };
const sourceRowCount = { type: "integer", minimum: 0, maximum: 1000000 };
const positiveSourceRowCount = { type: "integer", minimum: 1, maximum: 1000000 };
const opaqueIdentity = { type: "string", minLength: 1, maxLength: 512, pattern: "^[^\\u0000-\\u001f\\u007f]+$" };
const sortedStrings = (maxItems = 1_000_000) => ({ type: "array", maxItems, uniqueItems: true, items: { type: "string" } });

function schema(title, defs, oneOf) {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `${SCHEMA_ROOT}${title}`,
    title,
    ...(oneOf ? { oneOf } : {}),
    $defs: defs,
  };
}

const sourceMutation = exactObject({
  kind: { enum: ["add", "change", "delete", "rename"] },
  cause: { enum: ["physical_appearance", "physical_disappearance", "content_change", "metadata_change", "verified_rename", "validation_rejection", "validation_reacceptance"] },
  from_path: { anyOf: [pathSchema, { type: "null" }] },
  to_path: { anyOf: [pathSchema, { type: "null" }] },
  source_id_before: { anyOf: [authoredUid, { type: "null" }] },
  source_id_after: { anyOf: [authoredUid, { type: "null" }] },
  source_digest_before: nullableDigest,
  source_digest_after: nullableDigest,
  parser_descriptor_digest_before: nullableDigest,
  parser_descriptor_digest_after: nullableDigest,
});

const acceptedSource = exactObject({
  source_path: pathSchema,
  source_id: authoredUid,
  source_observation_ordinal: { type: "integer", minimum: 0, maximum: 999999 },
  source_digest: digestSchema,
  source_size_bytes: phase3SourceByteSize,
  parser_descriptor_digest: digestSchema,
});

const rejectedSource = exactObject({
  source_path: pathSchema,
  source_id: { anyOf: [authoredUid, { type: "null" }] },
  source_observation_ordinal: { type: "integer", minimum: 0, maximum: 999999 },
  source_digest: nullableDigest,
  source_size_bytes: { anyOf: [phase3SourceByteSize, { type: "null" }] },
  parser_descriptor_digest: nullableDigest,
  rejection_digest: digestSchema,
  rejection_class: { enum: ["validation", "scan_rejection"] },
});

const preScanState = exactObject({
  contract_version: { const: "gkos-watcher-pre-scan-state/1.0.0-draft.1" },
  vault_id: label,
  active_pointer_digest: nullableDigest,
  active_coherent_manifest_digest: nullableDigest,
  topology_snapshot_digest: nullableDigest,
  configuration_digest: digestSchema,
  policy_digest: digestSchema,
  effective_profile_digest: digestSchema,
});

const observation = exactObject({
  contract_version: { const: "gkos-watcher-observation/1.0.0-draft.1" },
  batch_id: uuid7,
  batch_kind: { enum: ["event", "startup_reconciliation", "shutdown_flush", "failure_reconciliation"] },
  observed_paths: { type: "array", maxItems: 2000, uniqueItems: true, items: pathSchema },
  unscoped: { type: "boolean" },
  overflow: { type: "boolean" },
  started_at: iso,
  observation_digest: digestSchema,
});
observation.allOf = [{ if: { properties: { overflow: { const: true } } }, then: { properties: { unscoped: { const: true } } } }];

const observationAuthority = exactObject({
  contract_version: { const: "gkos-watcher-observation-authority/1.0.0-draft.1" },
  batch_id: uuid7,
  observation_digest: digestSchema,
  observation_artifact_file: { type: "string", pattern: "^watcher-observation-[0-9a-f]{64}\\.json$" },
  observation_raw_sha256: digestSchema,
  observation_byte_size: { type: "integer", minimum: 1, maximum: 4194304 },
  pre_scan_state_digest: digestSchema,
  started_at: iso,
  authority_digest: digestSchema,
});

const batchRecord = exactObject({
  contract_version: { const: "gkos-watcher-batch-record/1.0.0-draft.1" },
  batch_id: uuid7,
  batch_kind: { enum: ["event", "startup_reconciliation", "shutdown_flush", "failure_reconciliation"] },
  observation_authority_digest: digestSchema,
  started_at: iso,
  execution_kind: { enum: ["apply_changes", "set_files"] },
  retry_of_batch_id: { anyOf: [uuid7, { type: "null" }] },
  batch_record_digest: digestSchema,
});
batchRecord.allOf = [
  { if: { properties: { batch_kind: { const: "failure_reconciliation" } } }, then: { properties: { execution_kind: { const: "set_files" }, retry_of_batch_id: uuid7 } }, else: { properties: { retry_of_batch_id: { type: "null" } } } },
  { if: { properties: { batch_kind: { const: "startup_reconciliation" } } }, then: { properties: { execution_kind: { const: "set_files" } } } },
];

const plan = exactObject({
  contract_version: { const: "gkos-watcher-batch-plan/1.0.0-draft.1" },
  batch_id: uuid7,
  observation_digest: digestSchema,
  topology_snapshot_digest: digestSchema,
  effective_profile_digest: digestSchema,
  validation_result_digest: digestSchema,
  rejection_journal_digest: digestSchema,
  intended_source_mutations: { type: "array", maxItems: 1_000_000, items: sourceMutation },
  folder_set_changed: { type: "boolean" },
  attachment_set_changed: { type: "boolean" },
  mutation_set_digest: digestSchema,
  plan_digest: digestSchema,
});

const planAuthority = exactObject({
  contract_version: { const: "gkos-watcher-plan-authority/1.0.0-draft.1" },
  batch_id: uuid7,
  observation_digest: digestSchema,
  plan_digest: digestSchema,
  plan_artifact_file: { type: "string", pattern: "^watcher-plan-[0-9a-f]{64}\\.json$" },
  plan_raw_sha256: digestSchema,
  plan_byte_size: { type: "integer", minimum: 1, maximum: 536870912 },
  target_topology_snapshot_digest: digestSchema,
  source_removal_event_count: sourceRowCount,
  source_removal_event_set_digest: nullableDigest,
  authority_digest: digestSchema,
});

const batchSchema = schema("batch.schema.json", {
  sourceMutation, preScanState, observation, observationAuthority, batchRecord, plan, planAuthority,
}, [
  schemaRef("batch.schema.json", "observation"), schemaRef("batch.schema.json", "observationAuthority"), schemaRef("batch.schema.json", "batchRecord"),
  schemaRef("batch.schema.json", "preScanState"), schemaRef("batch.schema.json", "plan"), schemaRef("batch.schema.json", "planAuthority"),
]);

const topologySnapshot = exactObject({
  contract_version: { const: "gkos-watcher-topology-snapshot/1.0.0-draft.1" },
  vault_id: label,
  source_observation_snapshot_digest: digestSchema,
  validation_result_digest: digestSchema,
  rejection_journal_digest: digestSchema,
  accepted_sources: { type: "array", maxItems: 1_000_000, items: acceptedSource },
  rejected_sources: { type: "array", maxItems: 1_000_000, items: rejectedSource },
  folder_paths: { type: "array", maxItems: 1_000_000, uniqueItems: true, items: pathSchema },
  attachment_paths: { type: "array", maxItems: 1_000_000, uniqueItems: true, items: pathSchema },
  accepted_source_set_digest: digestSchema,
  rejected_source_set_digest: digestSchema,
  folder_set_digest: digestSchema,
  attachment_set_digest: digestSchema,
  topology_snapshot_digest: digestSchema,
});

const topologyArtifact = exactObject({
  file: { type: "string", pattern: "^watcher-topology-[0-9a-f]{64}\\.json$" },
  byte_size: { type: "integer", minimum: 1, maximum: 536870912 },
  raw_sha256: digestSchema,
});

const topologySchema = schema("topology.schema.json", { acceptedSource, rejectedSource, topologySnapshot, topologyArtifact }, [
  schemaRef("topology.schema.json", "topologySnapshot"), schemaRef("topology.schema.json", "topologyArtifact"),
]);

const retrievalProjectionState = exactObject({
  state: { enum: ["not_started", "ready"] }, owner_generation_id: { anyOf: [{ type: "string", pattern: "^ingest:[0-9a-f]{24}$" }, { type: "null" }] },
  owner_manifest_digest: nullableDigest, database_file: { anyOf: [{ type: "string", pattern: "^retrieval-[0-9a-f]{64}\\.sqlite$" }, { type: "null" }] }, manifest_digest: nullableDigest,
  projection_id: { anyOf: [{ type: "string", pattern: "^retrieval:[0-9a-f]{24}$" }, { type: "null" }] }, projection_digest: nullableDigest,
  lexical_backend: { anyOf: [{ enum: ["sqlite_fts5", "sqlite_lexical_scan"] }, { type: "null" }] },
  vector_stage_state: { anyOf: [{ enum: ["disabled", "complete", "degraded"] }, { type: "null" }] },
  provider_kind: { anyOf: [{ enum: ["openai_compatible", "local_onnx", "mcp"] }, { type: "null" }] }, provider_id: { anyOf: [{ type: "string" }, { type: "null" }] },
  model_id: { anyOf: [{ type: "string" }, { type: "null" }] }, dimensions: { anyOf: [positiveInteger, { type: "null" }] }, reason_codes: sortedStrings(64),
});
retrievalProjectionState.allOf = [{
  if: { properties: { state: { const: "not_started" } } },
  then: { properties: {
    owner_generation_id: { type: "null" }, owner_manifest_digest: { type: "null" }, database_file: { type: "null" }, manifest_digest: { type: "null" },
    projection_id: { type: "null" }, projection_digest: { type: "null" }, lexical_backend: { type: "null" }, vector_stage_state: { type: "null" },
    provider_kind: { type: "null" }, provider_id: { type: "null" }, model_id: { type: "null" }, dimensions: { type: "null" }, reason_codes: { type: "array", maxItems: 0 },
  } },
  else: { properties: {
    owner_generation_id: { type: "string", pattern: "^ingest:[0-9a-f]{24}$" }, owner_manifest_digest: digestSchema,
    database_file: { type: "string", pattern: "^retrieval-[0-9a-f]{64}\\.sqlite$" }, manifest_digest: digestSchema,
    projection_id: { type: "string", pattern: "^retrieval:[0-9a-f]{24}$" }, projection_digest: digestSchema,
    lexical_backend: { enum: ["sqlite_fts5", "sqlite_lexical_scan"] }, vector_stage_state: { enum: ["disabled", "complete", "degraded"] },
  } },
}, {
  if: { properties: { state: { const: "ready" }, vector_stage_state: { const: "disabled" } }, required: ["state", "vector_stage_state"] },
  then: { properties: { provider_kind: { type: "null" }, provider_id: { type: "null" }, model_id: { type: "null" }, dimensions: { type: "null" } } },
  else: { if: { properties: { state: { const: "ready" } }, required: ["state"] }, then: { properties: {
    provider_kind: { enum: ["openai_compatible", "local_onnx", "mcp"] }, provider_id: { type: "string", minLength: 1 }, model_id: { type: "string", minLength: 1 }, dimensions: positiveInteger,
  } } },
}];
const graphProjectionState = exactObject({
  state: { enum: ["not_started", "ready"] }, graph_contract_version: { anyOf: [{ const: "gkos-watcher-canonical-gkx-graph/1.0.0-draft.1" }, { type: "null" }] },
  graph_artifact_file: { anyOf: [{ type: "string", pattern: "^watcher-graph-[0-9a-f]{64}\\.json$" }, { type: "null" }] },
  graph_artifact_digest: nullableDigest, canonical_graph_digest: nullableDigest, gkx_delta_digest: nullableDigest, graphiti_projection_digest: nullableDigest,
  sink_state: { const: "not_applicable" }, sink_receipts: { type: "array", maxItems: 0 }, reason_codes: sortedStrings(64),
});
graphProjectionState.allOf = [{
  if: { properties: { state: { const: "not_started" } } },
  then: { properties: {
    graph_contract_version: { type: "null" }, graph_artifact_file: { type: "null" }, graph_artifact_digest: { type: "null" },
    canonical_graph_digest: { type: "null" }, gkx_delta_digest: { type: "null" }, graphiti_projection_digest: { type: "null" },
    sink_state: { const: "not_applicable" }, sink_receipts: { type: "array", maxItems: 0 }, reason_codes: { type: "array", maxItems: 0 },
  } },
  else: { properties: {
    graph_contract_version: { const: "gkos-watcher-canonical-gkx-graph/1.0.0-draft.1" },
    graph_artifact_file: { type: "string", pattern: "^watcher-graph-[0-9a-f]{64}\\.json$" }, graph_artifact_digest: digestSchema,
    canonical_graph_digest: digestSchema, gkx_delta_digest: digestSchema, graphiti_projection_digest: digestSchema,
    sink_state: { const: "not_applicable" }, sink_receipts: { type: "array", maxItems: 0 }, reason_codes: { type: "array", maxItems: 0 },
  } },
}];

const transition = exactObject({
  contract_version: { const: "gkos-watcher-transition/1.0.0-draft.1" },
  batch_id: uuid7,
  transition_ordinal: { type: "integer", minimum: 0, maximum: 6 },
  state: { enum: ["observed", "normalized", "gkx_applied", "retrieval_applied", "graph_applied", "activation_prepared", "complete", "failed", "superseded"] },
  last_reached_state: { enum: ["observed", "normalized", "gkx_applied", "retrieval_applied", "graph_applied", "activation_prepared", "complete"] },
  terminal_state: { enum: ["open", "complete", "failed", "superseded"] },
  observation_digest: digestSchema,
  plan_digest: nullableDigest,
  prior_transition_digest: nullableDigest,
  gkx_delta_digest: nullableDigest,
  gkx_snapshot_digest: nullableDigest,
  retrieval_projection_state: retrievalProjectionState,
  graph_projection_state: graphProjectionState,
  reason_codes: sortedStrings(64),
  recorded_at: iso,
  completed_at: { anyOf: [iso, { type: "null" }] },
  transition_digest: digestSchema,
});
const normalTransitionSchemaRows = [
  ["observed", 0, false, false, false, false], ["normalized", 1, true, false, false, false],
  ["gkx_applied", 2, true, true, false, false], ["retrieval_applied", 3, true, true, true, false],
  ["graph_applied", 4, true, true, true, true], ["activation_prepared", 5, true, true, true, true], ["complete", 6, true, true, true, true],
];
transition.allOf = [
  ...normalTransitionSchemaRows.map(([state, ordinal, planPresent, gkxPresent, retrievalPresent, graphPresent]) => ({
    if: { properties: { state: { const: state } } },
    then: { properties: {
      transition_ordinal: { const: ordinal }, last_reached_state: { const: state }, terminal_state: { const: state === "complete" ? "complete" : "open" },
      plan_digest: planPresent ? digestSchema : { type: "null" }, gkx_delta_digest: gkxPresent ? digestSchema : { type: "null" }, gkx_snapshot_digest: gkxPresent ? digestSchema : { type: "null" },
      retrieval_projection_state: retrievalPresent ? retrievalProjectionState : { ...retrievalProjectionState, properties: { ...retrievalProjectionState.properties, state: { const: "not_started" } } },
      graph_projection_state: graphPresent ? graphProjectionState : { ...graphProjectionState, properties: { ...graphProjectionState.properties, state: { const: "not_started" } } },
      reason_codes: { type: "array", maxItems: 0 }, completed_at: state === "complete" ? iso : { type: "null" },
    } },
  })),
  { if: { properties: { state: { enum: ["failed", "superseded"] } } }, then: { properties: {
    transition_ordinal: { type: "integer", minimum: 1, maximum: 6 }, prior_transition_digest: digestSchema,
    reason_codes: { type: "array", minItems: 1 }, completed_at: iso,
  } } },
];

const normalizedGraphDelta = exactObject({
  contract_version: { const: "gkos-watcher-normalized-graph-delta/1.0.0-draft.1" },
  delta: exactObject({
    addedNodes: sortedStrings(), removedNodes: sortedStrings(), changedNodes: sortedStrings(), topologyChanged: { type: "boolean" }, reparsed: safeInteger, fullRebuild: { type: "boolean" },
  }),
});

const transitionSchema = schema("transition.schema.json", { retrievalProjectionState, graphProjectionState, transition, normalizedGraphDelta }, [
  schemaRef("transition.schema.json", "retrievalProjectionState"), schemaRef("transition.schema.json", "graphProjectionState"),
  schemaRef("transition.schema.json", "transition"), schemaRef("transition.schema.json", "normalizedGraphDelta"),
]);

const canonicalGraphStats = exactObject(Object.fromEntries(GKX_STATS_KEYS.map((key) => [key, {}])));
const rawGraphStats = exactObject({ indexedAt: {}, durationMs: {}, ...Object.fromEntries(GKX_STATS_KEYS.map((key) => [key, {}])) });
const canonicalGraphDiagnostics = exactObject(Object.fromEntries(GKX_DIAGNOSTICS_KEYS.map((key) => [key, {}])));
const rawGraphDiagnostics = exactObject({
  ...Object.fromEntries(GKX_DIAGNOSTICS_KEYS.map((key) => [key, {}])),
  lastFullBuildMs: {},
  lastIncrementalUpdateMs: {},
}, GKX_DIAGNOSTICS_KEYS);
const graphBodyProperties = {
  nodes: { type: "array" }, links: { type: "array" }, areas: { type: "array" }, tags: { type: "array" },
  statuses: { type: "array" }, types: { type: "array" }, __timeSpan: {}, gkxProfile: {}, gkxUidIndex: {},
  gkxAssessments: { type: "array" }, gkxDiagnostics: { type: "array" },
};
const rawGraphBody = exactObject({ ...graphBodyProperties, stats: rawGraphStats, diagnostics: rawGraphDiagnostics });
const canonicalGraphBody = exactObject({ ...graphBodyProperties, stats: canonicalGraphStats, diagnostics: canonicalGraphDiagnostics });

const rawGraphArtifact = exactObject({
  contract_version: { const: "gkos-watcher-raw-graph-artifact/1.0.0-draft.1" },
  service_generation_id: watcherGenerationId,
  topology_snapshot_digest: digestSchema,
  graph: rawGraphBody,
  graph_artifact_digest: digestSchema,
});

const coherentManifest = exactObject({
  contract_version: { const: "gkos-watcher-coherent-manifest/1.0.0-draft.1" },
  service_generation_id: watcherGenerationId,
  vault_id: label,
  completed_batch_id: uuid7, completed_transition_digest: digestSchema,
  topology_snapshot_digest: digestSchema,
  topology_artifact_file: { type: "string", pattern: "^watcher-topology-[0-9a-f]{64}\\.json$" }, topology_artifact_raw_sha256: digestSchema,
  source_observation_snapshot_digest: digestSchema, effective_profile_digest: digestSchema, validation_result_digest: digestSchema,
  rejection_journal_digest: digestSchema, configuration_digest: digestSchema, policy_digest: digestSchema, gkx_snapshot_digest: digestSchema,
  retrieval_projection_state: retrievalProjectionState, graph_projection_state: graphProjectionState,
  source_removal_event_count: sourceRowCount,
  source_removal_event_set_digest: nullableDigest,
  created_at: iso,
  coherent_manifest_digest: digestSchema,
});

const pointer = exactObject({
  contract_version: { const: "gkos-watcher-active-pointer/1.0.0-draft.1" }, kind: { const: "watcher_coherent" }, service_generation_id: watcherGenerationId,
  coherent_manifest_file: { type: "string", pattern: "^watcher-coherent-[0-9a-f]{64}\\.json$" }, coherent_manifest_digest: digestSchema,
  prior_pointer_digest: nullableDigest, pointer_digest: digestSchema,
});
const canonicalGraph = exactObject({ contract_version: { const: "gkos-watcher-canonical-gkx-graph/1.0.0-draft.1" }, normalized_graph: canonicalGraphBody });
const graphitiProjection = exactObject({ contract_version: { const: "gkos-watcher-graphiti-projection/1.0.0-draft.1" }, processing_time: { const: "1970-01-01T00:00:00.000Z" }, episodes: { type: "array", maxItems: 1_000_000 } });
const coherentManifestSchema = schema("coherent-manifest.schema.json", { rawGraphArtifact, coherentManifest, pointer, canonicalGraph, graphitiProjection }, [
  schemaRef("coherent-manifest.schema.json", "rawGraphArtifact"), schemaRef("coherent-manifest.schema.json", "coherentManifest"),
  schemaRef("coherent-manifest.schema.json", "pointer"), schemaRef("coherent-manifest.schema.json", "canonicalGraph"),
  schemaRef("coherent-manifest.schema.json", "graphitiProjection"),
]);

const journalMeta = exactObject({
  contract_version: { const: "gkos-watcher-journal-meta/1.0.0-draft.1" }, journal_instance_id: uuid7, vault_id: label,
  configuration_digest: digestSchema, policy_digest: digestSchema, effective_profile_digest: digestSchema,
  anchor_coherent_manifest_digest: nullableDigest, created_at: iso, meta_digest: digestSchema,
});
const activationIntent = exactObject({
  contract_version: { const: "gkos-watcher-activation-intent/1.0.0-draft.1" }, prepared_transition_digest: digestSchema,
  coherent_manifest_digest: digestSchema, prior_pointer_digest: nullableDigest, target_pointer: pointer, target_complete_transition: transition,
  prepared_at: iso, intent_digest: digestSchema,
});
const activationOutcome = exactObject({
  contract_version: { const: "gkos-watcher-activation-outcome/1.0.0-draft.1" }, intent_digest: digestSchema,
  coherent_manifest_digest: digestSchema, outcome: { enum: ["published", "superseded"] }, pointer_digest: nullableDigest,
  reason_codes: sortedStrings(64), recorded_at: iso, outcome_digest: digestSchema,
});
activationOutcome.allOf = [{
  if: { properties: { outcome: { const: "published" } } },
  then: { properties: { pointer_digest: digestSchema, reason_codes: { type: "array", maxItems: 0 } } },
  else: { properties: { reason_codes: { type: "array", minItems: 1 } } },
}];
const activeCoherent = exactObject({
  contract_version: { const: "gkos-watcher-active-coherent/1.0.0-draft.1" }, service_generation_id: watcherGenerationId,
  coherent_manifest_digest: digestSchema, pointer_digest: digestSchema, intent_digest: digestSchema, activated_at: iso, active_digest: digestSchema,
});
const journalGeneration = exactObject({
  contract_version: { const: "gkos-watcher-journal-generation/1.0.0-draft.1" }, journal_instance_id: uuid7,
  directory_leaf: { type: "string", pattern: "^journal-[0-9a-f-]{36}$" }, database_file: { const: "watcher-journal.sqlite" },
  meta_digest: digestSchema, anchor_coherent_manifest_digest: nullableDigest, created_at: iso, journal_generation_digest: digestSchema,
});
const journalPointer = exactObject({
  contract_version: { const: "gkos-watcher-journal-active-pointer/1.0.0-draft.1" }, kind: { const: "watcher_journal" },
  journal_generation_file: { type: "string", pattern: "^watcher-journal-generation-[0-9a-f]{64}\\.json$" },
  journal_generation_digest: digestSchema, prior_pointer_digest: nullableDigest, pointer_digest: digestSchema,
});
const journalFileIdentity = exactObject({
  contract_version: { const: "gkos-watcher-journal-file-identity/1.0.0-draft.1" }, role: { enum: ["database", "wal", "shm"] },
  leaf: { enum: ["watcher-journal.sqlite", "watcher-journal.sqlite-wal", "watcher-journal.sqlite-shm"] },
  device: decimal, inode: decimal, mode: { const: 384 }, byte_size: safeInteger, raw_sha256: digestSchema, identity_digest: digestSchema,
});
journalFileIdentity.allOf = [{
  if: { properties: { role: { const: "database" } } },
  then: { properties: { leaf: { const: "watcher-journal.sqlite" }, byte_size: { type: "integer", minimum: 1, maximum: 2048000000 } } },
  else: {
    if: { properties: { role: { const: "wal" } } },
    then: { properties: { leaf: { const: "watcher-journal.sqlite-wal" } } },
    else: { properties: { leaf: { const: "watcher-journal.sqlite-shm" } } },
  },
}];
const journalArchive = exactObject({
  contract_version: { const: "gkos-watcher-journal-archive/1.0.0-draft.1" }, journal_instance_id: uuid7,
  directory_leaf: { type: "string", pattern: "^journal-[0-9a-f-]{36}$" }, directory_device: decimal, directory_inode: decimal,
  directory_mode: { const: 448 }, database_identity: journalFileIdentity,
  wal_identity: { anyOf: [journalFileIdentity, { type: "null" }] }, shm_identity: { anyOf: [journalFileIdentity, { type: "null" }] },
  outer_coherent_manifest_digest: digestSchema, archived_at: iso, archive_manifest_digest: digestSchema,
});
const journalReset = exactObject({
  contract_version: { const: "gkos-watcher-journal-reset/1.0.0-draft.1" }, reset_id: uuid7,
  prior_journal_generation_digest: digestSchema, archive_manifest_digest: digestSchema, new_journal_meta_digest: digestSchema,
  new_journal_generation_digest: digestSchema, target_journal_pointer_digest: digestSchema, outer_coherent_manifest_digest: digestSchema,
  ready_event_count: sourceRowCount, reset_carry_event_set_digest: nullableDigest, reset_carry_activation_digest: nullableDigest,
  reset_at: iso, reset_digest: digestSchema,
});
journalReset.allOf = [{
  if: { properties: { ready_event_count: { const: 0 } } },
  then: { properties: { reset_carry_event_set_digest: { type: "null" }, reset_carry_activation_digest: { type: "null" } } },
  else: { properties: { reset_carry_event_set_digest: digestSchema, reset_carry_activation_digest: digestSchema } },
}];
const resetReconciliationAdoptionReceipt = exactObject({
  contract_version: { const: "gkos-watcher-journal-reset-reconciliation-adoption/1.0.0-draft.1" },
  batch_id: uuid7, batch_kind: { const: "startup_reconciliation" }, execution_kind: { const: "set_files" },
  reset_digest: digestSchema, replacement_journal_generation_digest: digestSchema, source_journal_generation_digest: digestSchema,
  native_activation_journal_generation_digest: digestSchema, current_pointer_digest: digestSchema,
  current_coherent_manifest_digest: digestSchema, native_activation_intent_digest: digestSchema,
  native_activation_outcome_digest: digestSchema, prior_active_digest: digestSchema, observation_digest: digestSchema,
  observation_authority_digest: digestSchema, plan_digest: digestSchema, plan_authority_digest: digestSchema,
  topology_snapshot_digest: digestSchema, source_observation_snapshot_digest: digestSchema, gkx_snapshot_digest: digestSchema,
  retrieval_projection_digest: digestSchema, canonical_graph_digest: digestSchema, graphiti_projection_digest: digestSchema,
  started_at: iso, receipt_digest: digestSchema,
});
const resetReconciliationAdoptionTransition = exactObject({
  contract_version: { const: "gkos-watcher-journal-reset-reconciliation-transition/1.0.0-draft.1" },
  batch_id: uuid7, transition_ordinal: { const: 0 }, state: { const: "reset_reconciliation_adopted" },
  terminal_state: { const: "complete" }, receipt_digest: digestSchema, reset_digest: digestSchema,
  replacement_journal_generation_digest: digestSchema, current_pointer_digest: digestSchema,
  current_coherent_manifest_digest: digestSchema, topology_snapshot_digest: digestSchema, prior_active_digest: digestSchema,
  adopted_active_digest: digestSchema, recorded_at: iso, completed_at: iso, transition_digest: digestSchema,
});
const failureRetryNoopReceipt = exactObject({
  contract_version: { const: "gkos-watcher-failure-retry-noop-receipt/1.0.0-draft.1" },
  failed_batch_id: uuid7, failed_terminal_transition_digest: digestSchema, retry_batch_id: uuid7,
  retry_observation_digest: digestSchema, retry_observation_authority_digest: digestSchema,
  retry_pre_scan_state_digest: digestSchema, failure_retry_bundle_digest: digestSchema, retry_plan_digest: digestSchema,
  retry_plan_authority_digest: digestSchema, current_active_digest: digestSchema, current_pointer_digest: digestSchema,
  current_coherent_manifest_digest: digestSchema, current_intent_digest: digestSchema, current_outcome_digest: digestSchema,
  topology_snapshot_digest: digestSchema, source_observation_snapshot_digest: digestSchema, configuration_digest: digestSchema,
  policy_digest: digestSchema, effective_profile_digest: digestSchema, gkx_snapshot_digest: digestSchema,
  retrieval_projection_digest: digestSchema, canonical_graph_digest: digestSchema, graph_artifact_digest: digestSchema,
  graphiti_projection_digest: digestSchema, set_files_call_count: { const: 1 }, apply_changes_call_count: { const: 0 },
  provider_call_count: { const: 0 }, retrieval_write_count: { const: 0 }, outer_write_count: { const: 0 },
  completed_at: iso, receipt_digest: digestSchema,
});
const failureRetryNoopTransition = exactObject({
  contract_version: { const: "gkos-watcher-failure-retry-noop-transition/1.0.0-draft.1" },
  batch_id: uuid7, transition_ordinal: { const: 0 }, state: { const: "failure_reconciliation_noop_complete" },
  terminal_state: { const: "complete" }, prior_transition_digest: { type: "null" }, receipt: failureRetryNoopReceipt,
  receipt_digest: digestSchema, recorded_at: iso, completed_at: iso, transition_digest: digestSchema,
});
const bootstrapHostLock = exactObject({
  contract_version: { const: "gkos-watcher-host-lock/1.0.0-draft.1" }, lock_id: uuid7, process_id: { type: "integer", minimum: 1 },
  operation: { const: "service" }, service_instance_id: uuid7, prior_pointer_digest: nullableDigest,
  prior_coherent_manifest_digest: nullableDigest, prior_journal_pointer_digest: { type: "null" },
  owner_nonce: { type: "string", pattern: "^[0-9a-f]{32}$" }, created_at: iso, lock_digest: digestSchema,
});
const bootstrapPlannedTarget = exactObject({
  contract_version: { const: "gkos-watcher-journal-bootstrap-planned-target/1.0.0-draft.1" },
  watcher_host_lock_digest: digestSchema, journal_meta: journalMeta, journal_generation: journalGeneration,
  target_journal_pointer: journalPointer, planned_target_digest: digestSchema,
});
const bootstrapPlannedTargetRef = exactObject({
  planned_target_file: { type: "string", pattern: "^watcher-journal-bootstrap-planned-target-[0-9a-f]{64}\\.json$" },
  planned_target_digest: digestSchema, planned_target_raw_sha256: digestSchema,
  planned_target_byte_size: { type: "integer", minimum: 1, maximum: 1048576 }, watcher_host_lock_digest: digestSchema,
});
const bootstrapHostLockWitness = exactObject({
  contract_version: { const: "gkos-watcher-journal-bootstrap-host-lock-witness/1.0.0-draft.2" },
  watcher_host_lock: bootstrapHostLock, watcher_host_lock_digest: digestSchema, planned_target: bootstrapPlannedTargetRef,
  journal_instance_id: uuid7, journal_meta_digest: digestSchema, journal_generation_digest: digestSchema,
  target_journal_pointer_digest: digestSchema, witness_digest: digestSchema,
});
const bootstrapHostLockWitnessRef = exactObject({
  witness_file: { type: "string", pattern: "^watcher-journal-bootstrap-host-lock-[0-9a-f]{64}\\.json$" },
  witness_digest: digestSchema,
  witness_raw_sha256: digestSchema,
  witness_byte_size: { type: "integer", minimum: 1, maximum: 1048576 },
  watcher_host_lock_digest: digestSchema,
});
const journalBootstrapAuthority = exactObject({
  contract_version: { const: "gkos-watcher-journal-bootstrap-authority/1.0.0-draft.2" },
  host_lock_witness: bootstrapHostLockWitnessRef,
  journal_meta_digest: digestSchema,
  journal_generation_digest: digestSchema,
  journal_generation_file: { type: "string", pattern: "^watcher-journal-generation-[0-9a-f]{64}\\.json$" },
  target_journal_pointer_digest: digestSchema,
  target_journal_pointer_file: { type: "string", pattern: "^watcher-journal-pointer-[0-9a-f]{64}\\.json$" },
  committed_at: iso,
  authority_digest: digestSchema,
});
const oldJournalResetAuthority = exactObject({
  journal_bootstrap_authority: { anyOf: [journalBootstrapAuthority, { type: "null" }] },
  outer_pointer: schemaRef("coherent-manifest.schema.json", "pointer"),
  outer_coherent_manifest: schemaRef("coherent-manifest.schema.json", "coherentManifest"),
  active_coherent: activeCoherent,
  activated_event_set_bundles: {
    type: "array", maxItems: 1_000_000,
    items: schemaRef("source-removal.schema.json", "activatedEventSetBundle"),
  },
  responses: { type: "array", maxItems: 1_000_000, items: schemaRef("source-removal.schema.json", "adapterResponse") },
  receipts: { type: "array", maxItems: 1_000_000, items: schemaRef("source-removal.schema.json", "removalReceipt") },
});
const journalResetBundle = exactObject({
  old_meta: journalMeta,
  old_generation: journalGeneration,
  old_pointer: journalPointer,
  archive: journalArchive,
  reset: journalReset,
  guard: schemaRef("authority.schema.json", "journalResetGuard"),
  new_meta: journalMeta,
  new_generation: journalGeneration,
  target_pointer: journalPointer,
  reset_carry_bundle: {
    anyOf: [exactObject({
      event_set_bundle: schemaRef("source-removal.schema.json", "eventSetBundle"),
      activation: schemaRef("source-removal.schema.json", "removalActivation"),
    }), { type: "null" }],
  },
});
const resetHostLock = exactObject({
  contract_version: { const: "gkos-watcher-host-lock/1.0.0-draft.1" }, lock_id: uuid7,
  process_id: { type: "integer", minimum: 1 }, operation: { const: "journal_reset" }, service_instance_id: { type: "null" },
  prior_pointer_digest: digestSchema, prior_coherent_manifest_digest: digestSchema,
  prior_journal_pointer_digest: digestSchema, owner_nonce: { type: "string", pattern: "^[0-9a-f]{32}$" },
  created_at: iso, lock_digest: digestSchema,
});
const journalResetRecoveryPlan = exactObject({
  contract_version: { const: "gkos-watcher-journal-reset-recovery-plan/1.0.0-draft.1" },
  watcher_host_lock: resetHostLock,
  old_meta: journalMeta, old_generation: journalGeneration, old_pointer: journalPointer,
  outer_pointer: schemaRef("coherent-manifest.schema.json", "pointer"),
  outer_coherent_manifest: schemaRef("coherent-manifest.schema.json", "coherentManifest"),
  old_journal_authority: oldJournalResetAuthority,
  archive: journalArchive, reset: journalReset, reset_guard: schemaRef("authority.schema.json", "journalResetGuard"),
  pointer_replace_guard: schemaRef("authority.schema.json", "pointerGuard"),
  new_meta: journalMeta, new_generation: journalGeneration, target_pointer: journalPointer,
  reset_carry_bundle: journalResetBundle.properties.reset_carry_bundle,
  plan_digest: digestSchema,
});
const currentOwnerManifest = exactObject({
  contract_version: { const: "gkos-ingest-generation/1.0.0-draft.1" },
  owner_generation_id: { type: "string", pattern: "^ingest:[0-9a-f]{24}$" }, owner_manifest_digest: digestSchema,
  mode: { enum: ["strict", "non_strict"] }, vault_id: label, observation_snapshot_digest: digestSchema,
  profile: { type: "object" }, normalized_profile: { type: "object" }, configuration_digest: digestSchema, policy_digest: digestSchema,
  chunking: { type: "object" }, validation_result: { type: "object" },
  inner: exactObject({ database_file: { type: "string", pattern: "^retrieval-[0-9a-f]{64}\\.sqlite$" }, manifest: { type: "object" }, manifest_digest: digestSchema }),
  rejection_journal: exactObject({ journal_file: { type: "string" }, rejection_journal_digest: digestSchema, rejection_count: sourceRowCount }),
});
const failureRetryBundle = exactObject({
  failed_batch: batchRecord, failed_observation: observation, failed_observation_authority: observationAuthority,
  failed_pre_scan_state: preScanState,
  failed_transitions: { type: "array", minItems: 2, maxItems: 8, items: transition },
  retry_batch: batchRecord, retry_observation: observation, retry_observation_authority: observationAuthority,
  retry_pre_scan_state: preScanState,
});
const failureRetryNoopBundle = exactObject({
  failure_retry_bundle: failureRetryBundle,
  retry_plan: plan,
  retry_plan_authority: planAuthority,
  retry_topology: topologySnapshot,
  retry_canonical_graph: canonicalGraph,
  current_topology: topologySnapshot,
  current_outer_pointer: pointer,
  current_coherent_manifest: coherentManifest,
  current_activation_intent: activationIntent,
  current_activation_outcome: activationOutcome,
  current_active: activeCoherent,
  current_owner_manifest: currentOwnerManifest,
  current_canonical_graph: canonicalGraph,
  current_raw_graph: rawGraphArtifact,
  current_graphiti_projection: graphitiProjection,
  receipt: failureRetryNoopReceipt,
  transition: failureRetryNoopTransition,
});
const journalResetReconciliationAdoptionBundle = exactObject({
  replacement_meta: journalMeta, replacement_generation: journalGeneration, replacement_pointer: journalPointer, reset: journalReset,
  source_meta: journalMeta, source_generation: journalGeneration, source_pointer: journalPointer,
  native_meta: journalMeta, native_generation: journalGeneration, native_pointer: journalPointer,
  current_outer_pointer: pointer, current_coherent_manifest: coherentManifest,
  native_transitions: { type: "array", minItems: 7, maxItems: 7, items: transition },
  native_activation_intent: activationIntent, native_activation_outcome: activationOutcome, native_active: activeCoherent,
  source_adoption_receipt: { anyOf: [resetReconciliationAdoptionReceipt, { type: "null" }] },
  source_adoption_transition: { anyOf: [resetReconciliationAdoptionTransition, { type: "null" }] },
  source_active: activeCoherent, pre_scan_state: preScanState, observation, observation_authority: observationAuthority,
  plan, plan_authority: planAuthority, topology: topologySnapshot, current_owner_manifest: currentOwnerManifest,
  raw_graph: rawGraphArtifact, canonical_graph: canonicalGraph, graphiti_projection: graphitiProjection,
  adoption_receipt: resetReconciliationAdoptionReceipt, adoption_transition: resetReconciliationAdoptionTransition,
  adopted_active: activeCoherent,
});
const journalSchema = schema("journal.schema.json", {
  journalMeta, activationIntent, activationOutcome, activeCoherent, journalGeneration, journalPointer, journalFileIdentity,
  journalArchive, journalReset, resetReconciliationAdoptionReceipt, resetReconciliationAdoptionTransition,
  failureRetryNoopReceipt, failureRetryNoopTransition,
  bootstrapHostLock, bootstrapPlannedTarget, bootstrapPlannedTargetRef, bootstrapHostLockWitness,
  bootstrapHostLockWitnessRef, journalBootstrapAuthority, oldJournalResetAuthority, journalResetBundle,
  resetHostLock, journalResetRecoveryPlan,
  currentOwnerManifest, failureRetryBundle, failureRetryNoopBundle, journalResetReconciliationAdoptionBundle,
}, [
  schemaRef("journal.schema.json", "journalMeta"), schemaRef("journal.schema.json", "activationIntent"),
  schemaRef("journal.schema.json", "activationOutcome"), schemaRef("journal.schema.json", "activeCoherent"),
  schemaRef("journal.schema.json", "journalGeneration"), schemaRef("journal.schema.json", "journalPointer"),
  schemaRef("journal.schema.json", "journalFileIdentity"), schemaRef("journal.schema.json", "journalArchive"),
  schemaRef("journal.schema.json", "journalReset"), schemaRef("journal.schema.json", "bootstrapPlannedTarget"),
  schemaRef("journal.schema.json", "bootstrapHostLockWitness"), schemaRef("journal.schema.json", "journalBootstrapAuthority"),
  schemaRef("journal.schema.json", "oldJournalResetAuthority"), schemaRef("journal.schema.json", "journalResetBundle"),
  schemaRef("journal.schema.json", "journalResetRecoveryPlan"),
  schemaRef("journal.schema.json", "resetReconciliationAdoptionReceipt"),
  schemaRef("journal.schema.json", "resetReconciliationAdoptionTransition"),
  schemaRef("journal.schema.json", "failureRetryNoopReceipt"),
  schemaRef("journal.schema.json", "failureRetryNoopTransition"),
  schemaRef("journal.schema.json", "failureRetryBundle"),
  schemaRef("journal.schema.json", "failureRetryNoopBundle"),
  schemaRef("journal.schema.json", "journalResetReconciliationAdoptionBundle"),
]);

const watcherAuthority = exactObject({
  contract_version: { const: "gkos-watcher-authority/1.0.0-draft.1" }, kind: { const: "watcher_coherent_authority" }, vault_id: label,
  configuration_digest: digestSchema, policy_digest: digestSchema, effective_profile_digest: digestSchema,
  first_service_generation_id: watcherGenerationId, first_coherent_manifest_digest: digestSchema, first_pointer_digest: digestSchema, authority_digest: digestSchema,
});
const pointerGuard = exactObject(Object.fromEntries([
  ["contract_version", { const: "gkos-watcher-pointer-replace-guard/1.0.0-draft.1" }], ["operation", { enum: ["replace_watcher_active_pointer", "replace_watcher_journal_pointer"] }],
  ["owner_nonce", { type: "string", pattern: "^[0-9a-f]{32}$" }], ["parent_device", { type: "string", pattern: "^(?:0|[1-9][0-9]*)$" }],
  ["parent_inode", { type: "string", pattern: "^(?:0|[1-9][0-9]*)$" }], ["parent_mode", { const: 448 }],
  ...["final_basename", "guard_basename", "guard_stage_basename", "temp_basename"].map((key) => [key, { type: "string", minLength: 1, maxLength: 255 }]),
  ["old_pointer_file", { anyOf: [{ type: "string" }, { type: "null" }] }], ["old_pointer_digest", nullableDigest], ["old_pointer_raw_sha256", nullableDigest],
  ["old_pointer_byte_size", { anyOf: [safeInteger, { type: "null" }] }], ["old_final_device", { anyOf: [decimal, { type: "null" }] }],
  ["old_final_inode", { anyOf: [decimal, { type: "null" }] }], ["new_pointer_file", { type: "string" }], ["new_pointer_digest", digestSchema],
  ["new_pointer_raw_sha256", digestSchema], ["new_pointer_byte_size", positiveInteger], ["operation_intent_digest", digestSchema], ["target_commit_digest", digestSchema], ["guard_digest", digestSchema],
]));
pointerGuard.allOf = [{
  if: { properties: { operation: { const: "replace_watcher_active_pointer" } } },
  then: { properties: {
    final_basename: { const: "watcher-active.json" }, guard_basename: { const: ".watcher-active.json.gkos-watcher.guard" },
    guard_stage_basename: { const: ".watcher-active.json.gkos-watcher.guard-stage" }, temp_basename: { const: ".watcher-active.json.gkos-watcher.tmp" },
  } },
  else: { properties: {
    final_basename: { const: "watcher-journal-active.json" }, guard_basename: { const: ".watcher-journal-active.json.gkos-watcher.guard" },
    guard_stage_basename: { const: ".watcher-journal-active.json.gkos-watcher.guard-stage" }, temp_basename: { const: ".watcher-journal-active.json.gkos-watcher.tmp" },
    old_pointer_file: { type: "string" }, old_pointer_digest: digestSchema, old_pointer_raw_sha256: digestSchema,
    old_pointer_byte_size: positiveInteger, old_final_device: decimal, old_final_inode: decimal,
  } },
}];
const pointerRecoveryDecision = exactObject({
  contract_version: { const: "gkos-watcher-pointer-recovery-decision/1.0.0-draft.1" },
  selected_action: { enum: ["link_stage_to_guard", "discard_incomplete_stage", "unlink_stage_after_link", "create_temp", "replace_temp_to_fixed", "discard_incomplete_temp", "finalize_committed_target", "serve_guard_bound_old", "serve_fixed_new", "retain_and_fail"] },
  reader_authority: { enum: ["fixed_old", "guard_bound_old", "fixed_new", "genesis_none", "fail_closed"] },
  reader_pointer_digest: nullableDigest,
  evidence_disposition: { enum: ["continue", "serve", "retain_and_fail"] },
  decision_digest: digestSchema,
});
const journalResetGuard = exactObject({
  contract_version: { const: "gkos-watcher-journal-reset-guard/1.0.0-draft.1" }, operation: { const: "watcher_journal_reset" },
  owner_nonce: { type: "string", pattern: "^[0-9a-f]{32}$" }, parent_device: decimal, parent_inode: decimal, parent_mode: { const: 448 },
  guard_basename: { const: ".gkos-watcher-journal-reset.guard" }, guard_stage_basename: { const: ".gkos-watcher-journal-reset.guard-stage" },
  old_journal_pointer_digest: digestSchema, old_journal_generation_digest: digestSchema, outer_coherent_manifest_digest: digestSchema,
  archive_manifest_digest: digestSchema, new_journal_instance_id: uuid7, new_journal_directory_leaf: { type: "string", pattern: "^journal-[0-9a-f-]{36}$" },
  new_journal_meta_digest: digestSchema, new_journal_generation_digest: digestSchema, reset_digest: digestSchema,
  target_journal_pointer_digest: digestSchema, ready_event_count: sourceRowCount, reset_carry_event_set_digest: nullableDigest,
  reset_carry_activation_digest: nullableDigest, guard_digest: digestSchema,
});
journalResetGuard.allOf = [{
  if: { properties: { ready_event_count: { const: 0 } } },
  then: { properties: { reset_carry_event_set_digest: { type: "null" }, reset_carry_activation_digest: { type: "null" } } },
  else: { properties: { reset_carry_event_set_digest: digestSchema, reset_carry_activation_digest: digestSchema } },
}];
const authoritySchema = schema("authority.schema.json", { watcherAuthority, pointerGuard, pointerRecoveryDecision, journalResetGuard }, [
  schemaRef("authority.schema.json", "watcherAuthority"), schemaRef("authority.schema.json", "pointerGuard"),
  schemaRef("authority.schema.json", "pointerRecoveryDecision"), schemaRef("authority.schema.json", "journalResetGuard"),
]);

const adapterScope = exactObject({
  contract_version: { const: "gkos-watcher-source-removal-authorization-scope/1.0.0-draft.1" }, adapter_kind: { enum: ["governance_store", "durable_ledger"] },
  adapter_id: label, adapter_contract_version: label, vault_id: label, authority_namespace: label,
  authorized_operation: { const: "retrieval.source_removed/projection" }, configuration_digest: digestSchema, policy_digest: digestSchema,
  authorization_binding_digest: digestSchema,
});
const adapterBinding = exactObject({
  contract_version: { const: "gkos-watcher-source-removal-adapter-binding/1.0.0-draft.1" }, adapter_kind: { enum: ["governance_store", "durable_ledger"] },
  adapter_id: label, adapter_contract_version: label, vault_id: label, authority_namespace: label,
  authorization_binding_digest: digestSchema, configuration_digest: digestSchema, policy_digest: digestSchema,
  capabilities: { const: ["durable_idempotent_source_removal_projection", "lookup_by_occurrence_digest"] }, binding_digest: digestSchema,
});
const adapterChallenge = exactObject({
  contract_version: { const: "gkos-watcher-source-removal-adapter-challenge/1.0.0-draft.1" }, vault_id: label,
  configuration_digest: digestSchema, policy_digest: digestSchema, nonce: { type: "string", pattern: "^[0-9a-f]{32}$" },
  required_capabilities: { const: ["durable_idempotent_source_removal_projection", "lookup_by_occurrence_digest"] }, challenge_digest: digestSchema,
});
const adapterProof = exactObject({
  contract_version: { const: "gkos-watcher-source-removal-adapter-proof/1.0.0-draft.1" }, challenge_digest: digestSchema,
  binding_digest: digestSchema, adapter_kind: { enum: ["governance_store", "durable_ledger"] }, adapter_id: label,
  adapter_contract_version: label, authority_namespace: label, authorization_binding_digest: digestSchema,
  capabilities: { const: ["durable_idempotent_source_removal_projection", "lookup_by_occurrence_digest"] }, proof_digest: digestSchema,
});
const adapterVerification = exactObject({
  contract_version: { const: "gkos-watcher-source-removal-adapter-verification/1.0.0-draft.1" }, binding_digest: digestSchema,
  challenge_digest: digestSchema, proof_digest: digestSchema, process_instance_id: uuid7, verified_at: iso,
  capability_nonce_digest: digestSchema, verification_receipt_digest: digestSchema,
});
const removalOccurrence = exactObject({
  contract_version: { const: "gkos-watcher-source-removal-occurrence/1.0.0-draft.1" }, vault_id: label,
  prior_coherent_manifest_digest: digestSchema, prior_topology_snapshot_digest: digestSchema, source_id: authoredUid,
  source_path: pathSchema, source_digest: digestSchema, cause: { const: "physical_disappearance" }, occurrence_digest: digestSchema,
});
const removalEvent = exactObject({
  contract_version: { const: "gkos-watcher-source-removal-event/1.0.0-draft.1" }, occurrence_digest: digestSchema,
  adapter_binding_digest: nullableDigest, delivery_mode: { enum: ["local_only", "adapter"] }, event_digest: digestSchema,
});
removalEvent.allOf = [{
  if: { properties: { delivery_mode: { const: "local_only" } } },
  then: { properties: { adapter_binding_digest: { type: "null" } } },
  else: { properties: { adapter_binding_digest: digestSchema } },
}];
const removalMembership = exactObject({
  contract_version: { const: "gkos-watcher-source-removal-event-membership/1.0.0-draft.1" }, event_ordinal: positiveInteger,
  event_digest: digestSchema, causal_batch_id: uuid7, target_topology_snapshot_digest: digestSchema,
  prepared_at: iso, original_membership_digest: nullableDigest, membership_digest: digestSchema,
});
const removalSet = exactObject({
  contract_version: { const: "gkos-watcher-source-removal-event-set/1.0.0-draft.1" }, set_kind: { enum: ["batch", "reset_carry"] },
  origin_id: uuid7, target_topology_snapshot_digest: nullableDigest, event_count: positiveSourceRowCount,
  membership_digest_sequence_digest: digestSchema, prepared_at: iso, event_set_digest: digestSchema,
});
removalSet.allOf = [{
  if: { properties: { set_kind: { const: "batch" } } },
  then: { properties: { target_topology_snapshot_digest: digestSchema } },
  else: { properties: { target_topology_snapshot_digest: { type: "null" } } },
}];
const removalActivation = exactObject({
  contract_version: { const: "gkos-watcher-source-removal-event-set-activation/1.0.0-draft.1" }, event_set_digest: digestSchema,
  coherent_manifest_digest: digestSchema, activated_at: iso, activation_digest: digestSchema,
});
const adapterRequest = exactObject({
  contract_version: { const: "gkos-watcher-source-removal-adapter-request/1.0.0-draft.1" }, binding_digest: digestSchema,
  occurrence_digest: digestSchema, idempotency_key: digestSchema, source_id: authoredUid, source_path: pathSchema, source_digest: digestSchema,
  prior_coherent_manifest_digest: digestSchema, target_topology_snapshot_digest: digestSchema, observed_at: iso, request_digest: digestSchema,
});
const adapterResponse = exactObject({
  contract_version: { const: "gkos-watcher-source-removal-adapter-response/1.0.0-draft.1" }, binding_digest: digestSchema,
  occurrence_digest: digestSchema, status: { enum: ["accepted", "already_applied"] }, adapter_event_id: label,
  adapter_result_digest: digestSchema, response_digest: digestSchema,
});
const removalReceipt = exactObject({
  contract_version: { const: "gkos-watcher-source-removal-receipt/1.0.0-draft.1" }, event_digest: digestSchema,
  occurrence_digest: digestSchema, adapter_binding_digest: digestSchema, adapter_response_digest: digestSchema,
  adapter_result_digest: digestSchema, adapter_event_id: label, status: { enum: ["accepted", "already_applied"] }, recorded_at: iso,
  receipt_digest: digestSchema,
});
const eventSetBundle = exactObject({
  event_set: removalSet,
  memberships: { type: "array", maxItems: 1_000_000, items: removalMembership },
  prior_memberships: { type: "array", maxItems: 1_000_000, items: { anyOf: [removalMembership, { type: "null" }] } },
  events: { type: "array", maxItems: 1_000_000, items: removalEvent },
  prior_events: { type: "array", maxItems: 1_000_000, items: { anyOf: [removalEvent, { type: "null" }] } },
  occurrences: { type: "array", maxItems: 1_000_000, items: removalOccurrence },
  prior_occurrences: { type: "array", maxItems: 1_000_000, items: { anyOf: [removalOccurrence, { type: "null" }] } },
});
const activatedEventSetBundle = exactObject({
  event_set_bundle: eventSetBundle,
  activation: removalActivation,
});
const sourceRemovalSchema = schema("source-removal.schema.json", {
  adapterScope, adapterBinding, adapterChallenge, adapterProof, adapterVerification, removalOccurrence, removalEvent, removalMembership,
  removalSet, removalActivation, adapterRequest, adapterResponse, removalReceipt, eventSetBundle, activatedEventSetBundle,
}, Object.keys({ adapterScope, adapterBinding, adapterChallenge, adapterProof, adapterVerification, removalOccurrence, removalEvent, removalMembership, removalSet, removalActivation, adapterRequest, adapterResponse, removalReceipt, eventSetBundle, activatedEventSetBundle })
  .map((name) => schemaRef("source-removal.schema.json", name)));

const serviceLocator = exactObject({
  contract_version: { const: "gkos-watcher-service-locator/1.0.0-draft.1" }, service_instance_id: uuid7, pid: positiveInteger,
  loopback_host: { const: "127.0.0.1" }, port: { type: "integer", minimum: 1, maximum: 65535 }, status_route: { const: "/status" },
  control_route: { const: "/control/shutdown" }, started_at: iso, locator_digest: digestSchema,
});
const watcherStatus = exactObject({
  contract_version: { const: "gkos-watcher-status/1.0.0-draft.1" }, service_instance_id: uuid7,
  watcher_state: { enum: ["starting", "reconciling", "serving", "stopping", "error"] }, freshness: { enum: ["fresh", "stale", "degraded"] },
  reason_codes: sortedStrings(32), document_count: safeInteger, chunk_count: safeInteger,
  embedding_model: { anyOf: [opaqueIdentity, { type: "null" }] }, last_sync: { anyOf: [iso, { type: "null" }] },
  uptime_ms: safeInteger, pid: positiveInteger, source_snapshot_digest: nullableDigest, coherent_manifest_digest: nullableDigest,
  configuration_digest: nullableDigest, policy_digest: nullableDigest, status_digest: digestSchema,
});
watcherStatus.allOf = [{
  if: { properties: { freshness: { const: "fresh" } } },
  then: { properties: { reason_codes: { type: "array", maxItems: 0 }, source_snapshot_digest: digestSchema, coherent_manifest_digest: digestSchema, last_sync: iso } },
  else: { properties: { reason_codes: { type: "array", minItems: 1 } } },
}];
const resetResult = exactObject({
  contract_version: { const: "gkos-watcher-journal-reset-result/1.0.0-draft.1" }, status: { const: "reset" },
  prior_journal_generation_digest: digestSchema, archive_manifest_digest: digestSchema, new_journal_generation_digest: digestSchema,
  outer_coherent_manifest_digest: digestSchema, reset_digest: digestSchema, requires_reconciliation: { const: true }, result_digest: digestSchema,
});
const statusSchema = schema("status.schema.json", { serviceLocator, watcherStatus, resetResult }, [
  schemaRef("status.schema.json", "serviceLocator"), schemaRef("status.schema.json", "watcherStatus"),
  schemaRef("status.schema.json", "resetResult"),
]);

const samplePlanSchema = { const: samplePlan };
const ftsOutcome = exactObject({
  contract_version: { const: "gkos-watcher-fts-qualification-outcome/1.0.0-draft.1" }, lane_kind: { enum: ["reference", "matrix"] },
  runtime_version: opaqueIdentity, os: { enum: ["linux", "windows"] }, arch: { const: "x64" }, physical_fts5_available: { type: "boolean" },
  status: { enum: ["qualified", "unavailable"] }, index_generation_count: safeInteger, query_count: safeInteger, provider_call_count: safeInteger,
  outcome_digest: digestSchema,
});
ftsOutcome.allOf = [{
  if: { properties: { physical_fts5_available: { const: true } } },
  then: { properties: { status: { const: "qualified" }, index_generation_count: { const: 23 }, query_count: { const: 22 }, provider_call_count: { const: 0 } } },
  else: { properties: { status: { const: "unavailable" }, index_generation_count: { const: 0 }, query_count: { const: 0 }, provider_call_count: { const: 0 } } },
}];
const measurementEnvironment = exactObject({
  contract_version: { const: "gkos-watcher-observation-environment/1.0.0-draft.1" }, runtime: { const: "node" }, runtime_version: opaqueIdentity,
  os: { enum: ["linux", "windows"] }, arch: { const: "x64" }, sqlite_version: opaqueIdentity, physical_fts5_available: { type: "boolean" },
  runner_class: { enum: ["local", "github_hosted"] }, environment_digest: digestSchema,
});
const convergence = exactObject({
  contract_version: { const: "gkos-watcher-observation-convergence/1.0.0-draft.1" }, incremental_canonical_gkx_digest: digestSchema,
  clean_canonical_gkx_digest: digestSchema, incremental_retrieval_manifest_digest: digestSchema, clean_retrieval_manifest_digest: digestSchema,
  incremental_canonical_graph_digest: digestSchema, clean_canonical_graph_digest: digestSchema,
  incremental_graphiti_digest: digestSchema, clean_graphiti_digest: digestSchema, all_equal: { type: "boolean" }, convergence_digest: digestSchema,
});
const measurement = exactObject({
  contract_version: { const: "gkos-watcher-observation-measurement/1.0.0-draft.1" }, status: { enum: ["qualified", "unavailable", "failed"] },
  failure_codes: { type: "array", uniqueItems: true, items: { enum: ["MEASURE_CONVERGENCE_INVALID", "MEASURE_ENVIRONMENT_INVALID", "MEASURE_FTS_UNAVAILABLE", "MEASURE_GENERATION_INVALID", "MEASURE_LATENCY_EXCEEDED", "MEASURE_PLAN_INVALID", "MEASURE_PROVIDER_LEDGER_INVALID", "MEASURE_QUERY_INVALID"] } },
  sample_plan_digest: { const: SAMPLE_PLAN_DIGEST }, environment: measurementEnvironment, fts_qualification: ftsOutcome,
  edit_latency_micros: { anyOf: [{ type: "array", minItems: 20, maxItems: 20, items: { type: "integer", minimum: 0, maximum: 5000000 } }, { type: "null" }] },
  percentiles_micros: { anyOf: [exactObject({ p50: safeInteger, p95: safeInteger, p99: safeInteger, max: safeInteger }), { type: "null" }] },
  source_work: { anyOf: [exactObject({ initial_generation_count: { const: 1 }, mutation_generation_count: { const: 22 }, total_generation_count: { const: 23 }, query_count: { const: 22 }, reparsed_source_count: { const: 22 } }), { type: "null" }] },
  embedding_work: { anyOf: [exactObject({ provider_call_count: { const: 0 }, provider_item_count: { const: 0 }, unchanged_chunk_reembedded_count: { const: 0 } }), { type: "null" }] },
  convergence: { anyOf: [convergence, { type: "null" }] }, measurement_digest: digestSchema,
});
measurement.allOf = [{
  if: { properties: { status: { const: "qualified" } } },
  then: { properties: { failure_codes: { type: "array", maxItems: 0 }, edit_latency_micros: { type: "array", minItems: 20, maxItems: 20 }, percentiles_micros: { type: "object" }, source_work: { type: "object" }, embedding_work: { type: "object" }, convergence: { type: "object" } } },
  else: { properties: { edit_latency_micros: { type: "null" }, percentiles_micros: { type: "null" }, source_work: { type: "null" }, embedding_work: { type: "null" }, convergence: { type: "null" } } },
}];
const samplePlanPackSchema = schema("sample-plan.schema.json", { samplePlan: samplePlanSchema, ftsOutcome, measurementEnvironment, convergence, measurement }, [
  schemaRef("sample-plan.schema.json", "samplePlan"), schemaRef("sample-plan.schema.json", "ftsOutcome"),
  schemaRef("sample-plan.schema.json", "measurementEnvironment"), schemaRef("sample-plan.schema.json", "convergence"),
  schemaRef("sample-plan.schema.json", "measurement"),
]);

const conformanceFixtureSchema = exactObject({
  contract_version: { const: "gkos-watcher-recovery-conformance/1.0.0-draft.1" }, pack_contract_version: { const: PACK_VERSION },
  status: { const: "frozen" }, frozen: { const: true }, sample_plan_file: { const: "watcher-sample-plan.json" }, sample_plan_digest: { const: SAMPLE_PLAN_DIGEST },
  schema_cases: { type: "array", minItems: 1, maxItems: 512, items: exactObject({ case_id: label, schema_file: { type: "string" }, expected_valid: { type: "boolean" }, value: {} }) },
  semantic_cases: { type: "array", minItems: 1, maxItems: 512, items: exactObject({
    case_id: label,
    operation: { enum: ["derive_graphiti_projection", "normalize_canonical_graph", "normalize_graph_delta", "seal_coherent_activation_bundle", "seal_failure_retry_bundle", "seal_failure_retry_noop_bundle", "seal_journal_reset_bundle", "seal_journal_reset_reconciliation_adoption_bundle", "seal_measurement", "seal_pointer_recovery", "seal_record", "seal_source_removal_adapter_verification_bundle", "seal_source_removal_event_set_bundle", "seal_source_removal_receipt_bundle", "seal_status_bundle", "seal_transition_chain", "validate_cli_fixture", "validate_pack", "validate_path", "validate_sql_authority"] },
    input: exactObject({ arguments: { type: "array", maxItems: 3 } }),
    expectation: exactObject({
      accepted: { type: "boolean" }, output_digest: nullableDigest,
      error_class: { anyOf: [{ const: "WatcherRecoveryContractError" }, { type: "null" }] },
      error_code: { anyOf: [{ enum: ["GKX_WATCHER_CONTRACT_CLI_INVALID", "GKX_WATCHER_CONTRACT_DIGEST_INVALID", "GKX_WATCHER_CONTRACT_GRAPH_INVALID", "GKX_WATCHER_CONTRACT_KEYS_INVALID", "GKX_WATCHER_CONTRACT_MEASUREMENT_INVALID", "GKX_WATCHER_CONTRACT_PACK_INVALID", "GKX_WATCHER_CONTRACT_PATH_INVALID", "GKX_WATCHER_CONTRACT_POINTER_INVALID", "GKX_WATCHER_CONTRACT_RECORD_INVALID", "GKX_WATCHER_CONTRACT_RELATION_INVALID", "GKX_WATCHER_CONTRACT_RESET_INVALID", "GKX_WATCHER_CONTRACT_RETRY_INVALID", "GKX_WATCHER_CONTRACT_SAMPLE_PLAN_INVALID", "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "GKX_WATCHER_CONTRACT_SQL_INVALID", "GKX_WATCHER_CONTRACT_TRANSITION_INVALID", "GKX_WATCHER_CONTRACT_VERSION_INVALID"] }, { type: "null" }] },
    }),
  }) },
  companion_files: { type: "array", minItems: 3, maxItems: 3, uniqueItems: true, items: { type: "string" } }, conformance_digest: digestSchema,
});
const conformanceSchema = schema("conformance.schema.json", { conformanceFixture: conformanceFixtureSchema }, [schemaRef("conformance.schema.json", "conformanceFixture")]);

const files = new Map();
function queueJson(name, value, options = {}) { files.set(name, options.compact ? stable(value) : pretty(value)); }
function queueText(name, value) { files.set(name, value.endsWith("\n") ? value : `${value}\n`); }

files.set("watcher-sample-plan.json", samplePlanBytes);

const D = (letter) => `sha256:${letter.repeat(64)}`;
const EFFECTIVE_PROFILE_DIGEST = "sha256:9ab3b07da4cdfb584c2766762a32dc71653dffd87537ad0a4c9190e3a69015c5";
const started = "2026-08-20T00:00:00.000Z";
const completed = "2026-08-20T00:00:01.000Z";
const resetAt = "2026-08-20T00:00:02.000Z";
const sourceId = "019b2d14-4230-7db7-87d4-7d81cfaec932";
const journalId = "019b2d14-4232-7db7-87d4-7d81cfaec932";
const processId = "019b2d14-4233-7db7-87d4-7d81cfaec932";
const batchId = "019b2d14-4234-7db7-87d4-7d81cfaec932";
const generationId = `watcher:${batchId}`;
const resetId = "019b2d14-4235-7db7-87d4-7d81cfaec932";
const newJournalId = "019b2d14-4236-7db7-87d4-7d81cfaec932";

const accepted = { source_path: "policy/agent-writing.md", source_id: sourceId, source_observation_ordinal: 0, source_digest: D("1"), source_size_bytes: 499, parser_descriptor_digest: D("2") };
const priorTopologyMaterial = {
  contract_version: "gkos-watcher-topology-snapshot/1.0.0-draft.1", vault_id: "phase5-watcher-convergence-v1",
  source_observation_snapshot_digest: D("2"), validation_result_digest: D("a"), rejection_journal_digest: D("b"),
  accepted_sources: [accepted], rejected_sources: [], folder_paths: ["policy"], attachment_paths: ["assets/reference.png"],
  accepted_source_set_digest: digest({ contract_version: "gkos-watcher-accepted-source-set/1.0.0-draft.1", sources: [accepted] }),
  rejected_source_set_digest: digest({ contract_version: "gkos-watcher-rejected-source-set/1.0.0-draft.1", sources: [] }),
  folder_set_digest: digest({ contract_version: "gkos-watcher-folder-set/1.0.0-draft.1", folder_paths: ["policy"] }),
  attachment_set_digest: digest({ contract_version: "gkos-watcher-attachment-set/1.0.0-draft.1", attachment_paths: ["assets/reference.png"] }),
};
const priorTopology = sealed(priorTopologyMaterial, "topology_snapshot_digest");
const topologyMaterial = {
  contract_version: "gkos-watcher-topology-snapshot/1.0.0-draft.1", vault_id: "phase5-watcher-convergence-v1",
  source_observation_snapshot_digest: D("3"), validation_result_digest: D("c"), rejection_journal_digest: D("d"),
  accepted_sources: [], rejected_sources: [], folder_paths: ["policy"], attachment_paths: ["assets/reference.png"],
  accepted_source_set_digest: digest({ contract_version: "gkos-watcher-accepted-source-set/1.0.0-draft.1", sources: [] }),
  rejected_source_set_digest: digest({ contract_version: "gkos-watcher-rejected-source-set/1.0.0-draft.1", sources: [] }),
  folder_set_digest: digest({ contract_version: "gkos-watcher-folder-set/1.0.0-draft.1", folder_paths: ["policy"] }),
  attachment_set_digest: digest({ contract_version: "gkos-watcher-attachment-set/1.0.0-draft.1", attachment_paths: ["assets/reference.png"] }),
};
const topology = sealed(topologyMaterial, "topology_snapshot_digest");
const preScan = {
  contract_version: "gkos-watcher-pre-scan-state/1.0.0-draft.1", vault_id: "phase5-watcher-convergence-v1", active_pointer_digest: D("4"),
  active_coherent_manifest_digest: D("5"), topology_snapshot_digest: priorTopology.topology_snapshot_digest, configuration_digest: samplePlan.watcher.configuration_digest,
  policy_digest: samplePlan.watcher.policy_digest, effective_profile_digest: EFFECTIVE_PROFILE_DIGEST,
};
const preScanDigest = digest(preScan);
const observationValue = sealed({
  contract_version: "gkos-watcher-observation/1.0.0-draft.1", batch_id: batchId, batch_kind: "event", observed_paths: ["policy/agent-writing.md"],
  unscoped: false, overflow: false, started_at: started,
}, "observation_digest");
const observationBytes = Buffer.from(pretty(observationValue));
const observationAuthorityValue = sealed({
  contract_version: "gkos-watcher-observation-authority/1.0.0-draft.1", batch_id: batchId, observation_digest: observationValue.observation_digest,
  observation_artifact_file: `watcher-observation-${observationValue.observation_digest.slice(7)}.json`, observation_raw_sha256: sha(observationBytes),
  observation_byte_size: observationBytes.length, pre_scan_state_digest: preScanDigest, started_at: started,
}, "authority_digest");
const batchValue = sealed({
  contract_version: "gkos-watcher-batch-record/1.0.0-draft.1", batch_id: batchId, batch_kind: "event", observation_authority_digest: observationAuthorityValue.authority_digest,
  started_at: started, execution_kind: "apply_changes", retry_of_batch_id: null,
}, "batch_record_digest");

const adapterScopeValue = sealed({
  contract_version: "gkos-watcher-source-removal-authorization-scope/1.0.0-draft.1", adapter_kind: "durable_ledger", adapter_id: "governance-ledger-v1",
  adapter_contract_version: "source-removal-v1", vault_id: "phase5-watcher-convergence-v1", authority_namespace: "gkos-governance",
  authorized_operation: "retrieval.source_removed/projection", configuration_digest: samplePlan.watcher.configuration_digest, policy_digest: samplePlan.watcher.policy_digest,
}, "authorization_binding_digest");
const adapterBindingValue = sealed({
  contract_version: "gkos-watcher-source-removal-adapter-binding/1.0.0-draft.1", adapter_kind: "durable_ledger", adapter_id: "governance-ledger-v1",
  adapter_contract_version: "source-removal-v1", vault_id: "phase5-watcher-convergence-v1", authority_namespace: "gkos-governance",
  authorization_binding_digest: adapterScopeValue.authorization_binding_digest, configuration_digest: samplePlan.watcher.configuration_digest,
  policy_digest: samplePlan.watcher.policy_digest, capabilities: ["durable_idempotent_source_removal_projection", "lookup_by_occurrence_digest"],
}, "binding_digest");
const occurrenceValue = sealed({
  contract_version: "gkos-watcher-source-removal-occurrence/1.0.0-draft.1", vault_id: "phase5-watcher-convergence-v1",
  prior_coherent_manifest_digest: D("5"), prior_topology_snapshot_digest: priorTopology.topology_snapshot_digest, source_id: sourceId,
  source_path: "policy/agent-writing.md", source_digest: D("1"), cause: "physical_disappearance",
}, "occurrence_digest");
const eventValue = sealed({
  contract_version: "gkos-watcher-source-removal-event/1.0.0-draft.1", occurrence_digest: occurrenceValue.occurrence_digest,
  adapter_binding_digest: adapterBindingValue.binding_digest, delivery_mode: "adapter",
}, "event_digest");
const membershipValue = sealed({
  contract_version: "gkos-watcher-source-removal-event-membership/1.0.0-draft.1", event_ordinal: 1, event_digest: eventValue.event_digest,
  causal_batch_id: batchId, target_topology_snapshot_digest: topology.topology_snapshot_digest, prepared_at: started, original_membership_digest: null,
}, "membership_digest");
const membershipSequenceDigest = digest({ contract_version: "gkos-watcher-source-removal-membership-sequence/1.0.0-draft.1", membership_digests: [membershipValue.membership_digest] });
const eventSetValue = sealed({
  contract_version: "gkos-watcher-source-removal-event-set/1.0.0-draft.1", set_kind: "batch", origin_id: batchId,
  target_topology_snapshot_digest: topology.topology_snapshot_digest, event_count: 1, membership_digest_sequence_digest: membershipSequenceDigest, prepared_at: started,
}, "event_set_digest");

const planValue = sealed({
  contract_version: "gkos-watcher-batch-plan/1.0.0-draft.1", batch_id: batchId, observation_digest: observationValue.observation_digest,
  topology_snapshot_digest: topology.topology_snapshot_digest, effective_profile_digest: preScan.effective_profile_digest,
  validation_result_digest: topology.validation_result_digest, rejection_journal_digest: topology.rejection_journal_digest,
  intended_source_mutations: [{ kind: "delete", cause: "physical_disappearance", from_path: "policy/agent-writing.md", to_path: null,
    source_id_before: sourceId, source_id_after: null, source_digest_before: D("1"), source_digest_after: null,
    parser_descriptor_digest_before: D("2"), parser_descriptor_digest_after: null }],
  folder_set_changed: false, attachment_set_changed: false,
  mutation_set_digest: digest({ contract_version: "gkos-watcher-mutation-set/1.0.0-draft.1", pre_scan_state_digest: preScanDigest,
    topology_snapshot_digest: topology.topology_snapshot_digest,
    intended_source_mutations: [{ kind: "delete", cause: "physical_disappearance", from_path: "policy/agent-writing.md", to_path: null,
      source_id_before: sourceId, source_id_after: null, source_digest_before: D("1"), source_digest_after: null,
      parser_descriptor_digest_before: D("2"), parser_descriptor_digest_after: null }], folder_set_changed: false, attachment_set_changed: false }),
}, "plan_digest");
const planBytes = Buffer.from(pretty(planValue));
const planAuthorityValue = sealed({
  contract_version: "gkos-watcher-plan-authority/1.0.0-draft.1", batch_id: batchId, observation_digest: observationValue.observation_digest,
  plan_digest: planValue.plan_digest, plan_artifact_file: `watcher-plan-${planValue.plan_digest.slice(7)}.json`, plan_raw_sha256: sha(planBytes),
  plan_byte_size: planBytes.length, target_topology_snapshot_digest: topology.topology_snapshot_digest, source_removal_event_count: 1,
  source_removal_event_set_digest: eventSetValue.event_set_digest,
}, "authority_digest");

const normalizedDeltaValue = {
  contract_version: "gkos-watcher-normalized-graph-delta/1.0.0-draft.1",
  delta: { addedNodes: [], removedNodes: [sourceId], changedNodes: [], topologyChanged: true, reparsed: 0, fullRebuild: false },
};
const normalizedDeltaDigest = digest(normalizedDeltaValue);
const emptyRawGraph = {
  nodes: [], links: [], stats: { indexedAt: started, durationMs: 0, files: 0, folders: 1, unresolved: 0, links: 0, wikilinks: 0, markdownLinks: 0, propertyLinks: 0, orphans: 0 },
  areas: [], tags: [], statuses: [], types: [], diagnostics: { notes: 0, folders: 1, attachments: 1, unresolvedLinks: 0, ambiguousLinks: 0, lineageEdges: 0, lineageCycles: 0, lineageWarnings: [], residualCollisions: 0, lastFullBuildMs: 0, lastIncrementalUpdateMs: 0 },
  __timeSpan: { min: null, max: null }, gkxProfile: "GKX 2.3 Validating Projection Profile", gkxUidIndex: {}, gkxAssessments: [], gkxDiagnostics: [],
};
const rawGraphValue = sealed({ contract_version: "gkos-watcher-raw-graph-artifact/1.0.0-draft.1", service_generation_id: generationId, topology_snapshot_digest: topology.topology_snapshot_digest, graph: emptyRawGraph }, "graph_artifact_digest");
const canonicalGraphValue = normalizeGeneratorGraph(emptyRawGraph);
const graphitiValue = deriveGeneratorGraphiti(emptyRawGraph, "phase5-watcher-convergence-v1");
const notStartedRetrievalState = { state: "not_started", owner_generation_id: null, owner_manifest_digest: null, database_file: null, manifest_digest: null, projection_id: null, projection_digest: null, lexical_backend: null, vector_stage_state: null, provider_kind: null, provider_id: null, model_id: null, dimensions: null, reason_codes: [] };
const retrievalOwnerManifestDigest = D("7");
const retrievalProjectionDigest = D("9");
const retrievalState = {
  state: "ready",
  owner_generation_id: `ingest:${retrievalOwnerManifestDigest.slice(7, 31)}`,
  owner_manifest_digest: retrievalOwnerManifestDigest,
  database_file: `retrieval-${retrievalProjectionDigest.slice(7)}.sqlite`,
  manifest_digest: D("8"),
  projection_id: `retrieval:${retrievalProjectionDigest.slice(7, 31)}`,
  projection_digest: retrievalProjectionDigest,
  lexical_backend: "sqlite_fts5", vector_stage_state: "disabled", provider_kind: null, provider_id: null, model_id: null, dimensions: null, reason_codes: [],
};
const notStartedGraphState = { state: "not_started", graph_contract_version: null, graph_artifact_file: null, graph_artifact_digest: null, canonical_graph_digest: null, gkx_delta_digest: null, graphiti_projection_digest: null, sink_state: "not_applicable", sink_receipts: [], reason_codes: [] };
const graphState = { state: "ready", graph_contract_version: "gkos-watcher-canonical-gkx-graph/1.0.0-draft.1", graph_artifact_file: `watcher-graph-${rawGraphValue.graph_artifact_digest.slice(7)}.json`, graph_artifact_digest: rawGraphValue.graph_artifact_digest, canonical_graph_digest: digest(canonicalGraphValue), gkx_delta_digest: normalizedDeltaDigest, graphiti_projection_digest: digest(graphitiValue), sink_state: "not_applicable", sink_receipts: [], reason_codes: [] };
const normalStates = ["observed", "normalized", "gkx_applied", "retrieval_applied", "graph_applied", "activation_prepared", "complete"];
const transitions = [];
for (let index = 0; index < normalStates.length; index++) {
  const material = {
    contract_version: "gkos-watcher-transition/1.0.0-draft.1", batch_id: batchId, transition_ordinal: index, state: normalStates[index],
    last_reached_state: normalStates[index], terminal_state: index === 6 ? "complete" : "open",
    observation_digest: observationValue.observation_digest, plan_digest: index === 0 ? null : planValue.plan_digest,
    prior_transition_digest: index === 0 ? null : transitions[index - 1].transition_digest,
    gkx_delta_digest: index < 2 ? null : normalizedDeltaDigest, gkx_snapshot_digest: index < 2 ? null : D("e"),
    retrieval_projection_state: index < 3 ? notStartedRetrievalState : retrievalState,
    graph_projection_state: index < 4 ? notStartedGraphState : graphState,
    reason_codes: [], recorded_at: started, completed_at: index === 6 ? completed : null,
  };
  transitions.push(sealed(material, "transition_digest"));
}
const failedTransitionValue = sealed({
  ...Object.fromEntries(Object.entries(transitions[0]).filter(([key]) => key !== "transition_digest")),
  transition_ordinal: 1, state: "failed", last_reached_state: "observed", terminal_state: "failed",
  prior_transition_digest: transitions[0].transition_digest, reason_codes: ["WATCHER_SOURCE_UNSTABLE"], completed_at: completed,
}, "transition_digest");
function exceptionalTransitionAfter(prior, terminalState) {
  return sealed({
    ...Object.fromEntries(Object.entries(prior).filter(([key]) => key !== "transition_digest")),
    transition_ordinal: prior.transition_ordinal + 1,
    state: terminalState,
    last_reached_state: prior.state,
    terminal_state: terminalState,
    prior_transition_digest: prior.transition_digest,
    reason_codes: [terminalState === "failed" ? "WATCHER_SOURCE_UNSTABLE" : "WATCHER_RECOVERY_SUPERSEDED"],
    completed_at: completed,
  }, "transition_digest");
}
const retryBatchId = "019b2d14-4237-7db7-87d4-7d81cfaec932";
const retryObservationValue = sealed({
  contract_version: "gkos-watcher-observation/1.0.0-draft.1", batch_id: retryBatchId, batch_kind: "failure_reconciliation", observed_paths: [],
  unscoped: true, overflow: false, started_at: completed,
}, "observation_digest");
const retryObservationBytes = Buffer.from(pretty(retryObservationValue));
const retryObservationAuthorityValue = sealed({
  contract_version: "gkos-watcher-observation-authority/1.0.0-draft.1", batch_id: retryBatchId,
  observation_digest: retryObservationValue.observation_digest,
  observation_artifact_file: `watcher-observation-${retryObservationValue.observation_digest.slice(7)}.json`,
  observation_raw_sha256: sha(retryObservationBytes), observation_byte_size: retryObservationBytes.length,
  pre_scan_state_digest: preScanDigest, started_at: completed,
}, "authority_digest");
const retryBatchValue = sealed({
  contract_version: "gkos-watcher-batch-record/1.0.0-draft.1", batch_id: retryBatchId, batch_kind: "failure_reconciliation",
  observation_authority_digest: retryObservationAuthorityValue.authority_digest, started_at: completed, execution_kind: "set_files", retry_of_batch_id: batchId,
}, "batch_record_digest");
const failureRetryValue = {
  failed_batch: batchValue, failed_observation: observationValue, failed_observation_authority: observationAuthorityValue,
  failed_pre_scan_state: preScan, failed_transitions: [transitions[0], failedTransitionValue], retry_batch: retryBatchValue,
  retry_observation: retryObservationValue, retry_observation_authority: retryObservationAuthorityValue, retry_pre_scan_state: preScan,
};

const topologyBytes = Buffer.from(pretty(topology));
const manifestMaterial = {
  contract_version: "gkos-watcher-coherent-manifest/1.0.0-draft.1", service_generation_id: generationId, vault_id: "phase5-watcher-convergence-v1",
  completed_batch_id: batchId, completed_transition_digest: transitions[6].transition_digest,
  topology_snapshot_digest: topology.topology_snapshot_digest,
  topology_artifact_file: `watcher-topology-${topology.topology_snapshot_digest.slice(7)}.json`, topology_artifact_raw_sha256: sha(topologyBytes),
  source_observation_snapshot_digest: topology.source_observation_snapshot_digest, effective_profile_digest: EFFECTIVE_PROFILE_DIGEST,
  validation_result_digest: topology.validation_result_digest, rejection_journal_digest: topology.rejection_journal_digest,
  configuration_digest: samplePlan.watcher.configuration_digest, policy_digest: samplePlan.watcher.policy_digest,
  gkx_snapshot_digest: transitions[6].gkx_snapshot_digest, retrieval_projection_state: retrievalState, graph_projection_state: graphState,
  source_removal_event_count: 1, source_removal_event_set_digest: eventSetValue.event_set_digest, created_at: completed,
};
const coherentManifestValue = sealed(manifestMaterial, "coherent_manifest_digest");
const pointerValue = sealed({
  contract_version: "gkos-watcher-active-pointer/1.0.0-draft.1", kind: "watcher_coherent", service_generation_id: generationId,
  coherent_manifest_file: `watcher-coherent-${coherentManifestValue.coherent_manifest_digest.slice(7)}.json`, coherent_manifest_digest: coherentManifestValue.coherent_manifest_digest,
  prior_pointer_digest: D("4"),
}, "pointer_digest");
const intentValue = sealed({
  contract_version: "gkos-watcher-activation-intent/1.0.0-draft.1", prepared_transition_digest: transitions[5].transition_digest,
  coherent_manifest_digest: coherentManifestValue.coherent_manifest_digest, prior_pointer_digest: D("4"), target_pointer: pointerValue,
  target_complete_transition: transitions[6], prepared_at: completed,
}, "intent_digest");
const outcomeValue = sealed({
  contract_version: "gkos-watcher-activation-outcome/1.0.0-draft.1", intent_digest: intentValue.intent_digest,
  coherent_manifest_digest: coherentManifestValue.coherent_manifest_digest, outcome: "published", pointer_digest: pointerValue.pointer_digest,
  reason_codes: [], recorded_at: completed,
}, "outcome_digest");
const activeValue = sealed({
  contract_version: "gkos-watcher-active-coherent/1.0.0-draft.1", service_generation_id: generationId,
  coherent_manifest_digest: coherentManifestValue.coherent_manifest_digest, pointer_digest: pointerValue.pointer_digest,
  intent_digest: intentValue.intent_digest, activated_at: completed,
}, "active_digest");
const activationValue = sealed({
  contract_version: "gkos-watcher-source-removal-event-set-activation/1.0.0-draft.1", event_set_digest: eventSetValue.event_set_digest,
  coherent_manifest_digest: coherentManifestValue.coherent_manifest_digest, activated_at: completed,
}, "activation_digest");
const carryMembershipValue = sealed({
  contract_version: "gkos-watcher-source-removal-event-membership/1.0.0-draft.1", event_ordinal: 1,
  event_digest: eventValue.event_digest, causal_batch_id: membershipValue.causal_batch_id,
  target_topology_snapshot_digest: membershipValue.target_topology_snapshot_digest, prepared_at: membershipValue.prepared_at,
  original_membership_digest: membershipValue.membership_digest,
}, "membership_digest");
const carrySequenceDigest = digest({
  contract_version: "gkos-watcher-source-removal-membership-sequence/1.0.0-draft.1",
  membership_digests: [carryMembershipValue.membership_digest],
});
const carrySetValue = sealed({
  contract_version: "gkos-watcher-source-removal-event-set/1.0.0-draft.1", set_kind: "reset_carry", origin_id: resetId,
  target_topology_snapshot_digest: null, event_count: 1, membership_digest_sequence_digest: carrySequenceDigest, prepared_at: completed,
}, "event_set_digest");
const carryActivationValue = sealed({
  contract_version: "gkos-watcher-source-removal-event-set-activation/1.0.0-draft.1", event_set_digest: carrySetValue.event_set_digest,
  coherent_manifest_digest: coherentManifestValue.coherent_manifest_digest, activated_at: completed,
}, "activation_digest");
const authorityValue = sealed({
  contract_version: "gkos-watcher-authority/1.0.0-draft.1", kind: "watcher_coherent_authority", vault_id: "phase5-watcher-convergence-v1",
  configuration_digest: samplePlan.watcher.configuration_digest, policy_digest: samplePlan.watcher.policy_digest, effective_profile_digest: EFFECTIVE_PROFILE_DIGEST,
  first_service_generation_id: generationId, first_coherent_manifest_digest: coherentManifestValue.coherent_manifest_digest, first_pointer_digest: pointerValue.pointer_digest,
}, "authority_digest");
const statusValue = sealed({
  contract_version: "gkos-watcher-status/1.0.0-draft.1", service_instance_id: processId, watcher_state: "serving", freshness: "fresh", reason_codes: [],
  document_count: 0, chunk_count: 0, embedding_model: null, last_sync: completed, uptime_ms: 1_234, pid: 4_242,
  source_snapshot_digest: topology.source_observation_snapshot_digest, coherent_manifest_digest: coherentManifestValue.coherent_manifest_digest,
  configuration_digest: samplePlan.watcher.configuration_digest, policy_digest: samplePlan.watcher.policy_digest,
}, "status_digest");

const requestValue = sealed({
  contract_version: "gkos-watcher-source-removal-adapter-request/1.0.0-draft.1", binding_digest: adapterBindingValue.binding_digest,
  occurrence_digest: occurrenceValue.occurrence_digest, idempotency_key: occurrenceValue.occurrence_digest, source_id: sourceId,
  source_path: occurrenceValue.source_path, source_digest: occurrenceValue.source_digest, prior_coherent_manifest_digest: occurrenceValue.prior_coherent_manifest_digest,
  target_topology_snapshot_digest: topology.topology_snapshot_digest, observed_at: membershipValue.prepared_at,
}, "request_digest");
const adapterResultDigest = digest({ contract_version: "gkos-watcher-source-removal-adapter-result/1.0.0-draft.1", binding_digest: adapterBindingValue.binding_digest, occurrence_digest: occurrenceValue.occurrence_digest, adapter_event_id: "ledger-event-1" });
const responseValue = sealed({
  contract_version: "gkos-watcher-source-removal-adapter-response/1.0.0-draft.1", binding_digest: adapterBindingValue.binding_digest,
  occurrence_digest: occurrenceValue.occurrence_digest, status: "accepted", adapter_event_id: "ledger-event-1", adapter_result_digest: adapterResultDigest,
}, "response_digest");
function makeAdapterResponse(status, adapterEventId) {
  const adapter_result_digest = digest({
    contract_version: "gkos-watcher-source-removal-adapter-result/1.0.0-draft.1",
    binding_digest: adapterBindingValue.binding_digest,
    occurrence_digest: occurrenceValue.occurrence_digest,
    adapter_event_id: adapterEventId,
  });
  return sealed({
    contract_version: "gkos-watcher-source-removal-adapter-response/1.0.0-draft.1",
    binding_digest: adapterBindingValue.binding_digest,
    occurrence_digest: occurrenceValue.occurrence_digest,
    status,
    adapter_event_id: adapterEventId,
    adapter_result_digest,
  }, "response_digest");
}
const alreadyAppliedResponseValue = makeAdapterResponse("already_applied", "ledger-event-1");
const differentAdapterEventResponseValue = makeAdapterResponse("accepted", "ledger-event-2");
const wrongResultResponseValue = resealed(responseValue, "response_digest", { adapter_result_digest: D("f") });
const receiptValue = sealed({
  contract_version: "gkos-watcher-source-removal-receipt/1.0.0-draft.1", event_digest: eventValue.event_digest,
  occurrence_digest: occurrenceValue.occurrence_digest, adapter_binding_digest: adapterBindingValue.binding_digest,
  adapter_response_digest: responseValue.response_digest, adapter_result_digest: responseValue.adapter_result_digest,
  adapter_event_id: responseValue.adapter_event_id, status: responseValue.status, recorded_at: completed,
}, "receipt_digest");
const wrongBindingResponseValue = resealed(responseValue, "response_digest", {
  ...responseValue,
  binding_digest: D("f"),
  adapter_result_digest: digest({
    contract_version: "gkos-watcher-source-removal-adapter-result/1.0.0-draft.1",
    binding_digest: D("f"),
    occurrence_digest: occurrenceValue.occurrence_digest,
    adapter_event_id: responseValue.adapter_event_id,
  }),
});
const wrongBindingReceiptValue = resealed(receiptValue, "receipt_digest", {
  ...receiptValue,
  adapter_response_digest: wrongBindingResponseValue.response_digest,
  adapter_result_digest: wrongBindingResponseValue.adapter_result_digest,
});

const journalMetaValue = sealed({
  contract_version: "gkos-watcher-journal-meta/1.0.0-draft.1", journal_instance_id: journalId, vault_id: "phase5-watcher-convergence-v1",
  configuration_digest: samplePlan.watcher.configuration_digest, policy_digest: samplePlan.watcher.policy_digest,
  effective_profile_digest: EFFECTIVE_PROFILE_DIGEST, anchor_coherent_manifest_digest: null, created_at: completed,
}, "meta_digest");
const journalGenerationValue = sealed({
  contract_version: "gkos-watcher-journal-generation/1.0.0-draft.1", journal_instance_id: journalId,
  directory_leaf: `journal-${journalId}`, database_file: "watcher-journal.sqlite", meta_digest: journalMetaValue.meta_digest,
  anchor_coherent_manifest_digest: null, created_at: completed,
}, "journal_generation_digest");
const journalPointerValue = sealed({
  contract_version: "gkos-watcher-journal-active-pointer/1.0.0-draft.1", kind: "watcher_journal",
  journal_generation_file: `watcher-journal-generation-${journalGenerationValue.journal_generation_digest.slice(7)}.json`,
  journal_generation_digest: journalGenerationValue.journal_generation_digest, prior_pointer_digest: null,
}, "pointer_digest");
const databaseIdentityValue = sealed({
  contract_version: "gkos-watcher-journal-file-identity/1.0.0-draft.1", role: "database", leaf: "watcher-journal.sqlite",
  device: "1", inode: "4", mode: 384, byte_size: 4096, raw_sha256: D("1"),
}, "identity_digest");
const archiveValue = sealed({
  contract_version: "gkos-watcher-journal-archive/1.0.0-draft.1", journal_instance_id: journalId,
  directory_leaf: `journal-${journalId}`, directory_device: "1", directory_inode: "3", directory_mode: 448,
  database_identity: databaseIdentityValue, wal_identity: null, shm_identity: null,
  outer_coherent_manifest_digest: coherentManifestValue.coherent_manifest_digest, archived_at: resetAt,
}, "archive_manifest_digest");
const newJournalMetaValue = sealed({
  contract_version: "gkos-watcher-journal-meta/1.0.0-draft.1", journal_instance_id: newJournalId, vault_id: "phase5-watcher-convergence-v1",
  configuration_digest: samplePlan.watcher.configuration_digest, policy_digest: samplePlan.watcher.policy_digest,
  effective_profile_digest: EFFECTIVE_PROFILE_DIGEST, anchor_coherent_manifest_digest: coherentManifestValue.coherent_manifest_digest, created_at: resetAt,
}, "meta_digest");
const newJournalGenerationValue = sealed({
  contract_version: "gkos-watcher-journal-generation/1.0.0-draft.1", journal_instance_id: newJournalId,
  directory_leaf: `journal-${newJournalId}`, database_file: "watcher-journal.sqlite", meta_digest: newJournalMetaValue.meta_digest,
  anchor_coherent_manifest_digest: coherentManifestValue.coherent_manifest_digest, created_at: resetAt,
}, "journal_generation_digest");
const targetJournalPointerValue = sealed({
  contract_version: "gkos-watcher-journal-active-pointer/1.0.0-draft.1", kind: "watcher_journal",
  journal_generation_file: `watcher-journal-generation-${newJournalGenerationValue.journal_generation_digest.slice(7)}.json`,
  journal_generation_digest: newJournalGenerationValue.journal_generation_digest, prior_pointer_digest: journalPointerValue.pointer_digest,
}, "pointer_digest");
const resetValue = sealed({
  contract_version: "gkos-watcher-journal-reset/1.0.0-draft.1", reset_id: resetId,
  prior_journal_generation_digest: journalGenerationValue.journal_generation_digest, archive_manifest_digest: archiveValue.archive_manifest_digest,
  new_journal_meta_digest: newJournalMetaValue.meta_digest, new_journal_generation_digest: newJournalGenerationValue.journal_generation_digest,
  target_journal_pointer_digest: targetJournalPointerValue.pointer_digest, outer_coherent_manifest_digest: coherentManifestValue.coherent_manifest_digest,
  ready_event_count: 1, reset_carry_event_set_digest: carrySetValue.event_set_digest,
  reset_carry_activation_digest: carryActivationValue.activation_digest, reset_at: resetAt,
}, "reset_digest");
const pointerBytes = Buffer.from(pretty(pointerValue));
const pointerGuardValue = sealed({
  contract_version: "gkos-watcher-pointer-replace-guard/1.0.0-draft.1", operation: "replace_watcher_active_pointer",
  owner_nonce: "0123456789abcdef0123456789abcdef", parent_device: "1", parent_inode: "2", parent_mode: 448,
  final_basename: "watcher-active.json", guard_basename: ".watcher-active.json.gkos-watcher.guard",
  guard_stage_basename: ".watcher-active.json.gkos-watcher.guard-stage", temp_basename: ".watcher-active.json.gkos-watcher.tmp",
  old_pointer_file: `watcher-pointer-${D("4").slice(7)}.json`, old_pointer_digest: D("4"), old_pointer_raw_sha256: D("5"), old_pointer_byte_size: 256,
  old_final_device: "1", old_final_inode: "3", new_pointer_file: `watcher-pointer-${pointerValue.pointer_digest.slice(7)}.json`,
  new_pointer_digest: pointerValue.pointer_digest, new_pointer_raw_sha256: sha(pointerBytes), new_pointer_byte_size: pointerBytes.length,
  operation_intent_digest: intentValue.intent_digest, target_commit_digest: transitions[6].transition_digest,
}, "guard_digest");
const pointerGuardBytes = Buffer.from(pretty(pointerGuardValue));
const pointerLeaf = (basename, device, inode, nlink, semantic_digest, raw_sha256, byte_size, body_class = "canonical_exact", capability_state = "exact_owned_regular_direct_nonalias_stable") => ({
  basename, device, inode, mode: 384, nlink, body_class,
  semantic_digest: body_class === "incomplete_noncanonical" ? null : semantic_digest,
  raw_sha256: body_class === "incomplete_noncanonical" ? null : raw_sha256,
  byte_size: body_class === "incomplete_noncanonical" ? null : byte_size,
  capability_state,
});
const pointerRecoveryRecipeValue = {
  namespace_kind: "outer", parent: { device: "1", inode: "2", mode: 448, capability_state: "exact_owned_directory_nonalias_stable" },
  stage: null,
  guard: pointerLeaf(pointerGuardValue.guard_basename, "1", "10", 1, pointerGuardValue.guard_digest, sha(pointerGuardBytes), pointerGuardBytes.length),
  temp: null,
  fixed: pointerLeaf(pointerGuardValue.final_basename, pointerGuardValue.old_final_device, pointerGuardValue.old_final_inode, 1, pointerGuardValue.old_pointer_digest, pointerGuardValue.old_pointer_raw_sha256, pointerGuardValue.old_pointer_byte_size),
  old_artifact: pointerLeaf(pointerGuardValue.old_pointer_file, "1", "11", 1, pointerGuardValue.old_pointer_digest, pointerGuardValue.old_pointer_raw_sha256, pointerGuardValue.old_pointer_byte_size),
  new_artifact: pointerLeaf(pointerGuardValue.new_pointer_file, "1", "12", 1, pointerGuardValue.new_pointer_digest, pointerGuardValue.new_pointer_raw_sha256, pointerGuardValue.new_pointer_byte_size),
  committed_target_state: "prepared",
};
const pointerRecoveryDecisionValue = sealed({
  contract_version: "gkos-watcher-pointer-recovery-decision/1.0.0-draft.1", selected_action: "create_temp",
  reader_authority: "guard_bound_old", reader_pointer_digest: pointerGuardValue.old_pointer_digest, evidence_disposition: "continue",
}, "decision_digest");
const pointerDecisionValue = (selected_action, reader_authority, reader_pointer_digest, evidence_disposition) => sealed({
  contract_version: "gkos-watcher-pointer-recovery-decision/1.0.0-draft.1",
  selected_action, reader_authority, reader_pointer_digest, evidence_disposition,
}, "decision_digest");
const pointerGuardLeaf = (device = "1", inode = "10", nlink = 1) => pointerLeaf(
  pointerGuardValue.guard_basename, device, inode, nlink,
  pointerGuardValue.guard_digest, sha(pointerGuardBytes), pointerGuardBytes.length,
);
const pointerStageLeaf = (device = "1", inode = "20", nlink = 1, bodyClass = "canonical_exact") => pointerLeaf(
  pointerGuardValue.guard_stage_basename, device, inode, nlink,
  pointerGuardValue.guard_digest, sha(pointerGuardBytes), pointerGuardBytes.length, bodyClass,
);
const pointerTempLeaf = (bodyClass = "canonical_exact") => pointerLeaf(
  pointerGuardValue.temp_basename, "1", "21", 1,
  pointerGuardValue.new_pointer_digest, pointerGuardValue.new_pointer_raw_sha256, pointerGuardValue.new_pointer_byte_size, bodyClass,
);
const pointerFixedNewLeaf = () => pointerLeaf(
  pointerGuardValue.final_basename, "1", "22", 1,
  pointerGuardValue.new_pointer_digest, pointerGuardValue.new_pointer_raw_sha256, pointerGuardValue.new_pointer_byte_size,
);
const genesisPointerValue = sealed({
  ...Object.fromEntries(Object.entries(pointerValue).filter(([key]) => key !== "pointer_digest")),
  prior_pointer_digest: null,
}, "pointer_digest");
const genesisIntentValue = sealed({
  ...Object.fromEntries(Object.entries(intentValue).filter(([key]) => key !== "intent_digest")),
  prior_pointer_digest: null,
  target_pointer: genesisPointerValue,
}, "intent_digest");
const genesisPointerBytes = Buffer.from(pretty(genesisPointerValue));
const genesisPointerGuardValue = sealed({
  ...Object.fromEntries(Object.entries(pointerGuardValue).filter(([key]) => ![
    "guard_digest", "old_pointer_file", "old_pointer_digest", "old_pointer_raw_sha256", "old_pointer_byte_size", "old_final_device", "old_final_inode",
    "new_pointer_file", "new_pointer_digest", "new_pointer_raw_sha256", "new_pointer_byte_size", "operation_intent_digest",
  ].includes(key))),
  old_pointer_file: null,
  old_pointer_digest: null,
  old_pointer_raw_sha256: null,
  old_pointer_byte_size: null,
  old_final_device: null,
  old_final_inode: null,
  new_pointer_file: `watcher-pointer-${genesisPointerValue.pointer_digest.slice(7)}.json`,
  new_pointer_digest: genesisPointerValue.pointer_digest,
  new_pointer_raw_sha256: sha(genesisPointerBytes),
  new_pointer_byte_size: genesisPointerBytes.length,
  operation_intent_digest: genesisIntentValue.intent_digest,
}, "guard_digest");
const genesisPointerGuardBytes = Buffer.from(pretty(genesisPointerGuardValue));
const genesisGuardLeaf = (device = "1", inode = "10", nlink = 1, bodyClass = "canonical_exact") => pointerLeaf(
  genesisPointerGuardValue.guard_basename, device, inode, nlink,
  genesisPointerGuardValue.guard_digest, sha(genesisPointerGuardBytes), genesisPointerGuardBytes.length, bodyClass,
);
const genesisStageLeaf = (device = "1", inode = "20", nlink = 1, bodyClass = "canonical_exact") => pointerLeaf(
  genesisPointerGuardValue.guard_stage_basename, device, inode, nlink,
  genesisPointerGuardValue.guard_digest, sha(genesisPointerGuardBytes), genesisPointerGuardBytes.length, bodyClass,
);
const genesisTempLeaf = (bodyClass = "canonical_exact") => pointerLeaf(
  genesisPointerGuardValue.temp_basename, "1", "21", 1,
  genesisPointerGuardValue.new_pointer_digest, genesisPointerGuardValue.new_pointer_raw_sha256, genesisPointerGuardValue.new_pointer_byte_size, bodyClass,
);
const genesisFixedNewLeaf = () => pointerLeaf(
  genesisPointerGuardValue.final_basename, "1", "22", 1,
  genesisPointerGuardValue.new_pointer_digest, genesisPointerGuardValue.new_pointer_raw_sha256, genesisPointerGuardValue.new_pointer_byte_size,
);
const genesisNewArtifactLeaf = () => pointerLeaf(
  genesisPointerGuardValue.new_pointer_file, "1", "12", 1,
  genesisPointerGuardValue.new_pointer_digest, genesisPointerGuardValue.new_pointer_raw_sha256, genesisPointerGuardValue.new_pointer_byte_size,
);
const genesisRecipe = (committed_target_state, changes = {}) => ({
  namespace_kind: "outer",
  parent: { device: "1", inode: "2", mode: 448, capability_state: "exact_owned_directory_nonalias_stable" },
  stage: null,
  guard: null,
  temp: null,
  fixed: null,
  old_artifact: null,
  new_artifact: genesisNewArtifactLeaf(),
  committed_target_state,
  ...changes,
});
const resetGuardValue = sealed({
  contract_version: "gkos-watcher-journal-reset-guard/1.0.0-draft.1", operation: "watcher_journal_reset",
  owner_nonce: "fedcba9876543210fedcba9876543210", parent_device: "1", parent_inode: "2", parent_mode: 448,
  guard_basename: ".gkos-watcher-journal-reset.guard", guard_stage_basename: ".gkos-watcher-journal-reset.guard-stage",
  old_journal_pointer_digest: journalPointerValue.pointer_digest,
  old_journal_generation_digest: journalGenerationValue.journal_generation_digest,
  outer_coherent_manifest_digest: coherentManifestValue.coherent_manifest_digest, archive_manifest_digest: archiveValue.archive_manifest_digest,
  new_journal_instance_id: newJournalId, new_journal_directory_leaf: `journal-${newJournalId}`,
  new_journal_meta_digest: newJournalMetaValue.meta_digest, new_journal_generation_digest: newJournalGenerationValue.journal_generation_digest,
  reset_digest: resetValue.reset_digest, target_journal_pointer_digest: targetJournalPointerValue.pointer_digest,
  ready_event_count: 1, reset_carry_event_set_digest: carrySetValue.event_set_digest,
  reset_carry_activation_digest: carryActivationValue.activation_digest,
}, "guard_digest");
const oldJournalPointerBytes = Buffer.from(pretty(journalPointerValue));
const targetJournalPointerBytes = Buffer.from(pretty(targetJournalPointerValue));
const journalPointerGuardValue = sealed({
  contract_version: "gkos-watcher-pointer-replace-guard/1.0.0-draft.1", operation: "replace_watcher_journal_pointer",
  owner_nonce: "abcdef0123456789abcdef0123456789", parent_device: "1", parent_inode: "2", parent_mode: 448,
  final_basename: "watcher-journal-active.json", guard_basename: ".watcher-journal-active.json.gkos-watcher.guard",
  guard_stage_basename: ".watcher-journal-active.json.gkos-watcher.guard-stage", temp_basename: ".watcher-journal-active.json.gkos-watcher.tmp",
  old_pointer_file: `watcher-journal-pointer-${journalPointerValue.pointer_digest.slice(7)}.json`, old_pointer_digest: journalPointerValue.pointer_digest,
  old_pointer_raw_sha256: sha(oldJournalPointerBytes), old_pointer_byte_size: oldJournalPointerBytes.length, old_final_device: "1", old_final_inode: "5",
  new_pointer_file: `watcher-journal-pointer-${targetJournalPointerValue.pointer_digest.slice(7)}.json`, new_pointer_digest: targetJournalPointerValue.pointer_digest,
  new_pointer_raw_sha256: sha(targetJournalPointerBytes), new_pointer_byte_size: targetJournalPointerBytes.length,
  operation_intent_digest: resetGuardValue.guard_digest, target_commit_digest: resetValue.reset_digest,
}, "guard_digest");
const challengeValue = sealed({
  contract_version: "gkos-watcher-source-removal-adapter-challenge/1.0.0-draft.1", vault_id: adapterBindingValue.vault_id,
  configuration_digest: adapterBindingValue.configuration_digest, policy_digest: adapterBindingValue.policy_digest,
  nonce: "0123456789abcdef0123456789abcdef", required_capabilities: adapterBindingValue.capabilities,
}, "challenge_digest");
const proofValue = sealed({
  contract_version: "gkos-watcher-source-removal-adapter-proof/1.0.0-draft.1", challenge_digest: challengeValue.challenge_digest,
  binding_digest: adapterBindingValue.binding_digest, adapter_kind: adapterBindingValue.adapter_kind, adapter_id: adapterBindingValue.adapter_id,
  adapter_contract_version: adapterBindingValue.adapter_contract_version, authority_namespace: adapterBindingValue.authority_namespace,
  authorization_binding_digest: adapterBindingValue.authorization_binding_digest, capabilities: adapterBindingValue.capabilities,
}, "proof_digest");
const verificationValue = sealed({
  contract_version: "gkos-watcher-source-removal-adapter-verification/1.0.0-draft.1", binding_digest: adapterBindingValue.binding_digest,
  challenge_digest: challengeValue.challenge_digest, proof_digest: proofValue.proof_digest, process_instance_id: processId,
  verified_at: completed, capability_nonce_digest: D("a"),
}, "verification_receipt_digest");
const locatorValue = sealed({
  contract_version: "gkos-watcher-service-locator/1.0.0-draft.1", service_instance_id: processId, pid: 4_242,
  loopback_host: "127.0.0.1", port: 4317, status_route: "/status", control_route: "/control/shutdown", started_at: started,
}, "locator_digest");
const resetResultValue = sealed({
  contract_version: "gkos-watcher-journal-reset-result/1.0.0-draft.1", status: "reset",
  prior_journal_generation_digest: journalGenerationValue.journal_generation_digest, archive_manifest_digest: archiveValue.archive_manifest_digest,
  new_journal_generation_digest: newJournalGenerationValue.journal_generation_digest, outer_coherent_manifest_digest: coherentManifestValue.coherent_manifest_digest,
  reset_digest: resetValue.reset_digest, requires_reconciliation: true,
}, "result_digest");

const environmentValue = sealed({ contract_version: "gkos-watcher-observation-environment/1.0.0-draft.1", runtime: "node", runtime_version: "24.0.0", os: "linux", arch: "x64", sqlite_version: "3.50.0", physical_fts5_available: true, runner_class: "github_hosted" }, "environment_digest");
const ftsValue = sealed({ contract_version: "gkos-watcher-fts-qualification-outcome/1.0.0-draft.1", lane_kind: "reference", runtime_version: "24.0.0", os: "linux", arch: "x64", physical_fts5_available: true, status: "qualified", index_generation_count: 23, query_count: 22, provider_call_count: 0 }, "outcome_digest");
const convergenceValue = sealed({
  contract_version: "gkos-watcher-observation-convergence/1.0.0-draft.1",
  incremental_canonical_gkx_digest: D("d"), clean_canonical_gkx_digest: D("d"),
  incremental_retrieval_manifest_digest: D("e"), clean_retrieval_manifest_digest: D("e"),
  incremental_canonical_graph_digest: D("f"), clean_canonical_graph_digest: D("f"),
  incremental_graphiti_digest: D("0"), clean_graphiti_digest: D("0"), all_equal: true,
}, "convergence_digest");
const samples = Array.from({ length: 20 }, (_, index) => 500_000 + index * 1_000);
const measurementValue = sealed({
  contract_version: "gkos-watcher-observation-measurement/1.0.0-draft.1", status: "qualified", failure_codes: [], sample_plan_digest: SAMPLE_PLAN_DIGEST,
  environment: environmentValue, fts_qualification: ftsValue, edit_latency_micros: samples,
  percentiles_micros: { p50: samples[9], p95: samples[18], p99: samples[19], max: samples[19] },
  source_work: { initial_generation_count: 1, mutation_generation_count: 22, total_generation_count: 23, query_count: 22, reparsed_source_count: 22 },
  embedding_work: { provider_call_count: 0, provider_item_count: 0, unchanged_chunk_reembedded_count: 0 }, convergence: convergenceValue,
}, "measurement_digest");
const unavailableEnvironmentValue = resealed(environmentValue, "environment_digest", { physical_fts5_available: false });
const unavailableFtsValue = sealed({
  contract_version: "gkos-watcher-fts-qualification-outcome/1.0.0-draft.1", lane_kind: "matrix",
  runtime_version: unavailableEnvironmentValue.runtime_version, os: unavailableEnvironmentValue.os,
  arch: unavailableEnvironmentValue.arch, physical_fts5_available: false, status: "unavailable",
  index_generation_count: 0, query_count: 0, provider_call_count: 0,
}, "outcome_digest");
const unavailableMeasurementValue = sealed({
  contract_version: "gkos-watcher-observation-measurement/1.0.0-draft.1", status: "unavailable",
  failure_codes: ["MEASURE_FTS_UNAVAILABLE"], sample_plan_digest: SAMPLE_PLAN_DIGEST,
  environment: unavailableEnvironmentValue, fts_qualification: unavailableFtsValue,
  edit_latency_micros: null, percentiles_micros: null, source_work: null, embedding_work: null, convergence: null,
}, "measurement_digest");
const failedMeasurementValue = sealed({
  contract_version: "gkos-watcher-observation-measurement/1.0.0-draft.1", status: "failed",
  failure_codes: ["MEASURE_CONVERGENCE_INVALID"], sample_plan_digest: SAMPLE_PLAN_DIGEST,
  environment: environmentValue, fts_qualification: ftsValue,
  edit_latency_micros: null, percentiles_micros: null, source_work: null, embedding_work: null, convergence: null,
}, "measurement_digest");

const schemaCases = [
  ["observation-valid", "batch.schema.json", observationValue], ["observation-authority-valid", "batch.schema.json", observationAuthorityValue],
  ["batch-record-valid", "batch.schema.json", batchValue], ["pre-scan-valid", "batch.schema.json", preScan],
  ["plan-valid", "batch.schema.json", planValue], ["plan-authority-valid", "batch.schema.json", planAuthorityValue],
  ["topology-valid", "topology.schema.json", topology],
  ["retrieval-state-valid", "transition.schema.json", retrievalState], ["graph-state-valid", "transition.schema.json", graphState], ["transition-valid", "transition.schema.json", transitions[6]],
  ["normalized-delta-valid", "transition.schema.json", normalizedDeltaValue],
  ["raw-graph-valid", "coherent-manifest.schema.json", rawGraphValue], ["manifest-valid", "coherent-manifest.schema.json", coherentManifestValue],
  ["pointer-valid", "coherent-manifest.schema.json", pointerValue], ["canonical-graph-valid", "coherent-manifest.schema.json", canonicalGraphValue],
  ["genesis-pointer-valid", "coherent-manifest.schema.json", genesisPointerValue],
  ["graphiti-valid", "coherent-manifest.schema.json", graphitiValue],
  ["journal-meta-valid", "journal.schema.json", journalMetaValue], ["new-journal-meta-valid", "journal.schema.json", newJournalMetaValue],
  ["activation-intent-valid", "journal.schema.json", intentValue], ["activation-outcome-valid", "journal.schema.json", outcomeValue], ["active-valid", "journal.schema.json", activeValue],
  ["genesis-activation-intent-valid", "journal.schema.json", genesisIntentValue],
  ["journal-generation-valid", "journal.schema.json", journalGenerationValue], ["new-journal-generation-valid", "journal.schema.json", newJournalGenerationValue],
  ["journal-pointer-valid", "journal.schema.json", journalPointerValue], ["target-journal-pointer-valid", "journal.schema.json", targetJournalPointerValue],
  ["journal-file-identity-valid", "journal.schema.json", databaseIdentityValue],
  ["journal-archive-valid", "journal.schema.json", archiveValue], ["journal-reset-valid", "journal.schema.json", resetValue],
  ["authority-valid", "authority.schema.json", authorityValue], ["pointer-guard-valid", "authority.schema.json", pointerGuardValue],
  ["genesis-pointer-guard-valid", "authority.schema.json", genesisPointerGuardValue],
  ["pointer-recovery-decision-valid", "authority.schema.json", pointerRecoveryDecisionValue],
  ["journal-pointer-guard-valid", "authority.schema.json", journalPointerGuardValue],
  ["reset-guard-valid", "authority.schema.json", resetGuardValue],
  ["status-valid", "status.schema.json", statusValue], ["locator-valid", "status.schema.json", locatorValue], ["reset-result-valid", "status.schema.json", resetResultValue],
  ["adapter-scope-valid", "source-removal.schema.json", adapterScopeValue], ["adapter-binding-valid", "source-removal.schema.json", adapterBindingValue],
  ["adapter-challenge-valid", "source-removal.schema.json", challengeValue], ["adapter-proof-valid", "source-removal.schema.json", proofValue],
  ["adapter-verification-valid", "source-removal.schema.json", verificationValue], ["occurrence-valid", "source-removal.schema.json", occurrenceValue],
  ["event-valid", "source-removal.schema.json", eventValue], ["membership-valid", "source-removal.schema.json", membershipValue], ["event-set-valid", "source-removal.schema.json", eventSetValue],
  ["event-set-activation-valid", "source-removal.schema.json", activationValue], ["request-valid", "source-removal.schema.json", requestValue],
  ["response-valid", "source-removal.schema.json", responseValue], ["receipt-valid", "source-removal.schema.json", receiptValue],
  ["sample-plan-valid", "sample-plan.schema.json", samplePlan], ["fts-outcome-valid", "sample-plan.schema.json", ftsValue],
  ["measurement-environment-valid", "sample-plan.schema.json", environmentValue], ["convergence-valid", "sample-plan.schema.json", convergenceValue],
  ["measurement-valid", "sample-plan.schema.json", measurementValue],
].map(([case_id, schema_file, value]) => ({ case_id, schema_file, expected_valid: true, value }));
for (const [baseId, schemaFile, value] of [
  ["observation-extra-key", "batch.schema.json", observationValue], ["transition-extra-key", "transition.schema.json", transitions[6]],
  ["source-removal-extra-key", "source-removal.schema.json", eventValue], ["measurement-extra-key", "sample-plan.schema.json", measurementValue],
]) schemaCases.push({ case_id: baseId, schema_file: schemaFile, expected_valid: false, value: { ...value, unexpected: true } });
for (const [case_id, schema_file, value] of [
  ["observation-overflow-scoped", "batch.schema.json", { ...observationValue, overflow: true }],
  ["failure-retry-missing-parent", "batch.schema.json", { ...retryBatchValue, retry_of_batch_id: null }],
  ["plan-zero-count-has-set", "batch.schema.json", { ...planValue, source_removal_event_count: 0 }],
  ["stage-not-started-has-coordinate", "transition.schema.json", { ...retrievalState, state: "not_started" }],
  ["exceptional-transition-before-observed", "transition.schema.json", { ...failedTransitionValue, transition_ordinal: 0, prior_transition_digest: null }],
  ["published-outcome-has-reason", "journal.schema.json", { ...outcomeValue, reason_codes: ["unexpected"] }],
  ["journal-database-zero-bytes", "journal.schema.json", { ...databaseIdentityValue, byte_size: 0 }],
  ["journal-reset-null-outer", "journal.schema.json", { ...resetValue, outer_coherent_manifest_digest: null }],
  ["journal-reset-carry-count-zero", "journal.schema.json", { ...resetValue, ready_event_count: 0 }],
  ["journal-pointer-guard-mixed-basename", "authority.schema.json", { ...journalPointerGuardValue, final_basename: "watcher-active.json" }],
  ["pointer-guard-leading-zero-device", "authority.schema.json", { ...pointerGuardValue, old_final_device: "01" }],
  ["pointer-guard-leading-zero-inode", "authority.schema.json", { ...pointerGuardValue, old_final_inode: "03" }],
  ["journal-pointer-guard-genesis-old-group", "authority.schema.json", {
    ...journalPointerGuardValue,
    old_pointer_file: null, old_pointer_digest: null, old_pointer_raw_sha256: null, old_pointer_byte_size: null,
    old_final_device: null, old_final_inode: null,
  }],
  ["retrieval-state-database-file-shape", "transition.schema.json", { ...retrievalState, database_file: "../../evil.sqlite" }],
  ["retrieval-state-projection-id-shape", "transition.schema.json", { ...retrievalState, projection_id: "not-phase3" }],
  ["graph-state-artifact-file-shape", "transition.schema.json", { ...graphState, graph_artifact_file: "watcher-graph-invalid.json" }],
  ["event-local-only-has-binding", "source-removal.schema.json", { ...eventValue, delivery_mode: "local_only" }],
  ["status-stale-without-reason", "status.schema.json", { ...statusValue, freshness: "stale" }],
  ["fts-unavailable-did-work", "sample-plan.schema.json", { ...ftsValue, physical_fts5_available: false, status: "unavailable" }],
  ["topology-source-size-phase3-cap-plus-one", "topology.schema.json", {
    ...priorTopology,
    accepted_sources: [{ ...accepted, source_size_bytes: 67_108_865 }],
  }],
  ["event-set-count-cap-plus-one", "source-removal.schema.json", { ...eventSetValue, event_count: 1_000_001 }],
]) schemaCases.push({ case_id, schema_file, expected_valid: false, value });

const semanticOperationMap = Object.freeze({
  seal_sample_plan: "seal_record", seal_transition_chain: "seal_transition_chain", seal_coherent_activation: "seal_coherent_activation_bundle",
  seal_failure_retry: "seal_failure_retry_bundle", seal_source_removal_event_set: "seal_source_removal_event_set_bundle",
  seal_journal_reset: "seal_journal_reset_bundle", seal_journal_reset_reconciliation_adoption: "seal_journal_reset_reconciliation_adoption_bundle",
  seal_source_removal_receipt: "seal_source_removal_receipt_bundle",
  seal_adapter_verification: "seal_source_removal_adapter_verification_bundle", seal_status_bundle: "seal_status_bundle", seal_record: "seal_record",
});
function semanticCase(case_id, requestedOperation, input, expectedError = null) {
  const operation = semanticOperationMap[requestedOperation] ?? requestedOperation;
  const args = requestedOperation === "seal_coherent_activation" ? [input, pointerGuardValue]
    : requestedOperation === "seal_journal_reset" ? [input.bundle, input.old_journal_authority, input.pointer_guard]
      : [input];
  const resultKind = operation === "seal_transition_chain" ? "record_array" : "record";
  const result = operation === "seal_journal_reset_bundle" ? args[0] : input;
  const outputDigest = expectedError === null ? digest({
    contract_version: "gkos-watcher-conformance-operation-result/1.0.0-draft.1", operation, result_kind: resultKind, result,
  }) : null;
  return {
    case_id, operation, input: { arguments: args },
    expectation: expectedError === null
      ? { accepted: true, output_digest: outputDigest, error_class: null, error_code: null }
      : { accepted: false, output_digest: null, error_class: "WatcherRecoveryContractError", error_code: expectedError },
  };
}
function semanticCaseWithResult(case_id, operation, args, result) {
  const resultKind = operation === "seal_transition_chain" ? "record_array" : operation.startsWith("validate_") ? "null" : "record";
  return {
    case_id, operation, input: { arguments: args },
    expectation: {
      accepted: true,
      output_digest: digest({ contract_version: "gkos-watcher-conformance-operation-result/1.0.0-draft.1", operation, result_kind: resultKind, result }),
      error_class: null, error_code: null,
    },
  };
}
function rejectingSemanticCase(case_id, operation, args, errorCode) {
  return { case_id, operation, input: { arguments: args }, expectation: { accepted: false, output_digest: null, error_class: "WatcherRecoveryContractError", error_code: errorCode } };
}
const coherentActivationValue = {
  batch: batchValue, observation: observationValue, observation_authority: observationAuthorityValue,
  pre_scan_state: preScan,
  plan: planValue, plan_authority: planAuthorityValue, topology, transitions,
  normalized_graph_delta: normalizedDeltaValue, canonical_graph: canonicalGraphValue, raw_graph: rawGraphValue,
  graphiti_projection: graphitiValue,
  manifest: coherentManifestValue, pointer: pointerValue, intent: intentValue, outcome: outcomeValue, active: activeValue,
  source_removal_activation: activationValue,
  source_removal_event_set_bundle: { event_set: eventSetValue, memberships: [membershipValue], prior_memberships: [null], events: [eventValue], prior_events: [null], occurrences: [occurrenceValue], prior_occurrences: [null] },
};

function eventTopology({ accepted_sources = [], rejected_sources = [], folder_paths = ["policy"], attachment_paths = ["assets/reference.png"] } = {}) {
  const material = {
    contract_version: "gkos-watcher-topology-snapshot/1.0.0-draft.1", vault_id: preScan.vault_id,
    source_observation_snapshot_digest: D("3"), validation_result_digest: D("c"), rejection_journal_digest: D("d"),
    accepted_sources, rejected_sources, folder_paths, attachment_paths,
    accepted_source_set_digest: digest({ contract_version: "gkos-watcher-accepted-source-set/1.0.0-draft.1", sources: accepted_sources }),
    rejected_source_set_digest: digest({ contract_version: "gkos-watcher-rejected-source-set/1.0.0-draft.1", sources: rejected_sources }),
    folder_set_digest: digest({ contract_version: "gkos-watcher-folder-set/1.0.0-draft.1", folder_paths }),
    attachment_set_digest: digest({ contract_version: "gkos-watcher-attachment-set/1.0.0-draft.1", attachment_paths }),
  };
  return sealed(material, "topology_snapshot_digest");
}

const eventAccepted = (source_path, source_digest = D("6"), source_id = sourceId, source_observation_ordinal = 0) => ({
  source_path, source_id, source_observation_ordinal, source_digest, source_size_bytes: 499, parser_descriptor_digest: D("2"),
});
const eventRejected = (source_path, source_digest = D("6"), source_id = sourceId, source_observation_ordinal = 0) => ({
  source_path, source_id, source_observation_ordinal, source_digest, source_size_bytes: 499, parser_descriptor_digest: D("2"),
  rejection_digest: D("b"), rejection_class: "validation",
});
const addMutation = (to_path, source_id_after = sourceId, source_digest_after = D("6"), cause = "physical_appearance") => ({
  kind: "add", cause, from_path: null, to_path, source_id_before: null, source_id_after,
  source_digest_before: null, source_digest_after, parser_descriptor_digest_before: null, parser_descriptor_digest_after: D("2"),
});
const deleteMutation = (from_path, source_id_before = sourceId, source_digest_before = D("1"), cause = "physical_disappearance") => ({
  kind: "delete", cause, from_path, to_path: null, source_id_before, source_id_after: null,
  source_digest_before, source_digest_after: null, parser_descriptor_digest_before: D("2"), parser_descriptor_digest_after: null,
});
const changeMutation = (path, source_digest_after = D("6"), cause = "content_change") => ({
  kind: "change", cause, from_path: path, to_path: path, source_id_before: sourceId, source_id_after: sourceId,
  source_digest_before: D("1"), source_digest_after, parser_descriptor_digest_before: D("2"), parser_descriptor_digest_after: D("2"),
});
const renameMutation = (from_path, to_path) => ({
  kind: "rename", cause: "verified_rename", from_path, to_path, source_id_before: sourceId, source_id_after: sourceId,
  source_digest_before: D("1"), source_digest_after: D("1"), parser_descriptor_digest_before: D("2"), parser_descriptor_digest_after: D("2"),
});
const mutationKey = (mutation) => `${mutation.from_path ?? mutation.to_path}\u0000${mutation.to_path ?? ""}\u0000${mutation.kind}\u0000${mutation.cause}`;

function buildEventActivation({
  observed_paths = ["policy/agent-writing.md"], unscoped = false, overflow = false, batch_kind = "event",
  target_topology = topology, mutations = planValue.intended_source_mutations,
  folder_set_changed = false, attachment_set_changed = false,
} = {}) {
  const intendedSourceMutations = clone(mutations).sort((left, right) => compare(mutationKey(left), mutationKey(right)));
  const localObservation = sealed({
    contract_version: "gkos-watcher-observation/1.0.0-draft.1", batch_id: batchId, batch_kind,
    observed_paths: observed_paths.slice().sort(compare), unscoped, overflow, started_at: started,
  }, "observation_digest");
  const localObservationBytes = Buffer.from(pretty(localObservation));
  const localObservationAuthority = sealed({
    contract_version: "gkos-watcher-observation-authority/1.0.0-draft.1", batch_id: batchId,
    observation_digest: localObservation.observation_digest,
    observation_artifact_file: `watcher-observation-${localObservation.observation_digest.slice(7)}.json`,
    observation_raw_sha256: sha(localObservationBytes), observation_byte_size: localObservationBytes.length,
    pre_scan_state_digest: preScanDigest, started_at: started,
  }, "authority_digest");
  const localBatch = sealed({
    contract_version: "gkos-watcher-batch-record/1.0.0-draft.1", batch_id: batchId, batch_kind,
    observation_authority_digest: localObservationAuthority.authority_digest, started_at: started,
    execution_kind: batch_kind === "startup_reconciliation" || batch_kind === "failure_reconciliation" || unscoped || overflow ? "set_files" : "apply_changes",
    retry_of_batch_id: batch_kind === "failure_reconciliation" ? retryBatchId : null,
  }, "batch_record_digest");
  const physicalRemovals = intendedSourceMutations.filter((mutation) => mutation.kind === "delete" && mutation.cause === "physical_disappearance");
  const occurrences = physicalRemovals.map((mutation) => sealed({
    contract_version: "gkos-watcher-source-removal-occurrence/1.0.0-draft.1", vault_id: preScan.vault_id,
    prior_coherent_manifest_digest: preScan.active_coherent_manifest_digest, prior_topology_snapshot_digest: preScan.topology_snapshot_digest,
    source_id: mutation.source_id_before, source_path: mutation.from_path, source_digest: mutation.source_digest_before, cause: "physical_disappearance",
  }, "occurrence_digest")).sort((left, right) => compare(`${left.source_path}\u0000${left.occurrence_digest}`, `${right.source_path}\u0000${right.occurrence_digest}`));
  const events = occurrences.map((occurrence) => sealed({
    contract_version: "gkos-watcher-source-removal-event/1.0.0-draft.1", occurrence_digest: occurrence.occurrence_digest,
    adapter_binding_digest: adapterBindingValue.binding_digest, delivery_mode: "adapter",
  }, "event_digest"));
  const memberships = occurrences.map((occurrence, index) => sealed({
    contract_version: "gkos-watcher-source-removal-event-membership/1.0.0-draft.1", event_ordinal: index + 1,
    event_digest: events[index].event_digest, causal_batch_id: batchId, target_topology_snapshot_digest: target_topology.topology_snapshot_digest,
    prepared_at: started, original_membership_digest: null,
  }, "membership_digest"));
  const localEventSet = memberships.length === 0 ? null : sealed({
    contract_version: "gkos-watcher-source-removal-event-set/1.0.0-draft.1", set_kind: "batch", origin_id: batchId,
    target_topology_snapshot_digest: target_topology.topology_snapshot_digest, event_count: memberships.length,
    membership_digest_sequence_digest: digest({
      contract_version: "gkos-watcher-source-removal-membership-sequence/1.0.0-draft.1",
      membership_digests: memberships.map((membership) => membership.membership_digest),
    }), prepared_at: started,
  }, "event_set_digest");
  const localPlan = sealed({
    contract_version: "gkos-watcher-batch-plan/1.0.0-draft.1", batch_id: batchId,
    observation_digest: localObservation.observation_digest, topology_snapshot_digest: target_topology.topology_snapshot_digest,
    effective_profile_digest: preScan.effective_profile_digest, validation_result_digest: target_topology.validation_result_digest,
    rejection_journal_digest: target_topology.rejection_journal_digest, intended_source_mutations: intendedSourceMutations,
    folder_set_changed, attachment_set_changed,
    mutation_set_digest: digest({
      contract_version: "gkos-watcher-mutation-set/1.0.0-draft.1", pre_scan_state_digest: preScanDigest,
      topology_snapshot_digest: target_topology.topology_snapshot_digest, intended_source_mutations: intendedSourceMutations,
      folder_set_changed, attachment_set_changed,
    }),
  }, "plan_digest");
  const localPlanBytes = Buffer.from(pretty(localPlan));
  const localPlanAuthority = sealed({
    contract_version: "gkos-watcher-plan-authority/1.0.0-draft.1", batch_id: batchId,
    observation_digest: localObservation.observation_digest, plan_digest: localPlan.plan_digest,
    plan_artifact_file: `watcher-plan-${localPlan.plan_digest.slice(7)}.json`, plan_raw_sha256: sha(localPlanBytes),
    plan_byte_size: localPlanBytes.length, target_topology_snapshot_digest: target_topology.topology_snapshot_digest,
    source_removal_event_count: memberships.length, source_removal_event_set_digest: localEventSet?.event_set_digest ?? null,
  }, "authority_digest");
  const addedNodes = intendedSourceMutations.filter((mutation) => mutation.kind === "add").map((mutation) => `file:${mutation.to_path}`).sort(compare);
  const removedNodes = intendedSourceMutations.filter((mutation) => mutation.kind === "delete").map((mutation) => `file:${mutation.from_path}`).sort(compare);
  const changedNodes = intendedSourceMutations.filter((mutation) => ["change", "rename"].includes(mutation.kind)).map((mutation) => `file:${mutation.to_path}`).sort(compare);
  const localNormalizedDelta = {
    contract_version: "gkos-watcher-normalized-graph-delta/1.0.0-draft.1",
    delta: { addedNodes, removedNodes, changedNodes, topologyChanged: folder_set_changed || attachment_set_changed || intendedSourceMutations.some((mutation) => mutation.kind !== "change"), reparsed: intendedSourceMutations.filter((mutation) => ["add", "change"].includes(mutation.kind)).length, fullRebuild: unscoped || overflow },
  };
  const localDeltaDigest = digest(localNormalizedDelta);
  const localGraphNodes = [
    ...target_topology.folder_paths.map((path) => ({ id: `folder:${path}`, kind: "folder", path, label: path.split("/").at(-1), area: path.split("/")[0], depth: path.split("/").length, tags: [], aliases: [], color: "#f8fafc", outgoing: 0, incoming: 0 })),
    ...target_topology.accepted_sources.map((source) => ({ id: `file:${source.source_path}`, kind: "file", path: source.source_path, label: source.source_path.split("/").at(-1).replace(/\.md$/u, ""), area: source.source_path.split("/")[0], depth: source.source_path.split("/").length, extension: "md", size: source.source_size_bytes, tags: [], aliases: [], color: "#f8fafc", outgoing: 0, incoming: 0 })),
  ].sort((left, right) => compare(`${left.id}\u0000${left.path}`, `${right.id}\u0000${right.path}`));
  const localRawGraphBody = {
    ...emptyRawGraph,
    nodes: localGraphNodes,
    stats: { ...emptyRawGraph.stats, files: target_topology.accepted_sources.length },
    diagnostics: { ...emptyRawGraph.diagnostics, notes: target_topology.accepted_sources.length, folders: target_topology.folder_paths.length, attachments: target_topology.attachment_paths.length },
  };
  const localRawGraph = sealed({
    contract_version: "gkos-watcher-raw-graph-artifact/1.0.0-draft.1", service_generation_id: generationId,
    topology_snapshot_digest: target_topology.topology_snapshot_digest, graph: localRawGraphBody,
  }, "graph_artifact_digest");
  const localCanonicalGraph = normalizeGeneratorGraph(localRawGraphBody);
  const localGraphiti = deriveGeneratorGraphiti(localRawGraphBody, preScan.vault_id);
  const localGraphState = {
    state: "ready", graph_contract_version: "gkos-watcher-canonical-gkx-graph/1.0.0-draft.1",
    graph_artifact_file: `watcher-graph-${localRawGraph.graph_artifact_digest.slice(7)}.json`, graph_artifact_digest: localRawGraph.graph_artifact_digest,
    canonical_graph_digest: digest(localCanonicalGraph), gkx_delta_digest: localDeltaDigest,
    graphiti_projection_digest: digest(localGraphiti), sink_state: "not_applicable", sink_receipts: [], reason_codes: [],
  };
  const localTransitions = [];
  for (let index = 0; index < normalStates.length; index++) {
    localTransitions.push(sealed({
      contract_version: "gkos-watcher-transition/1.0.0-draft.1", batch_id: batchId, transition_ordinal: index,
      state: normalStates[index], last_reached_state: normalStates[index], terminal_state: index === 6 ? "complete" : "open",
      observation_digest: localObservation.observation_digest, plan_digest: index === 0 ? null : localPlan.plan_digest,
      prior_transition_digest: index === 0 ? null : localTransitions[index - 1].transition_digest,
      gkx_delta_digest: index < 2 ? null : localDeltaDigest, gkx_snapshot_digest: index < 2 ? null : D("e"),
      retrieval_projection_state: index < 3 ? notStartedRetrievalState : retrievalState,
      graph_projection_state: index < 4 ? notStartedGraphState : localGraphState,
      reason_codes: [], recorded_at: started, completed_at: index === 6 ? completed : null,
    }, "transition_digest"));
  }
  const localTopologyBytes = Buffer.from(pretty(target_topology));
  const localManifest = sealed({
    contract_version: "gkos-watcher-coherent-manifest/1.0.0-draft.1", service_generation_id: generationId,
    vault_id: preScan.vault_id, completed_batch_id: batchId, completed_transition_digest: localTransitions[6].transition_digest,
    topology_snapshot_digest: target_topology.topology_snapshot_digest,
    topology_artifact_file: `watcher-topology-${target_topology.topology_snapshot_digest.slice(7)}.json`,
    topology_artifact_raw_sha256: sha(localTopologyBytes), source_observation_snapshot_digest: target_topology.source_observation_snapshot_digest,
    effective_profile_digest: preScan.effective_profile_digest, validation_result_digest: target_topology.validation_result_digest,
    rejection_journal_digest: target_topology.rejection_journal_digest, configuration_digest: preScan.configuration_digest,
    policy_digest: preScan.policy_digest, gkx_snapshot_digest: D("e"), retrieval_projection_state: retrievalState,
    graph_projection_state: localGraphState, source_removal_event_count: memberships.length,
    source_removal_event_set_digest: localEventSet?.event_set_digest ?? null, created_at: completed,
  }, "coherent_manifest_digest");
  const localPointer = sealed({
    contract_version: "gkos-watcher-active-pointer/1.0.0-draft.1", kind: "watcher_coherent", service_generation_id: generationId,
    coherent_manifest_file: `watcher-coherent-${localManifest.coherent_manifest_digest.slice(7)}.json`,
    coherent_manifest_digest: localManifest.coherent_manifest_digest, prior_pointer_digest: preScan.active_pointer_digest,
  }, "pointer_digest");
  const localIntent = sealed({
    contract_version: "gkos-watcher-activation-intent/1.0.0-draft.1", prepared_transition_digest: localTransitions[5].transition_digest,
    coherent_manifest_digest: localManifest.coherent_manifest_digest, prior_pointer_digest: preScan.active_pointer_digest,
    target_pointer: localPointer, target_complete_transition: localTransitions[6], prepared_at: completed,
  }, "intent_digest");
  const localOutcome = sealed({
    contract_version: "gkos-watcher-activation-outcome/1.0.0-draft.1", intent_digest: localIntent.intent_digest,
    coherent_manifest_digest: localManifest.coherent_manifest_digest, outcome: "published", pointer_digest: localPointer.pointer_digest,
    reason_codes: [], recorded_at: completed,
  }, "outcome_digest");
  const localActive = sealed({
    contract_version: "gkos-watcher-active-coherent/1.0.0-draft.1", service_generation_id: generationId,
    coherent_manifest_digest: localManifest.coherent_manifest_digest, pointer_digest: localPointer.pointer_digest,
    intent_digest: localIntent.intent_digest, activated_at: completed,
  }, "active_digest");
  const localRemovalActivation = localEventSet === null ? null : sealed({
    contract_version: "gkos-watcher-source-removal-event-set-activation/1.0.0-draft.1", event_set_digest: localEventSet.event_set_digest,
    coherent_manifest_digest: localManifest.coherent_manifest_digest, activated_at: completed,
  }, "activation_digest");
  const localPointerBytes = Buffer.from(pretty(localPointer));
  const localGuard = sealed({
    ...Object.fromEntries(Object.entries(pointerGuardValue).filter(([key]) => key !== "guard_digest")),
    new_pointer_file: `watcher-pointer-${localPointer.pointer_digest.slice(7)}.json`, new_pointer_digest: localPointer.pointer_digest,
    new_pointer_raw_sha256: sha(localPointerBytes), new_pointer_byte_size: localPointerBytes.length,
    operation_intent_digest: localIntent.intent_digest, target_commit_digest: localTransitions[6].transition_digest,
  }, "guard_digest");
  return {
    bundle: {
      batch: localBatch, observation: localObservation, observation_authority: localObservationAuthority, pre_scan_state: preScan,
      plan: localPlan, plan_authority: localPlanAuthority, topology: target_topology, transitions: localTransitions,
      normalized_graph_delta: localNormalizedDelta, canonical_graph: localCanonicalGraph, raw_graph: localRawGraph,
      graphiti_projection: localGraphiti, manifest: localManifest, pointer: localPointer, intent: localIntent,
      outcome: localOutcome, active: localActive,
      source_removal_event_set_bundle: localEventSet === null ? null : {
        event_set: localEventSet, memberships, prior_memberships: memberships.map(() => null), events,
        prior_events: events.map(() => null), occurrences, prior_occurrences: occurrences.map(() => null),
      },
      source_removal_activation: localRemovalActivation,
    },
    guard: localGuard,
  };
}
const carryBundleValue = {
  event_set: carrySetValue, memberships: [carryMembershipValue], prior_memberships: [membershipValue],
  events: [eventValue], prior_events: [eventValue], occurrences: [occurrenceValue], prior_occurrences: [occurrenceValue],
};
const secondCarryMembershipValue = sealed({
  ...Object.fromEntries(Object.entries(carryMembershipValue).filter(([key]) => key !== "membership_digest")),
  original_membership_digest: carryMembershipValue.membership_digest,
}, "membership_digest");
const secondCarrySetValue = sealed({
  contract_version: "gkos-watcher-source-removal-event-set/1.0.0-draft.1", set_kind: "reset_carry",
  origin_id: "019b2d14-4238-7db7-87d4-7d81cfaec932", target_topology_snapshot_digest: null, event_count: 1,
  membership_digest_sequence_digest: digest({
    contract_version: "gkos-watcher-source-removal-membership-sequence/1.0.0-draft.1",
    membership_digests: [secondCarryMembershipValue.membership_digest],
  }),
  prepared_at: completed,
}, "event_set_digest");
const secondCarryBundleValue = {
  event_set: secondCarrySetValue, memberships: [secondCarryMembershipValue], prior_memberships: [carryMembershipValue],
  events: [eventValue], prior_events: [eventValue], occurrences: [occurrenceValue], prior_occurrences: [occurrenceValue],
};
const shortcutMembershipValue = resealed(secondCarryMembershipValue, "membership_digest", {
  original_membership_digest: membershipValue.membership_digest,
});
const shortcutCarrySetValue = resealed(secondCarrySetValue, "event_set_digest", {
  membership_digest_sequence_digest: digest({
    contract_version: "gkos-watcher-source-removal-membership-sequence/1.0.0-draft.1",
    membership_digests: [shortcutMembershipValue.membership_digest],
  }),
});
const shortcutCarryBundleValue = {
  ...secondCarryBundleValue, event_set: shortcutCarrySetValue, memberships: [shortcutMembershipValue],
};
const eventSetBundleValue = {
  event_set: eventSetValue, memberships: [membershipValue], prior_memberships: [null],
  events: [eventValue], prior_events: [null], occurrences: [occurrenceValue], prior_occurrences: [null],
};
const bootstrapHostLockValue = sealed({
  contract_version: "gkos-watcher-host-lock/1.0.0-draft.1", lock_id: "019b2d14-422f-7db7-87d4-7d81cfaec932",
  process_id: 4242, operation: "service", service_instance_id: "019b2d14-4233-7db7-87d4-7d81cfaec932",
  prior_pointer_digest: null, prior_coherent_manifest_digest: null, prior_journal_pointer_digest: null,
  owner_nonce: "0123456789abcdef0123456789abcdef", created_at: started,
}, "lock_digest");
const bootstrapPlannedTargetValue = sealed({
  contract_version: "gkos-watcher-journal-bootstrap-planned-target/1.0.0-draft.1",
  watcher_host_lock_digest: bootstrapHostLockValue.lock_digest, journal_meta: journalMetaValue,
  journal_generation: journalGenerationValue, target_journal_pointer: journalPointerValue,
}, "planned_target_digest");
const bootstrapPlannedTargetBytes = Buffer.from(pretty(bootstrapPlannedTargetValue));
const bootstrapPlannedTargetRefValue = {
  planned_target_file: `watcher-journal-bootstrap-planned-target-${bootstrapPlannedTargetValue.planned_target_digest.slice(7)}.json`,
  planned_target_digest: bootstrapPlannedTargetValue.planned_target_digest,
  planned_target_raw_sha256: sha(bootstrapPlannedTargetBytes), planned_target_byte_size: bootstrapPlannedTargetBytes.length,
  watcher_host_lock_digest: bootstrapHostLockValue.lock_digest,
};
const bootstrapHostLockWitnessValue = sealed({
  contract_version: "gkos-watcher-journal-bootstrap-host-lock-witness/1.0.0-draft.2",
  watcher_host_lock: bootstrapHostLockValue, watcher_host_lock_digest: bootstrapHostLockValue.lock_digest,
  planned_target: bootstrapPlannedTargetRefValue, journal_instance_id: journalMetaValue.journal_instance_id,
  journal_meta_digest: journalMetaValue.meta_digest, journal_generation_digest: journalGenerationValue.journal_generation_digest,
  target_journal_pointer_digest: journalPointerValue.pointer_digest,
}, "witness_digest");
const bootstrapWitnessBytes = Buffer.from(pretty(bootstrapHostLockWitnessValue));
const bootstrapHostLockWitnessRefValue = {
  witness_file: `watcher-journal-bootstrap-host-lock-${bootstrapHostLockWitnessValue.witness_digest.slice(7)}.json`,
  witness_digest: bootstrapHostLockWitnessValue.witness_digest,
  witness_raw_sha256: sha(bootstrapWitnessBytes),
  witness_byte_size: bootstrapWitnessBytes.length,
  watcher_host_lock_digest: bootstrapHostLockValue.lock_digest,
};
const journalBootstrapAuthorityValue = sealed({
  contract_version: "gkos-watcher-journal-bootstrap-authority/1.0.0-draft.2",
  host_lock_witness: bootstrapHostLockWitnessRefValue,
  journal_meta_digest: journalMetaValue.meta_digest,
  journal_generation_digest: journalGenerationValue.journal_generation_digest,
  journal_generation_file: journalPointerValue.journal_generation_file,
  target_journal_pointer_digest: journalPointerValue.pointer_digest,
  target_journal_pointer_file: `watcher-journal-pointer-${journalPointerValue.pointer_digest.slice(7)}.json`,
  committed_at: completed,
}, "authority_digest");
const oldJournalReadyAuthorityValue = {
  journal_bootstrap_authority: journalBootstrapAuthorityValue,
  outer_pointer: pointerValue,
  outer_coherent_manifest: coherentManifestValue,
  active_coherent: activeValue,
  activated_event_set_bundles: [{
    event_set_bundle: { event_set: eventSetValue, memberships: [membershipValue], prior_memberships: [null], events: [eventValue], prior_events: [null], occurrences: [occurrenceValue], prior_occurrences: [null] },
    activation: activationValue,
  }],
  responses: [],
  receipts: [],
};
const resetCarryBundleValue = { event_set_bundle: carryBundleValue, activation: carryActivationValue };
const journalResetBundleValue = {
  old_meta: journalMetaValue, old_generation: journalGenerationValue, old_pointer: journalPointerValue, archive: archiveValue,
  reset: resetValue, guard: resetGuardValue, new_meta: newJournalMetaValue, new_generation: newJournalGenerationValue,
  target_pointer: targetJournalPointerValue, reset_carry_bundle: resetCarryBundleValue,
};
const resetHostLockValue = sealed({
  contract_version: "gkos-watcher-host-lock/1.0.0-draft.1", lock_id: "019b2d14-423a-7db7-87d4-7d81cfaec932",
  process_id: 4242, operation: "journal_reset", service_instance_id: null,
  prior_pointer_digest: pointerValue.pointer_digest,
  prior_coherent_manifest_digest: coherentManifestValue.coherent_manifest_digest,
  prior_journal_pointer_digest: journalPointerValue.pointer_digest,
  owner_nonce: "fedcba9876543210fedcba9876543210", created_at: started,
}, "lock_digest");
const journalResetRecoveryPlanValue = sealed({
  contract_version: "gkos-watcher-journal-reset-recovery-plan/1.0.0-draft.1",
  watcher_host_lock: resetHostLockValue,
  old_meta: journalMetaValue, old_generation: journalGenerationValue, old_pointer: journalPointerValue,
  outer_pointer: pointerValue, outer_coherent_manifest: coherentManifestValue,
  old_journal_authority: oldJournalReadyAuthorityValue,
  archive: archiveValue, reset: resetValue, reset_guard: resetGuardValue, pointer_replace_guard: journalPointerGuardValue,
  new_meta: newJournalMetaValue, new_generation: newJournalGenerationValue, target_pointer: targetJournalPointerValue,
  reset_carry_bundle: resetCarryBundleValue,
}, "plan_digest");
schemaCases.push({ case_id: "journal-reset-recovery-plan-valid", schema_file: "journal.schema.json", expected_valid: true,
  value: journalResetRecoveryPlanValue });
const historicalAnchorDigest = D("7");
const anchoredOldMetaValue = resealed(journalMetaValue, "meta_digest", {
  anchor_coherent_manifest_digest: historicalAnchorDigest,
});
const anchoredOldGenerationValue = resealed(journalGenerationValue, "journal_generation_digest", {
  meta_digest: anchoredOldMetaValue.meta_digest,
  anchor_coherent_manifest_digest: historicalAnchorDigest,
});
const anchoredOldPointerValue = resealed(journalPointerValue, "pointer_digest", {
  journal_generation_file: `watcher-journal-generation-${anchoredOldGenerationValue.journal_generation_digest.slice(7)}.json`,
  journal_generation_digest: anchoredOldGenerationValue.journal_generation_digest,
  prior_pointer_digest: D("6"),
});
const anchoredTargetPointerValue = resealed(targetJournalPointerValue, "pointer_digest", {
  prior_pointer_digest: anchoredOldPointerValue.pointer_digest,
});
const anchoredResetValue = resealed(resetValue, "reset_digest", {
  prior_journal_generation_digest: anchoredOldGenerationValue.journal_generation_digest,
  target_journal_pointer_digest: anchoredTargetPointerValue.pointer_digest,
});
const anchoredResetGuardValue = resealed(resetGuardValue, "guard_digest", {
  old_journal_pointer_digest: anchoredOldPointerValue.pointer_digest,
  old_journal_generation_digest: anchoredOldGenerationValue.journal_generation_digest,
  reset_digest: anchoredResetValue.reset_digest,
  target_journal_pointer_digest: anchoredTargetPointerValue.pointer_digest,
});
const anchoredOldPointerBytes = Buffer.from(pretty(anchoredOldPointerValue));
const anchoredTargetPointerBytes = Buffer.from(pretty(anchoredTargetPointerValue));
const anchoredJournalPointerGuardValue = resealed(journalPointerGuardValue, "guard_digest", {
  old_pointer_file: `watcher-journal-pointer-${anchoredOldPointerValue.pointer_digest.slice(7)}.json`,
  old_pointer_digest: anchoredOldPointerValue.pointer_digest,
  old_pointer_raw_sha256: sha(anchoredOldPointerBytes),
  old_pointer_byte_size: anchoredOldPointerBytes.length,
  new_pointer_file: `watcher-journal-pointer-${anchoredTargetPointerValue.pointer_digest.slice(7)}.json`,
  new_pointer_digest: anchoredTargetPointerValue.pointer_digest,
  new_pointer_raw_sha256: sha(anchoredTargetPointerBytes),
  new_pointer_byte_size: anchoredTargetPointerBytes.length,
  operation_intent_digest: anchoredResetGuardValue.guard_digest,
  target_commit_digest: anchoredResetValue.reset_digest,
});
const anchoredJournalResetBundleValue = {
  ...journalResetBundleValue,
  old_meta: anchoredOldMetaValue,
  old_generation: anchoredOldGenerationValue,
  old_pointer: anchoredOldPointerValue,
  reset: anchoredResetValue,
  guard: anchoredResetGuardValue,
  target_pointer: anchoredTargetPointerValue,
};
const anchoredOldJournalAuthorityValue = {
  ...oldJournalReadyAuthorityValue,
  journal_bootstrap_authority: null,
};

// Exact unchanged-reset adoption authority. This is deliberately separate
// from the ordinary semantic batch fixture, whose no-op rejection remains
// frozen.
const adoptionBatchId = "019b2d14-4239-7db7-87d4-7d81cfaec932";
const adoptionValidationResult = { status: "accepted" };
const adoptionTopology = sealed({
  ...Object.fromEntries(Object.entries(topology).filter(([key]) => key !== "topology_snapshot_digest")),
  validation_result_digest: digest(adoptionValidationResult),
}, "topology_snapshot_digest");
const adoptionRetrievalManifestBase = {
  contract_version: "gkos-retrieval/1.0.0-draft.2", projection_schema_version: 3,
  provenance_contract_version: "gkos-retrieval-provenance/1.0.0-draft.1",
  gkx_standard_commit: "a2a2a6ca5c4dac32c6d9dc985ed7460f5f4350c6",
  gkx_projection_profile: "gkx-2.3-validating-projection", engine_version: "2.1.2",
  vault_id: adoptionTopology.vault_id, source_snapshot_digest: adoptionTopology.source_observation_snapshot_digest,
  configuration_digest: samplePlan.watcher.configuration_digest, policy_digest: samplePlan.watcher.policy_digest,
  chunker_version: "gkos-heading-chunker/1", tokenizer_version: "gkos-ascii-whitespace/1", lexical_backend: "sqlite_fts5",
  embedding_provider_id: null, embedding_model_id: null, embedding_dimensions: null,
  candidate_source_count: 0, candidate_declaration_count: 0, represented_candidate_source_count: 0,
  candidate_chunk_count: 0, embedding_eligible_candidate_chunk_count: 0,
};
const adoptionRetrievalProjectionDigest = digest({
  ...adoptionRetrievalManifestBase, candidate_sources: [], candidate_declarations: [],
  embedding_eligible_candidate_chunk_keys: [], candidate_chunks: [], vectors: [],
});
const adoptionRetrievalManifest = {
  ...adoptionRetrievalManifestBase,
  projection_id: `retrieval:${adoptionRetrievalProjectionDigest.slice(7, 31)}`,
  projection_digest: adoptionRetrievalProjectionDigest,
};
const adoptionInnerManifestDigest = digest(adoptionRetrievalManifest);
const adoptionOwnerMaterial = {
  contract_version: "gkos-ingest-generation/1.0.0-draft.1", mode: "non_strict", vault_id: adoptionTopology.vault_id,
  observation_snapshot_digest: adoptionTopology.source_observation_snapshot_digest,
  profile: { effective_profile_digest: EFFECTIVE_PROFILE_DIGEST }, normalized_profile: {},
  configuration_digest: samplePlan.watcher.configuration_digest, policy_digest: samplePlan.watcher.policy_digest,
  chunking: {}, validation_result: adoptionValidationResult,
  inner: { database_file: `retrieval-${adoptionRetrievalProjectionDigest.slice(7)}.sqlite`, manifest: adoptionRetrievalManifest, manifest_digest: adoptionInnerManifestDigest },
  rejection_journal: { journal_file: `ingest-rejections-${adoptionTopology.rejection_journal_digest.slice(7)}.json`, rejection_journal_digest: adoptionTopology.rejection_journal_digest, rejection_count: 0 },
};
const adoptionOwnerDigest = digest(adoptionOwnerMaterial);
const currentOwnerManifestValue = {
  ...adoptionOwnerMaterial, owner_generation_id: `ingest:${adoptionOwnerDigest.slice(7, 31)}`, owner_manifest_digest: adoptionOwnerDigest,
};
const adoptionRetrievalState = {
  state: "ready", owner_generation_id: currentOwnerManifestValue.owner_generation_id, owner_manifest_digest: adoptionOwnerDigest,
  database_file: currentOwnerManifestValue.inner.database_file, manifest_digest: adoptionInnerManifestDigest,
  projection_id: adoptionRetrievalManifest.projection_id, projection_digest: adoptionRetrievalProjectionDigest,
  lexical_backend: "sqlite_fts5", vector_stage_state: "disabled", provider_kind: null, provider_id: null, model_id: null,
  dimensions: null, reason_codes: [],
};
const adoptionRawGraphValue = sealed({
  contract_version: "gkos-watcher-raw-graph-artifact/1.0.0-draft.1", service_generation_id: generationId,
  topology_snapshot_digest: adoptionTopology.topology_snapshot_digest, graph: emptyRawGraph,
}, "graph_artifact_digest");
const adoptionCanonicalGraphValue = normalizeGeneratorGraph(emptyRawGraph);
const adoptionGraphitiValue = deriveGeneratorGraphiti(emptyRawGraph, adoptionTopology.vault_id);
const adoptionCanonicalDigest = digest(adoptionCanonicalGraphValue);
const adoptionGraphState = {
  state: "ready", graph_contract_version: "gkos-watcher-canonical-gkx-graph/1.0.0-draft.1",
  graph_artifact_file: `watcher-graph-${adoptionRawGraphValue.graph_artifact_digest.slice(7)}.json`,
  graph_artifact_digest: adoptionRawGraphValue.graph_artifact_digest, canonical_graph_digest: adoptionCanonicalDigest,
  gkx_delta_digest: normalizedDeltaDigest, graphiti_projection_digest: digest(adoptionGraphitiValue),
  sink_state: "not_applicable", sink_receipts: [], reason_codes: [],
};
const adoptionNativeTransitions = [];
for (let index = 0; index < normalStates.length; index++) {
  adoptionNativeTransitions.push(sealed({
    ...Object.fromEntries(Object.entries(transitions[index]).filter(([key]) => key !== "transition_digest")),
    prior_transition_digest: index === 0 ? null : adoptionNativeTransitions[index - 1].transition_digest,
    gkx_snapshot_digest: index < 2 ? null : adoptionCanonicalDigest,
    retrieval_projection_state: index < 3 ? notStartedRetrievalState : adoptionRetrievalState,
    graph_projection_state: index < 4 ? notStartedGraphState : adoptionGraphState,
  }, "transition_digest"));
}
const adoptionTopologyBytes = Buffer.from(pretty(adoptionTopology));
const adoptionManifestValue = sealed({
  ...Object.fromEntries(Object.entries(coherentManifestValue).filter(([key]) => key !== "coherent_manifest_digest")),
  completed_transition_digest: adoptionNativeTransitions[6].transition_digest,
  topology_snapshot_digest: adoptionTopology.topology_snapshot_digest,
  topology_artifact_file: `watcher-topology-${adoptionTopology.topology_snapshot_digest.slice(7)}.json`,
  topology_artifact_raw_sha256: sha(adoptionTopologyBytes),
  source_observation_snapshot_digest: adoptionTopology.source_observation_snapshot_digest,
  validation_result_digest: adoptionTopology.validation_result_digest,
  rejection_journal_digest: adoptionTopology.rejection_journal_digest,
  gkx_snapshot_digest: adoptionCanonicalDigest, retrieval_projection_state: adoptionRetrievalState,
  graph_projection_state: adoptionGraphState,
}, "coherent_manifest_digest");
const adoptionOuterPointerValue = sealed({
  ...Object.fromEntries(Object.entries(pointerValue).filter(([key]) => key !== "pointer_digest")),
  coherent_manifest_file: `watcher-coherent-${adoptionManifestValue.coherent_manifest_digest.slice(7)}.json`,
  coherent_manifest_digest: adoptionManifestValue.coherent_manifest_digest,
}, "pointer_digest");
const adoptionNativeIntentValue = sealed({
  ...Object.fromEntries(Object.entries(intentValue).filter(([key]) => key !== "intent_digest")),
  prepared_transition_digest: adoptionNativeTransitions[5].transition_digest,
  coherent_manifest_digest: adoptionManifestValue.coherent_manifest_digest,
  target_pointer: adoptionOuterPointerValue, target_complete_transition: adoptionNativeTransitions[6],
}, "intent_digest");
const adoptionNativeOutcomeValue = sealed({
  ...Object.fromEntries(Object.entries(outcomeValue).filter(([key]) => key !== "outcome_digest")),
  intent_digest: adoptionNativeIntentValue.intent_digest, coherent_manifest_digest: adoptionManifestValue.coherent_manifest_digest,
  pointer_digest: adoptionOuterPointerValue.pointer_digest,
}, "outcome_digest");
const adoptionNativeActiveValue = sealed({
  ...Object.fromEntries(Object.entries(activeValue).filter(([key]) => key !== "active_digest")),
  coherent_manifest_digest: adoptionManifestValue.coherent_manifest_digest, pointer_digest: adoptionOuterPointerValue.pointer_digest,
  intent_digest: adoptionNativeIntentValue.intent_digest,
}, "active_digest");
const adoptionPreScanValue = {
  ...preScan, active_pointer_digest: adoptionOuterPointerValue.pointer_digest,
  active_coherent_manifest_digest: adoptionManifestValue.coherent_manifest_digest,
  topology_snapshot_digest: adoptionTopology.topology_snapshot_digest,
};
const adoptionPreScanDigest = digest(adoptionPreScanValue);
const adoptionObservationValue = sealed({
  contract_version: "gkos-watcher-observation/1.0.0-draft.1", batch_id: adoptionBatchId,
  batch_kind: "startup_reconciliation", observed_paths: [], unscoped: true, overflow: false, started_at: resetAt,
}, "observation_digest");
const adoptionObservationBytes = Buffer.from(pretty(adoptionObservationValue));
const adoptionObservationAuthorityValue = sealed({
  contract_version: "gkos-watcher-observation-authority/1.0.0-draft.1", batch_id: adoptionBatchId,
  observation_digest: adoptionObservationValue.observation_digest,
  observation_artifact_file: `watcher-observation-${adoptionObservationValue.observation_digest.slice(7)}.json`,
  observation_raw_sha256: sha(adoptionObservationBytes), observation_byte_size: adoptionObservationBytes.length,
  pre_scan_state_digest: adoptionPreScanDigest, started_at: resetAt,
}, "authority_digest");
const adoptionPlanValue = sealed({
  contract_version: "gkos-watcher-batch-plan/1.0.0-draft.1", batch_id: adoptionBatchId,
  observation_digest: adoptionObservationValue.observation_digest, topology_snapshot_digest: adoptionTopology.topology_snapshot_digest,
  effective_profile_digest: EFFECTIVE_PROFILE_DIGEST, validation_result_digest: adoptionTopology.validation_result_digest,
  rejection_journal_digest: adoptionTopology.rejection_journal_digest, intended_source_mutations: [],
  folder_set_changed: false, attachment_set_changed: false,
  mutation_set_digest: digest({ contract_version: "gkos-watcher-mutation-set/1.0.0-draft.1",
    pre_scan_state_digest: adoptionPreScanDigest, topology_snapshot_digest: adoptionTopology.topology_snapshot_digest,
    intended_source_mutations: [], folder_set_changed: false, attachment_set_changed: false }),
}, "plan_digest");
const adoptionPlanBytes = Buffer.from(pretty(adoptionPlanValue));
const adoptionPlanAuthorityValue = sealed({
  contract_version: "gkos-watcher-plan-authority/1.0.0-draft.1", batch_id: adoptionBatchId,
  observation_digest: adoptionObservationValue.observation_digest, plan_digest: adoptionPlanValue.plan_digest,
  plan_artifact_file: `watcher-plan-${adoptionPlanValue.plan_digest.slice(7)}.json`, plan_raw_sha256: sha(adoptionPlanBytes),
  plan_byte_size: adoptionPlanBytes.length, target_topology_snapshot_digest: adoptionTopology.topology_snapshot_digest,
  source_removal_event_count: 0, source_removal_event_set_digest: null,
}, "authority_digest");
const adoptionReplacementMetaValue = resealed(newJournalMetaValue, "meta_digest", {
  anchor_coherent_manifest_digest: adoptionManifestValue.coherent_manifest_digest,
});
const adoptionReplacementGenerationValue = resealed(newJournalGenerationValue, "journal_generation_digest", {
  meta_digest: adoptionReplacementMetaValue.meta_digest,
  anchor_coherent_manifest_digest: adoptionManifestValue.coherent_manifest_digest,
});
const adoptionReplacementPointerValue = resealed(targetJournalPointerValue, "pointer_digest", {
  journal_generation_file: `watcher-journal-generation-${adoptionReplacementGenerationValue.journal_generation_digest.slice(7)}.json`,
  journal_generation_digest: adoptionReplacementGenerationValue.journal_generation_digest,
  prior_pointer_digest: journalPointerValue.pointer_digest,
});
const adoptionResetValue = resealed(resetValue, "reset_digest", {
  new_journal_meta_digest: adoptionReplacementMetaValue.meta_digest,
  new_journal_generation_digest: adoptionReplacementGenerationValue.journal_generation_digest,
  target_journal_pointer_digest: adoptionReplacementPointerValue.pointer_digest,
  outer_coherent_manifest_digest: adoptionManifestValue.coherent_manifest_digest,
});
const adoptionReceiptValue = sealed({
  contract_version: "gkos-watcher-journal-reset-reconciliation-adoption/1.0.0-draft.1", batch_id: adoptionBatchId,
  batch_kind: "startup_reconciliation", execution_kind: "set_files", reset_digest: adoptionResetValue.reset_digest,
  replacement_journal_generation_digest: adoptionReplacementGenerationValue.journal_generation_digest,
  source_journal_generation_digest: journalGenerationValue.journal_generation_digest,
  native_activation_journal_generation_digest: journalGenerationValue.journal_generation_digest,
  current_pointer_digest: adoptionOuterPointerValue.pointer_digest,
  current_coherent_manifest_digest: adoptionManifestValue.coherent_manifest_digest,
  native_activation_intent_digest: adoptionNativeIntentValue.intent_digest,
  native_activation_outcome_digest: adoptionNativeOutcomeValue.outcome_digest,
  prior_active_digest: adoptionNativeActiveValue.active_digest, observation_digest: adoptionObservationValue.observation_digest,
  observation_authority_digest: adoptionObservationAuthorityValue.authority_digest, plan_digest: adoptionPlanValue.plan_digest,
  plan_authority_digest: adoptionPlanAuthorityValue.authority_digest, topology_snapshot_digest: adoptionTopology.topology_snapshot_digest,
  source_observation_snapshot_digest: adoptionTopology.source_observation_snapshot_digest, gkx_snapshot_digest: adoptionCanonicalDigest,
  retrieval_projection_digest: adoptionRetrievalProjectionDigest, canonical_graph_digest: adoptionCanonicalDigest,
  graphiti_projection_digest: adoptionGraphState.graphiti_projection_digest, started_at: resetAt,
}, "receipt_digest");
const adoptionTransitionValue = sealed({
  contract_version: "gkos-watcher-journal-reset-reconciliation-transition/1.0.0-draft.1", batch_id: adoptionBatchId,
  transition_ordinal: 0, state: "reset_reconciliation_adopted", terminal_state: "complete",
  receipt_digest: adoptionReceiptValue.receipt_digest, reset_digest: adoptionResetValue.reset_digest,
  replacement_journal_generation_digest: adoptionReplacementGenerationValue.journal_generation_digest,
  current_pointer_digest: adoptionOuterPointerValue.pointer_digest,
  current_coherent_manifest_digest: adoptionManifestValue.coherent_manifest_digest,
  topology_snapshot_digest: adoptionTopology.topology_snapshot_digest, prior_active_digest: adoptionNativeActiveValue.active_digest,
  adopted_active_digest: adoptionNativeActiveValue.active_digest, recorded_at: resetAt, completed_at: resetAt,
}, "transition_digest");
const journalResetReconciliationAdoptionBundleValue = {
  replacement_meta: adoptionReplacementMetaValue, replacement_generation: adoptionReplacementGenerationValue,
  replacement_pointer: adoptionReplacementPointerValue, reset: adoptionResetValue,
  source_meta: journalMetaValue, source_generation: journalGenerationValue, source_pointer: journalPointerValue,
  native_meta: journalMetaValue, native_generation: journalGenerationValue, native_pointer: journalPointerValue,
  current_outer_pointer: adoptionOuterPointerValue, current_coherent_manifest: adoptionManifestValue,
  native_transitions: adoptionNativeTransitions, native_activation_intent: adoptionNativeIntentValue,
  native_activation_outcome: adoptionNativeOutcomeValue, native_active: adoptionNativeActiveValue,
  source_adoption_receipt: null, source_adoption_transition: null, source_active: adoptionNativeActiveValue,
  pre_scan_state: adoptionPreScanValue, observation: adoptionObservationValue,
  observation_authority: adoptionObservationAuthorityValue, plan: adoptionPlanValue, plan_authority: adoptionPlanAuthorityValue,
  topology: adoptionTopology, current_owner_manifest: currentOwnerManifestValue, raw_graph: adoptionRawGraphValue,
  canonical_graph: adoptionCanonicalGraphValue, graphiti_projection: adoptionGraphitiValue,
  adoption_receipt: adoptionReceiptValue, adoption_transition: adoptionTransitionValue, adopted_active: adoptionNativeActiveValue,
};

// A successful full failure-reconciliation scan may be semantically identical
// to the current coherent generation. It commits only the retry observation,
// Plan authority and terminal no-op receipt/transition; the current outer and
// retrieval/graph authorities remain byte-identical.
const noopFailedAt = "2026-08-20T00:00:04.000Z";
const noopRetryAt = "2026-08-20T00:00:05.000Z";
const noopCompletedAt = "2026-08-20T00:00:06.000Z";
const noopFailedBatchId = "019b2d14-423d-7db7-87d4-7d81cfaec932";
const noopRetryBatchId = "019b2d14-423e-7db7-87d4-7d81cfaec932";
const noopFailedObservationValue = sealed({
  contract_version: "gkos-watcher-observation/1.0.0-draft.1", batch_id: noopFailedBatchId, batch_kind: "event",
  observed_paths: ["policy/agent-writing.md"], unscoped: false, overflow: false, started_at: noopFailedAt,
}, "observation_digest");
const noopFailedObservationBytes = Buffer.from(pretty(noopFailedObservationValue));
const noopFailedObservationAuthorityValue = sealed({
  contract_version: "gkos-watcher-observation-authority/1.0.0-draft.1", batch_id: noopFailedBatchId,
  observation_digest: noopFailedObservationValue.observation_digest,
  observation_artifact_file: `watcher-observation-${noopFailedObservationValue.observation_digest.slice(7)}.json`,
  observation_raw_sha256: sha(noopFailedObservationBytes), observation_byte_size: noopFailedObservationBytes.length,
  pre_scan_state_digest: adoptionPreScanDigest, started_at: noopFailedAt,
}, "authority_digest");
const noopFailedBatchValue = sealed({
  contract_version: "gkos-watcher-batch-record/1.0.0-draft.1", batch_id: noopFailedBatchId, batch_kind: "event",
  observation_authority_digest: noopFailedObservationAuthorityValue.authority_digest, started_at: noopFailedAt,
  execution_kind: "apply_changes", retry_of_batch_id: null,
}, "batch_record_digest");
const noopFailedObservedTransitionValue = sealed({
  contract_version: "gkos-watcher-transition/1.0.0-draft.1", batch_id: noopFailedBatchId, transition_ordinal: 0,
  state: "observed", last_reached_state: "observed", terminal_state: "open",
  observation_digest: noopFailedObservationValue.observation_digest, plan_digest: null, prior_transition_digest: null,
  gkx_delta_digest: null, gkx_snapshot_digest: null, retrieval_projection_state: notStartedRetrievalState,
  graph_projection_state: notStartedGraphState, reason_codes: [], recorded_at: noopFailedAt, completed_at: null,
}, "transition_digest");
const noopFailedTerminalTransitionValue = sealed({
  ...Object.fromEntries(Object.entries(noopFailedObservedTransitionValue).filter(([key]) => key !== "transition_digest")),
  transition_ordinal: 1, state: "failed", last_reached_state: "observed", terminal_state: "failed",
  prior_transition_digest: noopFailedObservedTransitionValue.transition_digest,
  reason_codes: ["WATCHER_SOURCE_UNSTABLE"], recorded_at: noopRetryAt, completed_at: noopRetryAt,
}, "transition_digest");
const noopRetryObservationValue = sealed({
  contract_version: "gkos-watcher-observation/1.0.0-draft.1", batch_id: noopRetryBatchId,
  batch_kind: "failure_reconciliation", observed_paths: [], unscoped: true, overflow: false, started_at: noopRetryAt,
}, "observation_digest");
const noopRetryObservationBytes = Buffer.from(pretty(noopRetryObservationValue));
const noopRetryObservationAuthorityValue = sealed({
  contract_version: "gkos-watcher-observation-authority/1.0.0-draft.1", batch_id: noopRetryBatchId,
  observation_digest: noopRetryObservationValue.observation_digest,
  observation_artifact_file: `watcher-observation-${noopRetryObservationValue.observation_digest.slice(7)}.json`,
  observation_raw_sha256: sha(noopRetryObservationBytes), observation_byte_size: noopRetryObservationBytes.length,
  pre_scan_state_digest: adoptionPreScanDigest, started_at: noopRetryAt,
}, "authority_digest");
const noopRetryBatchValue = sealed({
  contract_version: "gkos-watcher-batch-record/1.0.0-draft.1", batch_id: noopRetryBatchId,
  batch_kind: "failure_reconciliation", observation_authority_digest: noopRetryObservationAuthorityValue.authority_digest,
  started_at: noopRetryAt, execution_kind: "set_files", retry_of_batch_id: noopFailedBatchId,
}, "batch_record_digest");
const noopFailureRetryValue = {
  failed_batch: noopFailedBatchValue, failed_observation: noopFailedObservationValue,
  failed_observation_authority: noopFailedObservationAuthorityValue, failed_pre_scan_state: adoptionPreScanValue,
  failed_transitions: [noopFailedObservedTransitionValue, noopFailedTerminalTransitionValue],
  retry_batch: noopRetryBatchValue, retry_observation: noopRetryObservationValue,
  retry_observation_authority: noopRetryObservationAuthorityValue, retry_pre_scan_state: adoptionPreScanValue,
};
const noopRetryPlanValue = sealed({
  contract_version: "gkos-watcher-batch-plan/1.0.0-draft.1", batch_id: noopRetryBatchId,
  observation_digest: noopRetryObservationValue.observation_digest,
  topology_snapshot_digest: adoptionTopology.topology_snapshot_digest, effective_profile_digest: EFFECTIVE_PROFILE_DIGEST,
  validation_result_digest: adoptionTopology.validation_result_digest,
  rejection_journal_digest: adoptionTopology.rejection_journal_digest, intended_source_mutations: [],
  folder_set_changed: false, attachment_set_changed: false,
  mutation_set_digest: digest({
    contract_version: "gkos-watcher-mutation-set/1.0.0-draft.1", pre_scan_state_digest: adoptionPreScanDigest,
    topology_snapshot_digest: adoptionTopology.topology_snapshot_digest, intended_source_mutations: [],
    folder_set_changed: false, attachment_set_changed: false,
  }),
}, "plan_digest");
const noopRetryPlanBytes = Buffer.from(pretty(noopRetryPlanValue));
const noopRetryPlanAuthorityValue = sealed({
  contract_version: "gkos-watcher-plan-authority/1.0.0-draft.1", batch_id: noopRetryBatchId,
  observation_digest: noopRetryObservationValue.observation_digest, plan_digest: noopRetryPlanValue.plan_digest,
  plan_artifact_file: `watcher-plan-${noopRetryPlanValue.plan_digest.slice(7)}.json`,
  plan_raw_sha256: sha(noopRetryPlanBytes), plan_byte_size: noopRetryPlanBytes.length,
  target_topology_snapshot_digest: adoptionTopology.topology_snapshot_digest,
  source_removal_event_count: 0, source_removal_event_set_digest: null,
}, "authority_digest");
const noopReceiptValue = sealed({
  contract_version: "gkos-watcher-failure-retry-noop-receipt/1.0.0-draft.1",
  failed_batch_id: noopFailedBatchId,
  failed_terminal_transition_digest: noopFailedTerminalTransitionValue.transition_digest,
  retry_batch_id: noopRetryBatchId, retry_observation_digest: noopRetryObservationValue.observation_digest,
  retry_observation_authority_digest: noopRetryObservationAuthorityValue.authority_digest,
  retry_pre_scan_state_digest: adoptionPreScanDigest,
  failure_retry_bundle_digest: digest(noopFailureRetryValue), retry_plan_digest: noopRetryPlanValue.plan_digest,
  retry_plan_authority_digest: noopRetryPlanAuthorityValue.authority_digest,
  current_active_digest: adoptionNativeActiveValue.active_digest,
  current_pointer_digest: adoptionOuterPointerValue.pointer_digest,
  current_coherent_manifest_digest: adoptionManifestValue.coherent_manifest_digest,
  current_intent_digest: adoptionNativeIntentValue.intent_digest,
  current_outcome_digest: adoptionNativeOutcomeValue.outcome_digest,
  topology_snapshot_digest: adoptionTopology.topology_snapshot_digest,
  source_observation_snapshot_digest: adoptionTopology.source_observation_snapshot_digest,
  configuration_digest: samplePlan.watcher.configuration_digest, policy_digest: samplePlan.watcher.policy_digest,
  effective_profile_digest: EFFECTIVE_PROFILE_DIGEST, gkx_snapshot_digest: adoptionCanonicalDigest,
  retrieval_projection_digest: adoptionRetrievalProjectionDigest, canonical_graph_digest: adoptionCanonicalDigest,
  graph_artifact_digest: adoptionRawGraphValue.graph_artifact_digest,
  graphiti_projection_digest: adoptionGraphState.graphiti_projection_digest,
  set_files_call_count: 1, apply_changes_call_count: 0, provider_call_count: 0,
  retrieval_write_count: 0, outer_write_count: 0, completed_at: noopCompletedAt,
}, "receipt_digest");
const noopTransitionValue = sealed({
  contract_version: "gkos-watcher-failure-retry-noop-transition/1.0.0-draft.1", batch_id: noopRetryBatchId,
  transition_ordinal: 0, state: "failure_reconciliation_noop_complete", terminal_state: "complete",
  prior_transition_digest: null, receipt: noopReceiptValue, receipt_digest: noopReceiptValue.receipt_digest,
  recorded_at: noopCompletedAt, completed_at: noopCompletedAt,
}, "transition_digest");
const failureRetryNoopBundleValue = {
  failure_retry_bundle: noopFailureRetryValue, retry_plan: noopRetryPlanValue,
  retry_plan_authority: noopRetryPlanAuthorityValue, retry_topology: adoptionTopology,
  retry_canonical_graph: adoptionCanonicalGraphValue, current_topology: adoptionTopology,
  current_outer_pointer: adoptionOuterPointerValue, current_coherent_manifest: adoptionManifestValue,
  current_activation_intent: adoptionNativeIntentValue, current_activation_outcome: adoptionNativeOutcomeValue,
  current_active: adoptionNativeActiveValue, current_owner_manifest: currentOwnerManifestValue,
  current_canonical_graph: adoptionCanonicalGraphValue, current_raw_graph: adoptionRawGraphValue,
  current_graphiti_projection: adoptionGraphitiValue, receipt: noopReceiptValue, transition: noopTransitionValue,
};
const repeatedAdoptionAt = "2026-08-20T00:00:03.000Z";
const repeatedAdoptionBatchId = "019b2d14-423a-7db7-87d4-7d81cfaec932";
const repeatedJournalId = "019b2d14-423b-7db7-87d4-7d81cfaec932";
const repeatedMetaValue = sealed({
  ...Object.fromEntries(Object.entries(adoptionReplacementMetaValue).filter(([key]) => key !== "meta_digest")),
  journal_instance_id: repeatedJournalId, created_at: repeatedAdoptionAt,
}, "meta_digest");
const repeatedGenerationValue = sealed({
  ...Object.fromEntries(Object.entries(adoptionReplacementGenerationValue).filter(([key]) => key !== "journal_generation_digest")),
  journal_instance_id: repeatedJournalId, directory_leaf: `journal-${repeatedJournalId}`,
  meta_digest: repeatedMetaValue.meta_digest, created_at: repeatedAdoptionAt,
}, "journal_generation_digest");
const repeatedPointerValue = sealed({
  ...Object.fromEntries(Object.entries(adoptionReplacementPointerValue).filter(([key]) => key !== "pointer_digest")),
  journal_generation_file: `watcher-journal-generation-${repeatedGenerationValue.journal_generation_digest.slice(7)}.json`,
  journal_generation_digest: repeatedGenerationValue.journal_generation_digest,
  prior_pointer_digest: adoptionReplacementPointerValue.pointer_digest,
}, "pointer_digest");
const repeatedResetValue = sealed({
  ...Object.fromEntries(Object.entries(adoptionResetValue).filter(([key]) => key !== "reset_digest")),
  reset_id: "019b2d14-423c-7db7-87d4-7d81cfaec932",
  prior_journal_generation_digest: adoptionReplacementGenerationValue.journal_generation_digest,
  new_journal_meta_digest: repeatedMetaValue.meta_digest,
  new_journal_generation_digest: repeatedGenerationValue.journal_generation_digest,
  target_journal_pointer_digest: repeatedPointerValue.pointer_digest,
  reset_at: repeatedAdoptionAt,
}, "reset_digest");
const repeatedObservationValue = sealed({
  ...Object.fromEntries(Object.entries(adoptionObservationValue).filter(([key]) => key !== "observation_digest")),
  batch_id: repeatedAdoptionBatchId, started_at: repeatedAdoptionAt,
}, "observation_digest");
const repeatedObservationBytes = Buffer.from(pretty(repeatedObservationValue));
const repeatedObservationAuthorityValue = sealed({
  ...Object.fromEntries(Object.entries(adoptionObservationAuthorityValue).filter(([key]) => key !== "authority_digest")),
  batch_id: repeatedAdoptionBatchId, observation_digest: repeatedObservationValue.observation_digest,
  observation_artifact_file: `watcher-observation-${repeatedObservationValue.observation_digest.slice(7)}.json`,
  observation_raw_sha256: sha(repeatedObservationBytes), observation_byte_size: repeatedObservationBytes.length,
  started_at: repeatedAdoptionAt,
}, "authority_digest");
const repeatedPlanValue = sealed({
  ...Object.fromEntries(Object.entries(adoptionPlanValue).filter(([key]) => key !== "plan_digest")),
  batch_id: repeatedAdoptionBatchId, observation_digest: repeatedObservationValue.observation_digest,
}, "plan_digest");
const repeatedPlanBytes = Buffer.from(pretty(repeatedPlanValue));
const repeatedPlanAuthorityValue = sealed({
  ...Object.fromEntries(Object.entries(adoptionPlanAuthorityValue).filter(([key]) => key !== "authority_digest")),
  batch_id: repeatedAdoptionBatchId, observation_digest: repeatedObservationValue.observation_digest,
  plan_digest: repeatedPlanValue.plan_digest,
  plan_artifact_file: `watcher-plan-${repeatedPlanValue.plan_digest.slice(7)}.json`,
  plan_raw_sha256: sha(repeatedPlanBytes), plan_byte_size: repeatedPlanBytes.length,
}, "authority_digest");
const repeatedReceiptValue = sealed({
  ...Object.fromEntries(Object.entries(adoptionReceiptValue).filter(([key]) => key !== "receipt_digest")),
  batch_id: repeatedAdoptionBatchId, reset_digest: repeatedResetValue.reset_digest,
  replacement_journal_generation_digest: repeatedGenerationValue.journal_generation_digest,
  source_journal_generation_digest: adoptionReplacementGenerationValue.journal_generation_digest,
  observation_digest: repeatedObservationValue.observation_digest,
  observation_authority_digest: repeatedObservationAuthorityValue.authority_digest,
  plan_digest: repeatedPlanValue.plan_digest, plan_authority_digest: repeatedPlanAuthorityValue.authority_digest,
  started_at: repeatedAdoptionAt,
}, "receipt_digest");
const repeatedTransitionValue = sealed({
  ...Object.fromEntries(Object.entries(adoptionTransitionValue).filter(([key]) => key !== "transition_digest")),
  batch_id: repeatedAdoptionBatchId, receipt_digest: repeatedReceiptValue.receipt_digest,
  reset_digest: repeatedResetValue.reset_digest,
  replacement_journal_generation_digest: repeatedGenerationValue.journal_generation_digest,
  recorded_at: repeatedAdoptionAt, completed_at: repeatedAdoptionAt,
}, "transition_digest");
const repeatedJournalResetReconciliationAdoptionBundleValue = {
  ...journalResetReconciliationAdoptionBundleValue,
  replacement_meta: repeatedMetaValue, replacement_generation: repeatedGenerationValue,
  replacement_pointer: repeatedPointerValue, reset: repeatedResetValue,
  source_meta: adoptionReplacementMetaValue, source_generation: adoptionReplacementGenerationValue,
  source_pointer: adoptionReplacementPointerValue,
  source_adoption_receipt: adoptionReceiptValue, source_adoption_transition: adoptionTransitionValue,
  observation: repeatedObservationValue, observation_authority: repeatedObservationAuthorityValue,
  plan: repeatedPlanValue, plan_authority: repeatedPlanAuthorityValue,
  adoption_receipt: repeatedReceiptValue, adoption_transition: repeatedTransitionValue,
};
for (const [case_id, schema_file, value] of [
  ["journal-bootstrap-planned-target-valid", "journal.schema.json", bootstrapPlannedTargetValue],
  ["journal-bootstrap-host-lock-witness-valid", "journal.schema.json", bootstrapHostLockWitnessValue],
  ["journal-bootstrap-authority-valid", "journal.schema.json", journalBootstrapAuthorityValue],
  ["old-journal-reset-authority-valid", "journal.schema.json", oldJournalReadyAuthorityValue],
  ["journal-reset-bundle-valid", "journal.schema.json", journalResetBundleValue],
  ["journal-reset-reconciliation-adoption-receipt-valid", "journal.schema.json", adoptionReceiptValue],
  ["journal-reset-reconciliation-adoption-transition-valid", "journal.schema.json", adoptionTransitionValue],
  ["journal-reset-reconciliation-adoption-bundle-valid", "journal.schema.json", journalResetReconciliationAdoptionBundleValue],
  ["failure-retry-noop-receipt-valid", "journal.schema.json", noopReceiptValue],
  ["failure-retry-noop-transition-valid", "journal.schema.json", noopTransitionValue],
  ["failure-retry-noop-bundle-valid", "journal.schema.json", failureRetryNoopBundleValue],
  ["event-set-bundle-valid", "source-removal.schema.json", eventSetBundleValue],
  ["activated-event-set-bundle-valid", "source-removal.schema.json", oldJournalReadyAuthorityValue.activated_event_set_bundles[0]],
]) schemaCases.push({ case_id, schema_file, expected_valid: true, value });
const oversizedAccepted = { ...accepted, source_size_bytes: 67_108_865 };
const oversizedTopology = resealed(priorTopology, "topology_snapshot_digest", {
  accepted_sources: [oversizedAccepted],
  accepted_source_set_digest: digest({ contract_version: "gkos-watcher-accepted-source-set/1.0.0-draft.1", sources: [oversizedAccepted] }),
});
function rebuildTopology(base, changes) {
  const material = { ...clone(base), ...changes };
  material.accepted_source_set_digest = digest({
    contract_version: "gkos-watcher-accepted-source-set/1.0.0-draft.1", sources: material.accepted_sources,
  });
  material.rejected_source_set_digest = digest({
    contract_version: "gkos-watcher-rejected-source-set/1.0.0-draft.1", sources: material.rejected_sources,
  });
  material.folder_set_digest = digest({
    contract_version: "gkos-watcher-folder-set/1.0.0-draft.1", folder_paths: material.folder_paths,
  });
  material.attachment_set_digest = digest({
    contract_version: "gkos-watcher-attachment-set/1.0.0-draft.1", attachment_paths: material.attachment_paths,
  });
  return resealed(base, "topology_snapshot_digest", material);
}
const secondAccepted = {
  source_path: "policy/other.md", source_id: "123e4567-e89b-42d3-a456-426614174000", source_observation_ordinal: 1,
  source_digest: D("3"), source_size_bytes: 400, parser_descriptor_digest: D("4"),
};
const twoAcceptedTopology = rebuildTopology(priorTopology, { accepted_sources: [accepted, secondAccepted] });
const secondAcceptedOrdinalZero = { ...secondAccepted, source_observation_ordinal: 0 };
const twoAcceptedOrdinalZeroTopology = rebuildTopology(priorTopology, {
  accepted_sources: [accepted, secondAcceptedOrdinalZero],
});
const validationRejectionMutation = { ...planValue.intended_source_mutations[0], cause: "validation_rejection" };
const validationRejectionPlan = resealed(planValue, "plan_digest", {
  intended_source_mutations: [validationRejectionMutation],
  mutation_set_digest: digest({
    contract_version: "gkos-watcher-mutation-set/1.0.0-draft.1", pre_scan_state_digest: preScanDigest,
    topology_snapshot_digest: topology.topology_snapshot_digest, intended_source_mutations: [validationRejectionMutation],
    folder_set_changed: false, attachment_set_changed: false,
  }),
});
function syntheticPackSchema(file) {
  const defs = file === "topology.schema.json" ? {
    acceptedSource: exactObject({ source_path: { type: "string" } }),
    rejectedSource: exactObject({ source_path: { type: "string" } }),
  } : {};
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `${SCHEMA_ROOT}${file}`,
    $defs: defs,
    oneOf: [],
  };
}
const packValidationFiles = PACK_FILE_NAMES.map((file) => {
  const bytes = file === "watcher-sample-plan.json" ? samplePlanBytes
    : file.endsWith(".schema.json") ? Buffer.from(pretty(syntheticPackSchema(file)), "utf8")
      : Buffer.from(file.endsWith(".md") ? `# ${file}\n` : pretty({ file }), "utf8");
  return { file, bytes_base64: bytes.toString("base64") };
});
function packBundleForFiles(rows) {
  const manifest = sealed({
    contract_version: "gkos-watcher-recovery-pack-manifest/1.0.0-draft.1",
    pack_contract_version: PACK_VERSION,
    files: rows.map((row) => {
      const bytes = Buffer.from(row.bytes_base64, "base64");
      return { file: row.file, byte_size: bytes.length, raw_sha256: sha(bytes) };
    }),
    file_count: rows.length,
    total_bytes: rows.reduce((sum, row) => sum + Buffer.from(row.bytes_base64, "base64").length, 0),
  }, "pack_digest");
  return { pack_root_manifest: manifest, files: rows };
}
const packValidationBundle = packBundleForFiles(packValidationFiles);
const packValidationManifest = packValidationBundle.pack_root_manifest;
const vectorRetrievalState = {
  ...retrievalState,
  vector_stage_state: "complete",
  provider_kind: "local_onnx",
  provider_id: "phase5-local-provider",
  model_id: "phase5-local-model",
  dimensions: 384,
};
const vectorRetrievalTransition = resealed(transitions[3], "transition_digest", {
  retrieval_projection_state: vectorRetrievalState,
});
const invalidProviderTransition = resealed(vectorRetrievalTransition, "transition_digest", {
  retrieval_projection_state: { ...vectorRetrievalState, provider_kind: "custom_provider" },
});
const impossibleDateLocator = resealed(locatorValue, "locator_digest", { started_at: "2026-02-30T00:00:00.000Z" });
const packSelfRow = { file: "pack-manifest.json", byte_size: 1, raw_sha256: D("0") };
const packSelfManifest = resealed(packValidationManifest, "pack_digest", {
  files: [...packValidationManifest.files, packSelfRow],
  file_count: 18,
  total_bytes: packValidationManifest.total_bytes + 1,
});
const packSelfBundle = {
  pack_root_manifest: packSelfManifest,
  files: [...packValidationFiles, { file: "pack-manifest.json", bytes_base64: Buffer.from("x").toString("base64") }],
};
const packRawMismatchFiles = clone(packValidationFiles);
const rawMismatchIndex = packRawMismatchFiles.findIndex((row) => row.file === "README.md");
packRawMismatchFiles[rawMismatchIndex] = {
  ...packRawMismatchFiles[rawMismatchIndex],
  bytes_base64: Buffer.from("# README.md changed\n", "utf8").toString("base64"),
};
const duplicateOwnershipFiles = clone(packValidationFiles);
const duplicateOwnershipIndex = duplicateOwnershipFiles.findIndex((row) => row.file === "batch.schema.json");
const duplicateOwnershipSchema = JSON.parse(Buffer.from(duplicateOwnershipFiles[duplicateOwnershipIndex].bytes_base64, "base64").toString("utf8"));
duplicateOwnershipSchema.$defs.acceptedSource = exactObject({ source_path: { type: "string" } });
duplicateOwnershipFiles[duplicateOwnershipIndex] = {
  file: "batch.schema.json",
  bytes_base64: Buffer.from(pretty(duplicateOwnershipSchema), "utf8").toString("base64"),
};
const duplicateOwnershipBundle = packBundleForFiles(duplicateOwnershipFiles);
const receiptBundleValue = {
  binding: adapterBindingValue,
  event_set_bundle: eventSetBundleValue,
  activation: activationValue,
  selected_event_ordinal: 1,
  request: requestValue,
  response: responseValue,
  receipt: receiptValue,
};
const semanticCases = [
  semanticCaseWithResult("journal-reset-recovery-plan-seals", "seal_record", [journalResetRecoveryPlanValue], journalResetRecoveryPlanValue),
  rejectingSemanticCase("journal-reset-recovery-plan-host-lock-coordinate-substitution", "seal_record", [
    resealed(journalResetRecoveryPlanValue, "plan_digest", {
      watcher_host_lock: resealed(resetHostLockValue, "lock_digest", { prior_journal_pointer_digest: D("f") }),
    }),
  ], "GKX_WATCHER_CONTRACT_RESET_INVALID"),
  rejectingSemanticCase("journal-reset-recovery-plan-pointer-guard-substitution", "seal_record", [
    resealed(journalResetRecoveryPlanValue, "plan_digest", {
      pointer_replace_guard: resealed(journalPointerGuardValue, "guard_digest", { target_commit_digest: D("f") }),
    }),
  ], "GKX_WATCHER_CONTRACT_RESET_INVALID"),
  rejectingSemanticCase("journal-reset-recovery-plan-extra-key", "seal_record", [{
    ...journalResetRecoveryPlanValue, unexpected: true,
  }], "GKX_WATCHER_CONTRACT_KEYS_INVALID"),
  semanticCaseWithResult("journal-bootstrap-planned-target-seals", "seal_record", [bootstrapPlannedTargetValue], bootstrapPlannedTargetValue),
  semanticCaseWithResult("journal-bootstrap-host-lock-witness-seals", "seal_record", [bootstrapHostLockWitnessValue], bootstrapHostLockWitnessValue),
  rejectingSemanticCase("journal-bootstrap-planned-target-pointer-prior-substitution", "seal_record", [
    resealed(bootstrapPlannedTargetValue, "planned_target_digest", {
      target_journal_pointer: resealed(journalPointerValue, "pointer_digest", { prior_pointer_digest: D("f") }),
    }),
  ], "GKX_WATCHER_CONTRACT_RESET_INVALID"),
  rejectingSemanticCase("journal-bootstrap-host-lock-witness-planned-reference-substitution", "seal_record", [
    resealed(bootstrapHostLockWitnessValue, "witness_digest", {
      planned_target: { ...bootstrapPlannedTargetRefValue, watcher_host_lock_digest: D("f") },
    }),
  ], "GKX_WATCHER_CONTRACT_RESET_INVALID"),
  semanticCaseWithResult("canonical-graph-production-normalization", "normalize_canonical_graph", [emptyRawGraph], canonicalGraphValue),
  semanticCaseWithResult("graph-delta-production-normalization", "normalize_graph_delta", [normalizedDeltaValue.delta], normalizedDeltaValue),
  semanticCaseWithResult("graphiti-production-projection", "derive_graphiti_projection", [emptyRawGraph, "phase5-watcher-convergence-v1"], graphitiValue),
  semanticCaseWithResult("pointer-guard-old-create-temp", "seal_pointer_recovery", [pointerRecoveryRecipeValue, pointerGuardValue], pointerRecoveryDecisionValue),
  semanticCase("pointer-guard-basename-substitution", "seal_record", resealed(pointerGuardValue, "guard_digest", {
    guard_basename: ".wrong.guard",
  }), "GKX_WATCHER_CONTRACT_POINTER_INVALID"),
  semanticCase("pointer-guard-new-file-substitution", "seal_record", resealed(pointerGuardValue, "guard_digest", {
    new_pointer_file: "watcher-pointer-invalid.json",
  }), "GKX_WATCHER_CONTRACT_POINTER_INVALID"),
  semanticCase("pointer-guard-old-device-leading-zero-invalid", "seal_record", resealed(pointerGuardValue, "guard_digest", {
    old_final_device: "01",
  }), "GKX_WATCHER_CONTRACT_POINTER_INVALID"),
  semanticCase("pointer-guard-old-inode-leading-zero-invalid", "seal_record", resealed(pointerGuardValue, "guard_digest", {
    old_final_inode: "03",
  }), "GKX_WATCHER_CONTRACT_POINTER_INVALID"),
  semanticCase("pointer-journal-old-device-leading-zero-invalid", "seal_record", resealed(journalPointerGuardValue, "guard_digest", {
    old_final_device: "01",
  }), "GKX_WATCHER_CONTRACT_POINTER_INVALID"),
  semanticCase("pointer-journal-old-inode-leading-zero-invalid", "seal_record", resealed(journalPointerGuardValue, "guard_digest", {
    old_final_inode: "05",
  }), "GKX_WATCHER_CONTRACT_POINTER_INVALID"),
  rejectingSemanticCase("pointer-guard-new-raw-substitution", "seal_coherent_activation_bundle", [coherentActivationValue,
    resealed(pointerGuardValue, "guard_digest", { new_pointer_raw_sha256: D("f") })],
  "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  rejectingSemanticCase("pointer-guard-new-size-substitution", "seal_coherent_activation_bundle", [coherentActivationValue,
    resealed(pointerGuardValue, "guard_digest", { new_pointer_byte_size: pointerGuardValue.new_pointer_byte_size + 1 })],
  "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  rejectingSemanticCase("pointer-guard-intent-substitution", "seal_coherent_activation_bundle", [coherentActivationValue,
    resealed(pointerGuardValue, "guard_digest", { operation_intent_digest: D("f") })],
  "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  rejectingSemanticCase("pointer-guard-target-commit-substitution", "seal_coherent_activation_bundle", [coherentActivationValue,
    resealed(pointerGuardValue, "guard_digest", { target_commit_digest: D("f") })],
  "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  semanticCase("transition-chain-complete", "seal_transition_chain", transitions),
  semanticCase("coherent-activation-complete", "seal_coherent_activation", coherentActivationValue),
  semanticCase("failure-retry-failed-only", "seal_failure_retry", failureRetryValue),
  semanticCase("source-removal-event-set", "seal_source_removal_event_set", eventSetBundleValue),
  semanticCase("source-removal-reset-carry", "seal_source_removal_event_set", carryBundleValue),
  semanticCase("source-removal-reset-carry-immediate-chain", "seal_source_removal_event_set", secondCarryBundleValue),
  semanticCase("source-removal-reset-carry-root-shortcut", "seal_source_removal_event_set", shortcutCarryBundleValue,
    "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  semanticCase("journal-reset-all-and-only", "seal_journal_reset", { bundle: journalResetBundleValue, old_journal_authority: oldJournalReadyAuthorityValue, pointer_guard: journalPointerGuardValue }),
  semanticCase("journal-reset-anchored-historical-authority", "seal_journal_reset", {
    bundle: anchoredJournalResetBundleValue,
    old_journal_authority: anchoredOldJournalAuthorityValue,
    pointer_guard: anchoredJournalPointerGuardValue,
  }),
  semanticCase("journal-reset-reconciliation-adoption-valid", "seal_journal_reset_reconciliation_adoption",
    journalResetReconciliationAdoptionBundleValue),
  semanticCase("journal-reset-reconciliation-adoption-flattened-repeat", "seal_journal_reset_reconciliation_adoption",
    repeatedJournalResetReconciliationAdoptionBundleValue),
  semanticCase("journal-reset-reconciliation-adoption-extra-key", "seal_journal_reset_reconciliation_adoption", {
    ...journalResetReconciliationAdoptionBundleValue, unexpected: true,
  }, "GKX_WATCHER_CONTRACT_KEYS_INVALID"),
  semanticCase("journal-reset-reconciliation-adoption-missing-key", "seal_journal_reset_reconciliation_adoption",
    Object.fromEntries(Object.entries(journalResetReconciliationAdoptionBundleValue).filter(([key]) => key !== "adopted_active")),
    "GKX_WATCHER_CONTRACT_KEYS_INVALID"),
  semanticCase("journal-reset-reconciliation-adoption-source-branch-partial", "seal_journal_reset_reconciliation_adoption", {
    ...journalResetReconciliationAdoptionBundleValue, source_adoption_receipt: adoptionReceiptValue,
  }, "GKX_WATCHER_CONTRACT_RESET_INVALID"),
  semanticCase("journal-reset-reconciliation-adoption-reset-splice", "seal_journal_reset_reconciliation_adoption", {
    ...journalResetReconciliationAdoptionBundleValue,
    reset: resealed(adoptionResetValue, "reset_digest", { outer_coherent_manifest_digest: D("f") }),
  }, "GKX_WATCHER_CONTRACT_RESET_INVALID"),
  semanticCase("journal-reset-reconciliation-adoption-nonempty-plan", "seal_journal_reset_reconciliation_adoption", {
    ...journalResetReconciliationAdoptionBundleValue,
    plan: resealed(adoptionPlanValue, "plan_digest", { folder_set_changed: true }),
  }, "GKX_WATCHER_CONTRACT_RESET_INVALID"),
  semanticCase("journal-reset-reconciliation-adoption-retrieval-coordinate-splice", "seal_journal_reset_reconciliation_adoption", {
    ...journalResetReconciliationAdoptionBundleValue,
    adoption_receipt: resealed(adoptionReceiptValue, "receipt_digest", { retrieval_projection_digest: D("f") }),
  }, "GKX_WATCHER_CONTRACT_RESET_INVALID"),
  semanticCase("journal-reset-reconciliation-adoption-transition-splice", "seal_journal_reset_reconciliation_adoption", {
    ...journalResetReconciliationAdoptionBundleValue,
    adoption_transition: resealed(adoptionTransitionValue, "transition_digest", { receipt_digest: D("f") }),
  }, "GKX_WATCHER_CONTRACT_RESET_INVALID"),
  semanticCase("journal-reset-reconciliation-adoption-raw-graph-splice", "seal_journal_reset_reconciliation_adoption", {
    ...journalResetReconciliationAdoptionBundleValue,
    raw_graph: resealed(adoptionRawGraphValue, "graph_artifact_digest", { topology_snapshot_digest: D("f") }),
  }, "GKX_WATCHER_CONTRACT_GRAPH_INVALID"),
  semanticCase("journal-reset-reconciliation-adoption-gkx-raw-domain-substitution", "seal_journal_reset_reconciliation_adoption", {
    ...journalResetReconciliationAdoptionBundleValue,
    adoption_receipt: resealed(adoptionReceiptValue, "receipt_digest", {
      gkx_snapshot_digest: adoptionRawGraphValue.graph_artifact_digest,
    }),
  }, "GKX_WATCHER_CONTRACT_RESET_INVALID"),
  semanticCase("source-removal-receipt", "seal_source_removal_receipt", receiptBundleValue),
  semanticCase("adapter-verification", "seal_adapter_verification", { scope: adapterScopeValue, binding: adapterBindingValue, challenge: challengeValue, proof: proofValue, verification: verificationValue }),
  semanticCase("status-coherent-locator", "seal_status_bundle", { locator: locatorValue, status: statusValue, active: activeValue, manifest: coherentManifestValue }),
  semanticCase("measurement-qualified", "seal_measurement", measurementValue),
  semanticCase("measurement-unavailable-zero-work", "seal_measurement", unavailableMeasurementValue),
  semanticCase("measurement-failed-no-partial-evidence", "seal_measurement", failedMeasurementValue),
  semanticCase("measurement-provider-family-local-onnx", "seal_record", vectorRetrievalTransition),
  semanticCase("measurement-provider-family-substitution", "seal_record", invalidProviderTransition, "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  semanticCase("measurement-graph-ready-reason-forbidden", "seal_record", resealed(transitions[4], "transition_digest", {
    graph_projection_state: { ...graphState, reason_codes: ["WATCHER_GRAPH_DEGRADED"] },
  }), "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  semanticCase("transition-graph-artifact-file-substitution", "seal_record", resealed(transitions[4], "transition_digest", {
    graph_projection_state: { ...graphState, graph_artifact_file: `watcher-graph-${"f".repeat(64)}.json` },
  }), "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  semanticCase("transition-retrieval-database-file-substitution", "seal_record", resealed(transitions[3], "transition_digest", {
    retrieval_projection_state: { ...retrievalState, database_file: "../../evil.sqlite" },
  }), "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  semanticCase("transition-retrieval-owner-prefix-substitution", "seal_record", resealed(transitions[3], "transition_digest", {
    retrieval_projection_state: { ...retrievalState, owner_generation_id: `ingest:${"0".repeat(24)}` },
  }), "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  semanticCase("transition-retrieval-projection-prefix-substitution", "seal_record", resealed(transitions[3], "transition_digest", {
    retrieval_projection_state: { ...retrievalState, projection_id: `retrieval:${"0".repeat(24)}` },
  }), "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  semanticCase("transition-prior-stale", "seal_transition_chain", transitions.map((item, index) => index === 3 ? resealed(item, "transition_digest", { prior_transition_digest: D("f") }) : item), "GKX_WATCHER_CONTRACT_TRANSITION_INVALID"),
  semanticCase("transition-stage-payload-early", "seal_record", resealed(transitions[1], "transition_digest", { gkx_delta_digest: D("a") }), "GKX_WATCHER_CONTRACT_TRANSITION_INVALID"),
  semanticCase("transition-exceptional-before-observed", "seal_record", resealed(failedTransitionValue, "transition_digest", { transition_ordinal: 0, prior_transition_digest: null }), "GKX_WATCHER_CONTRACT_TRANSITION_INVALID"),
  semanticCase("coherent-manifest-stage-mismatch", "seal_coherent_activation", {
    ...coherentActivationValue,
    manifest: resealed(coherentManifestValue, "coherent_manifest_digest", {
      retrieval_projection_state: { ...coherentManifestValue.retrieval_projection_state, manifest_digest: D("f") },
    }),
  }, "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  semanticCase("coherent-activation-observation-missing", "seal_coherent_activation", {
    ...coherentActivationValue, observation: null,
  }, "GKX_WATCHER_CONTRACT_RECORD_INVALID"),
  semanticCase("coherent-activation-observation-swapped", "seal_coherent_activation", {
    ...coherentActivationValue, observation: retryObservationValue,
  }, "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  semanticCase("coherent-activation-observation-self-resealed-substitution", "seal_coherent_activation", {
    ...coherentActivationValue, observation: resealed(observationValue, "observation_digest", { observed_paths: [] }),
  }, "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  semanticCase("coherent-activation-observation-artifact-file-substitution", "seal_coherent_activation", {
    ...coherentActivationValue,
    observation_authority: resealed(observationAuthorityValue, "authority_digest", { observation_artifact_file: "watcher-observation-invalid.json" }),
  }, "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  semanticCase("coherent-activation-observation-artifact-raw-substitution", "seal_coherent_activation", {
    ...coherentActivationValue,
    observation_authority: resealed(observationAuthorityValue, "authority_digest", { observation_raw_sha256: D("f") }),
  }, "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  semanticCase("coherent-activation-observation-artifact-size-substitution", "seal_coherent_activation", {
    ...coherentActivationValue,
    observation_authority: resealed(observationAuthorityValue, "authority_digest", { observation_byte_size: observationAuthorityValue.observation_byte_size + 1 }),
  }, "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  semanticCase("coherent-activation-observation-artifact-cap-plus-one", "seal_coherent_activation", {
    ...coherentActivationValue,
    observation_authority: resealed(observationAuthorityValue, "authority_digest", { observation_byte_size: 4_194_305 }),
  }, "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  semanticCase("coherent-activation-plan-missing", "seal_coherent_activation", {
    ...coherentActivationValue, plan: null,
  }, "GKX_WATCHER_CONTRACT_RECORD_INVALID"),
  semanticCase("coherent-activation-plan-self-resealed-substitution", "seal_coherent_activation", {
    ...coherentActivationValue, plan: validationRejectionPlan,
  }, "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  semanticCase("coherent-activation-plan-artifact-file-substitution", "seal_coherent_activation", {
    ...coherentActivationValue,
    plan_authority: resealed(planAuthorityValue, "authority_digest", { plan_artifact_file: "watcher-plan-invalid.json" }),
  }, "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  semanticCase("coherent-activation-plan-artifact-raw-substitution", "seal_coherent_activation", {
    ...coherentActivationValue,
    plan_authority: resealed(planAuthorityValue, "authority_digest", { plan_raw_sha256: D("f") }),
  }, "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  semanticCase("coherent-activation-plan-artifact-size-substitution", "seal_coherent_activation", {
    ...coherentActivationValue,
    plan_authority: resealed(planAuthorityValue, "authority_digest", { plan_byte_size: planAuthorityValue.plan_byte_size + 1 }),
  }, "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  semanticCase("coherent-activation-plan-artifact-cap-plus-one", "seal_coherent_activation", {
    ...coherentActivationValue,
    plan_authority: resealed(planAuthorityValue, "authority_digest", { plan_byte_size: 536_870_913 }),
  }, "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  semanticCase("canonical-graph-raw-mismatch", "seal_coherent_activation", {
    ...coherentActivationValue,
    canonical_graph: { ...canonicalGraphValue, normalized_graph: { ...canonicalGraphValue.normalized_graph, unexpected: true } },
  }, "GKX_WATCHER_CONTRACT_GRAPH_INVALID"),
  semanticCase("normalized-delta-transition-mismatch", "seal_coherent_activation", {
    ...coherentActivationValue,
    normalized_graph_delta: { ...normalizedDeltaValue, delta: { ...normalizedDeltaValue.delta, removedNodes: [] } },
  }, "GKX_WATCHER_CONTRACT_TRANSITION_INVALID"),
  semanticCase("raw-graph-topology-mismatch", "seal_coherent_activation", {
    ...coherentActivationValue,
    raw_graph: resealed(rawGraphValue, "graph_artifact_digest", { topology_snapshot_digest: D("f") }),
  }, "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  semanticCase("source-removal-activation-manifest-mismatch", "seal_coherent_activation", {
    ...coherentActivationValue,
    source_removal_activation: resealed(activationValue, "activation_digest", { coherent_manifest_digest: D("f") }),
  }, "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  semanticCase("failure-retry-superseded-forbidden", "seal_failure_retry", {
    ...failureRetryValue,
    failed_transitions: [transitions[0], resealed(failedTransitionValue, "transition_digest", { state: "superseded", terminal_state: "superseded" })],
  }, "GKX_WATCHER_CONTRACT_RETRY_INVALID"),
  semanticCase("plan-validation-rejection-not-ledger-removal", "seal_coherent_activation", {
    ...coherentActivationValue, plan: validationRejectionPlan,
  }, "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  semanticCase("topology-child-set-mismatch", "seal_record", resealed(topology, "topology_snapshot_digest", { accepted_source_set_digest: D("f") }), "GKX_WATCHER_CONTRACT_DIGEST_INVALID"),
  semanticCase("topology-source-size-phase3-cap-plus-one", "seal_record", oversizedTopology, "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  semanticCase("topology-accepted-order-substitution", "seal_record", rebuildTopology(twoAcceptedTopology, {
    accepted_sources: [...twoAcceptedTopology.accepted_sources].reverse(),
  }), "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  semanticCase("topology-accepted-rejected-coordinate-splice", "seal_record", rebuildTopology(priorTopology, {
    rejected_sources: [{ ...eventRejected(accepted.source_path), source_observation_ordinal: accepted.source_observation_ordinal }],
  }), "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  semanticCase("topology-distinct-path-ordinal-zero-accepted", "seal_record", twoAcceptedOrdinalZeroTopology),
  semanticCase("topology-same-path-ordinal-duplicate", "seal_record", rebuildTopology(twoAcceptedTopology, {
    accepted_sources: [accepted, { ...secondAccepted, source_path: accepted.source_path, source_observation_ordinal: accepted.source_observation_ordinal }],
  }), "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  semanticCase("topology-accepted-rejected-overlap", "seal_record", rebuildTopology(priorTopology, {
    rejected_sources: [{ ...eventRejected(accepted.source_path), source_observation_ordinal: 1 }],
  }), "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  semanticCase("topology-folder-order-substitution", "seal_record", rebuildTopology(priorTopology, {
    folder_paths: ["z-folder", "a-folder"],
  }), "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  semanticCase("topology-attachment-order-substitution", "seal_record", rebuildTopology(priorTopology, {
    attachment_paths: ["z.png", "a.png"],
  }), "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  semanticCase("event-mode-binding-mismatch", "seal_record", resealed(eventValue, "event_digest", { adapter_binding_digest: null }), "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  semanticCase("event-stale-target-column-forbidden", "seal_record", {
    ...eventValue, target_topology_snapshot_digest: topology.topology_snapshot_digest,
  }, "GKX_WATCHER_CONTRACT_KEYS_INVALID"),
  semanticCase("event-count-cap-plus-one", "seal_record", resealed(eventSetValue, "event_set_digest", { event_count: 1_000_001 }), "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  semanticCase("source-removal-occurrence-body-swap", "seal_source_removal_event_set", {
    ...eventSetBundleValue,
    occurrences: [resealed(occurrenceValue, "occurrence_digest", { source_path: "policy/other.md" })],
  }, "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  semanticCase("source-removal-membership-body-missing", "seal_source_removal_event_set", {
    ...eventSetBundleValue, memberships: [null],
  }, "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  semanticCase("reset-carry-prior-mismatch", "seal_source_removal_event_set", {
    ...carryBundleValue,
    memberships: [resealed(carryMembershipValue, "membership_digest", { original_membership_digest: D("f") })],
  }, "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  semanticCase("journal-reset-delivered-event-not-ready", "seal_journal_reset", {
    bundle: journalResetBundleValue,
    old_journal_authority: { ...oldJournalReadyAuthorityValue, responses: [responseValue], receipts: [receiptValue] },
    pointer_guard: journalPointerGuardValue,
  }, "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  semanticCase("journal-reset-lost-response-without-receipt", "seal_journal_reset", {
    bundle: journalResetBundleValue,
    old_journal_authority: { ...oldJournalReadyAuthorityValue, responses: [responseValue], receipts: [] },
    pointer_guard: journalPointerGuardValue,
  }, "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  semanticCase("journal-reset-carry-occurrence-omitted", "seal_journal_reset", {
    bundle: {
      ...journalResetBundleValue,
      reset_carry_bundle: {
        ...resetCarryBundleValue,
        event_set_bundle: { ...carryBundleValue, occurrences: [] },
      },
    },
    old_journal_authority: oldJournalReadyAuthorityValue,
    pointer_guard: journalPointerGuardValue,
  }, "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  semanticCase("journal-reset-carry-immediate-membership-omitted", "seal_journal_reset", {
    bundle: {
      ...journalResetBundleValue,
      reset_carry_bundle: {
        ...resetCarryBundleValue,
        event_set_bundle: { ...carryBundleValue, prior_memberships: [] },
      },
    },
    old_journal_authority: oldJournalReadyAuthorityValue,
    pointer_guard: journalPointerGuardValue,
  }, "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  semanticCase("journal-reset-response-binding-mismatch", "seal_journal_reset", {
    bundle: journalResetBundleValue,
    old_journal_authority: {
      ...oldJournalReadyAuthorityValue,
      responses: [wrongBindingResponseValue],
      receipts: [wrongBindingReceiptValue],
    },
    pointer_guard: journalPointerGuardValue,
  }, "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  semanticCase("journal-reset-guard-digest-mismatch", "seal_journal_reset", {
    bundle: { ...journalResetBundleValue, guard: resealed(resetGuardValue, "guard_digest", { reset_digest: D("f") }) },
    old_journal_authority: oldJournalReadyAuthorityValue,
    pointer_guard: journalPointerGuardValue,
  }, "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  semanticCase("journal-reset-ready-event-omitted", "seal_journal_reset", {
    bundle: { ...journalResetBundleValue, reset_carry_bundle: null },
    old_journal_authority: oldJournalReadyAuthorityValue,
    pointer_guard: journalPointerGuardValue,
  }, "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  semanticCase("journal-reset-unactivated-event-selected", "seal_journal_reset", {
    bundle: journalResetBundleValue,
    old_journal_authority: { ...oldJournalReadyAuthorityValue, activated_event_set_bundles: [] },
    pointer_guard: journalPointerGuardValue,
  }, "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  semanticCase("journal-reset-prior-membership-not-activated", "seal_journal_reset", {
    bundle: journalResetBundleValue,
    old_journal_authority: {
      ...oldJournalReadyAuthorityValue,
      activated_event_set_bundles: [{ event_set_bundle: carryBundleValue, activation: carryActivationValue }],
    },
    pointer_guard: journalPointerGuardValue,
  }, "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  semanticCase("journal-reset-genesis-bootstrap-authority-missing", "seal_journal_reset", {
    bundle: journalResetBundleValue,
    old_journal_authority: { ...oldJournalReadyAuthorityValue, journal_bootstrap_authority: null },
    pointer_guard: journalPointerGuardValue,
  }, "GKX_WATCHER_CONTRACT_RESET_INVALID"),
  semanticCase("journal-reset-genesis-meta-anchor-nonnull", "seal_journal_reset", {
    bundle: { ...journalResetBundleValue, old_meta: resealed(journalMetaValue, "meta_digest", { anchor_coherent_manifest_digest: D("f") }) },
    old_journal_authority: oldJournalReadyAuthorityValue,
    pointer_guard: journalPointerGuardValue,
  }, "GKX_WATCHER_CONTRACT_RESET_INVALID"),
  semanticCase("journal-reset-genesis-generation-anchor-nonnull", "seal_journal_reset", {
    bundle: { ...journalResetBundleValue, old_generation: resealed(journalGenerationValue, "journal_generation_digest", { anchor_coherent_manifest_digest: D("f") }) },
    old_journal_authority: oldJournalReadyAuthorityValue,
    pointer_guard: journalPointerGuardValue,
  }, "GKX_WATCHER_CONTRACT_RESET_INVALID"),
  semanticCase("journal-reset-anchored-anchor-mismatch", "seal_journal_reset", {
    bundle: { ...anchoredJournalResetBundleValue, old_generation: resealed(anchoredOldGenerationValue, "journal_generation_digest", { anchor_coherent_manifest_digest: D("f") }) },
    old_journal_authority: anchoredOldJournalAuthorityValue,
    pointer_guard: anchoredJournalPointerGuardValue,
  }, "GKX_WATCHER_CONTRACT_RESET_INVALID"),
  semanticCase("journal-reset-anchored-bootstrap-authority-forbidden", "seal_journal_reset", {
    bundle: anchoredJournalResetBundleValue,
    old_journal_authority: { ...anchoredOldJournalAuthorityValue, journal_bootstrap_authority: journalBootstrapAuthorityValue },
    pointer_guard: anchoredJournalPointerGuardValue,
  }, "GKX_WATCHER_CONTRACT_RESET_INVALID"),
  semanticCase("journal-reset-bootstrap-target-substitution", "seal_journal_reset", {
    bundle: journalResetBundleValue,
    old_journal_authority: {
      ...oldJournalReadyAuthorityValue,
      journal_bootstrap_authority: resealed(journalBootstrapAuthorityValue, "authority_digest", {
        target_journal_pointer_digest: D("f"),
        target_journal_pointer_file: `watcher-journal-pointer-${"f".repeat(64)}.json`,
      }),
    },
    pointer_guard: journalPointerGuardValue,
  }, "GKX_WATCHER_CONTRACT_RESET_INVALID"),
  semanticCase("journal-reset-current-outer-manifest-substitution", "seal_journal_reset", {
    bundle: journalResetBundleValue,
    old_journal_authority: {
      ...oldJournalReadyAuthorityValue,
      outer_coherent_manifest: resealed(coherentManifestValue, "coherent_manifest_digest", { configuration_digest: D("f") }),
    },
    pointer_guard: journalPointerGuardValue,
  }, "GKX_WATCHER_CONTRACT_RESET_INVALID"),
  semanticCase("journal-reset-current-active-substitution", "seal_journal_reset", {
    bundle: journalResetBundleValue,
    old_journal_authority: {
      ...oldJournalReadyAuthorityValue,
      active_coherent: resealed(activeValue, "active_digest", { pointer_digest: D("f") }),
    },
    pointer_guard: journalPointerGuardValue,
  }, "GKX_WATCHER_CONTRACT_RESET_INVALID"),
  semanticCase("journal-reset-new-meta-null-anchor", "seal_journal_reset", {
    bundle: { ...journalResetBundleValue, new_meta: resealed(newJournalMetaValue, "meta_digest", { anchor_coherent_manifest_digest: null }) },
    old_journal_authority: oldJournalReadyAuthorityValue,
    pointer_guard: journalPointerGuardValue,
  }, "GKX_WATCHER_CONTRACT_RESET_INVALID"),
  semanticCase("journal-reset-new-generation-historical-anchor", "seal_journal_reset", {
    bundle: { ...journalResetBundleValue, new_generation: resealed(newJournalGenerationValue, "journal_generation_digest", { anchor_coherent_manifest_digest: historicalAnchorDigest }) },
    old_journal_authority: oldJournalReadyAuthorityValue,
    pointer_guard: journalPointerGuardValue,
  }, "GKX_WATCHER_CONTRACT_RESET_INVALID"),
  semanticCase("journal-reset-current-outer-reset-substitution", "seal_journal_reset", {
    bundle: { ...journalResetBundleValue, reset: resealed(resetValue, "reset_digest", { outer_coherent_manifest_digest: D("f") }) },
    old_journal_authority: oldJournalReadyAuthorityValue,
    pointer_guard: journalPointerGuardValue,
  }, "GKX_WATCHER_CONTRACT_RESET_INVALID"),
  semanticCase("journal-reset-pointer-target-mismatch", "seal_journal_reset", {
    bundle: journalResetBundleValue,
    old_journal_authority: oldJournalReadyAuthorityValue,
    pointer_guard: resealed(journalPointerGuardValue, "guard_digest", { target_commit_digest: D("f") }),
  }, "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  semanticCase("journal-pointer-guard-operation-mismatch", "seal_record", resealed(journalPointerGuardValue, "guard_digest", {
    operation: "replace_watcher_active_pointer",
  }), "GKX_WATCHER_CONTRACT_POINTER_INVALID"),
  semanticCase("receipt-request-source-mismatch", "seal_source_removal_receipt", {
    ...receiptBundleValue, request: resealed(requestValue, "request_digest", { source_digest: D("f") }),
  }, "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  semanticCase("receipt-request-idempotency-key-substitution", "seal_source_removal_receipt", {
    ...receiptBundleValue, request: resealed(requestValue, "request_digest", { idempotency_key: D("f") }),
  }, "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  semanticCase("receipt-binding-change-on-retry", "seal_source_removal_receipt", {
    ...receiptBundleValue,
    binding: resealed(adapterBindingValue, "binding_digest", { adapter_id: "replacement-ledger" }),
  }, "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  semanticCase("receipt-response-status-substitution", "seal_source_removal_receipt", {
    ...receiptBundleValue, response: alreadyAppliedResponseValue,
  }, "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  semanticCase("receipt-response-result-substitution", "seal_source_removal_receipt", {
    ...receiptBundleValue, response: wrongResultResponseValue,
  }, "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  semanticCase("receipt-response-event-id-substitution", "seal_source_removal_receipt", {
    ...receiptBundleValue, response: differentAdapterEventResponseValue,
  }, "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  semanticCase("receipt-without-durable-response", "seal_source_removal_receipt", {
    ...receiptBundleValue, response: null,
  }, "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  semanticCase("adapter-verification-binding-mismatch", "seal_adapter_verification", {
    scope: adapterScopeValue, binding: adapterBindingValue, challenge: challengeValue,
    proof: resealed(proofValue, "proof_digest", { adapter_id: "different-adapter" }), verification: verificationValue,
  }, "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  semanticCase("adapter-scope-operation-substitution", "seal_adapter_verification", {
    scope: resealed(adapterScopeValue, "authorization_binding_digest", { authorized_operation: "retrieval.source_removed" }),
    binding: adapterBindingValue, challenge: challengeValue, proof: proofValue, verification: verificationValue,
  }, "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  semanticCase("adapter-binding-capability-substitution", "seal_adapter_verification", {
    scope: adapterScopeValue,
    binding: resealed(adapterBindingValue, "binding_digest", { capabilities: ["lookup_by_occurrence_digest"] }),
    challenge: challengeValue, proof: proofValue, verification: verificationValue,
  }, "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  semanticCase("adapter-challenge-nonce-substitution", "seal_adapter_verification", {
    scope: adapterScopeValue, binding: adapterBindingValue,
    challenge: resealed(challengeValue, "challenge_digest", { nonce: "fedcba9876543210fedcba9876543210" }),
    proof: proofValue, verification: verificationValue,
  }, "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  semanticCase("adapter-challenge-capability-order-substitution", "seal_adapter_verification", {
    scope: adapterScopeValue, binding: adapterBindingValue,
    challenge: resealed(challengeValue, "challenge_digest", { required_capabilities: [...challengeValue.required_capabilities].reverse() }),
    proof: proofValue, verification: verificationValue,
  }, "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  semanticCase("adapter-proof-authorization-substitution", "seal_adapter_verification", {
    scope: adapterScopeValue, binding: adapterBindingValue, challenge: challengeValue,
    proof: resealed(proofValue, "proof_digest", { authorization_binding_digest: D("f") }), verification: verificationValue,
  }, "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  semanticCase("adapter-verification-challenge-substitution", "seal_adapter_verification", {
    scope: adapterScopeValue, binding: adapterBindingValue, challenge: challengeValue, proof: proofValue,
    verification: resealed(verificationValue, "verification_receipt_digest", { challenge_digest: D("f") }),
  }, "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  semanticCase("adapter-json-self-provision-without-verification", "seal_adapter_verification", {
    scope: adapterScopeValue, binding: adapterBindingValue, challenge: challengeValue, proof: proofValue, verification: null,
  }, "GKX_WATCHER_CONTRACT_RECORD_INVALID"),
  semanticCase("adapter-id-path-like", "seal_record", resealed(adapterBindingValue, "binding_digest", {
    adapter_id: "ledger/path",
  }), "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  semanticCase("adapter-id-uppercase", "seal_record", resealed(adapterBindingValue, "binding_digest", {
    adapter_id: "Ledger",
  }), "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  semanticCase("adapter-id-cap-plus-one", "seal_record", resealed(adapterBindingValue, "binding_digest", {
    adapter_id: "a".repeat(129),
  }), "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  semanticCase("adapter-namespace-control", "seal_record", resealed(adapterBindingValue, "binding_digest", {
    authority_namespace: "ledger\nnamespace",
  }), "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  semanticCase("adapter-event-id-path-like", "seal_record", resealed(responseValue, "response_digest", {
    adapter_event_id: "event/path",
  }), "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  semanticCase("measurement-sample-count", "seal_measurement", resealed(measurementValue, "measurement_digest", { edit_latency_micros: samples.slice(1) }), "GKX_WATCHER_CONTRACT_MEASUREMENT_INVALID"),
  semanticCase("measurement-sample-count-cap-plus-one", "seal_measurement", resealed(measurementValue, "measurement_digest", { edit_latency_micros: [...samples, samples.at(-1)] }), "GKX_WATCHER_CONTRACT_MEASUREMENT_INVALID"),
  semanticCase("measurement-latency-threshold-plus-one", "seal_measurement", resealed(measurementValue, "measurement_digest", {
    edit_latency_micros: [...samples.slice(0, 19), 5_000_001],
    percentiles_micros: { p50: samples[9], p95: samples[18], p99: 5_000_001, max: 5_000_001 },
  }), "GKX_WATCHER_CONTRACT_MEASUREMENT_INVALID"),
  semanticCase("measurement-percentile-index-swap", "seal_measurement", resealed(measurementValue, "measurement_digest", {
    percentiles_micros: { ...measurementValue.percentiles_micros, p95: samples[17] },
  }), "GKX_WATCHER_CONTRACT_MEASUREMENT_INVALID"),
  semanticCase("measurement-source-count-drift", "seal_measurement", resealed(measurementValue, "measurement_digest", {
    source_work: { ...measurementValue.source_work, total_generation_count: 22 },
  }), "GKX_WATCHER_CONTRACT_MEASUREMENT_INVALID"),
  semanticCase("measurement-unavailable-partial-child", "seal_measurement", resealed(unavailableMeasurementValue, "measurement_digest", {
    edit_latency_micros: samples,
  }), "GKX_WATCHER_CONTRACT_MEASUREMENT_INVALID"),
  semanticCase("measurement-failed-partial-child", "seal_measurement", resealed(failedMeasurementValue, "measurement_digest", {
    convergence: convergenceValue,
  }), "GKX_WATCHER_CONTRACT_MEASUREMENT_INVALID"),
  semanticCase("measurement-environment-mismatch", "seal_measurement", resealed(measurementValue, "measurement_digest", {
    environment: resealed(environmentValue, "environment_digest", { runtime_version: "23.0.0" }),
  }), "GKX_WATCHER_CONTRACT_MEASUREMENT_INVALID"),
  semanticCase("measurement-environment-domain-substitution", "seal_measurement", resealed(measurementValue, "measurement_digest", {
    environment: convergenceValue,
  }), "GKX_WATCHER_CONTRACT_MEASUREMENT_INVALID"),
  semanticCase("measurement-convergence-domain-substitution", "seal_measurement", resealed(measurementValue, "measurement_digest", {
    convergence: environmentValue,
  }), "GKX_WATCHER_CONTRACT_MEASUREMENT_INVALID"),
  semanticCase("measurement-fts-reference-unavailable-branch-swap", "seal_measurement", resealed(unavailableMeasurementValue, "measurement_digest", {
    fts_qualification: resealed(unavailableFtsValue, "outcome_digest", { lane_kind: "reference" }),
  }), "GKX_WATCHER_CONTRACT_MEASUREMENT_INVALID"),
  semanticCase("status-fresh-reason", "seal_record", resealed(statusValue, "status_digest", { reason_codes: ["WATCHER_REBUILD_IN_PROGRESS"] }), "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  semanticCase("status-locator-pid-mismatch", "seal_status_bundle", {
    locator: resealed(locatorValue, "locator_digest", { pid: 43 }), status: statusValue, active: activeValue, manifest: coherentManifestValue,
  }, "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  semanticCase("batch-id-not-uuidv7", "seal_record", resealed(batchValue, "batch_record_digest", { batch_id: "batch-1" }), "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
];

const canonicalGraphMutation = (changes) => ({
  ...canonicalGraphValue,
  normalized_graph: { ...clone(canonicalGraphValue.normalized_graph), ...changes },
});
semanticCases.push(
  semanticCaseWithResult("canonical-graph-top-node-by-id-ignored", "normalize_canonical_graph", [{ ...emptyRawGraph, nodeById: {} }], canonicalGraphValue),
  rejectingSemanticCase("canonical-graph-diagnostics-extra-key", "seal_record", [canonicalGraphMutation({
    diagnostics: { ...canonicalGraphValue.normalized_graph.diagnostics, unratified: 1 },
  })], "GKX_WATCHER_CONTRACT_GRAPH_INVALID"),
  rejectingSemanticCase("canonical-graph-diagnostics-missing-key", "seal_record", [canonicalGraphMutation({
    diagnostics: Object.fromEntries(Object.entries(canonicalGraphValue.normalized_graph.diagnostics).filter(([key]) => key !== "notes")),
  })], "GKX_WATCHER_CONTRACT_GRAPH_INVALID"),
  rejectingSemanticCase("canonical-graph-stats-extra-key", "seal_record", [canonicalGraphMutation({
    stats: { ...canonicalGraphValue.normalized_graph.stats, unratified: 1 },
  })], "GKX_WATCHER_CONTRACT_GRAPH_INVALID"),
  rejectingSemanticCase("canonical-graph-stats-missing-files", "seal_record", [canonicalGraphMutation({
    stats: Object.fromEntries(Object.entries(canonicalGraphValue.normalized_graph.stats).filter(([key]) => key !== "files")),
  })], "GKX_WATCHER_CONTRACT_GRAPH_INVALID"),
  rejectingSemanticCase("canonical-graph-top-extra-key", "seal_record", [canonicalGraphMutation({ unratified: 1 })], "GKX_WATCHER_CONTRACT_GRAPH_INVALID"),
  rejectingSemanticCase("canonical-graph-top-missing-key", "seal_record", [{
    ...canonicalGraphValue,
    normalized_graph: Object.fromEntries(Object.entries(canonicalGraphValue.normalized_graph).filter(([key]) => key !== "areas")),
  }], "GKX_WATCHER_CONTRACT_GRAPH_INVALID"),
  rejectingSemanticCase("raw-graph-diagnostics-extra-key", "normalize_canonical_graph", [{
    ...emptyRawGraph, diagnostics: { ...emptyRawGraph.diagnostics, unratified: 1 },
  }], "GKX_WATCHER_CONTRACT_GRAPH_INVALID"),
  rejectingSemanticCase("raw-graph-stats-extra-key", "normalize_canonical_graph", [{
    ...emptyRawGraph, stats: { ...emptyRawGraph.stats, unratified: 1 },
  }], "GKX_WATCHER_CONTRACT_GRAPH_INVALID"),
  rejectingSemanticCase("raw-graph-stats-missing-files", "normalize_canonical_graph", [{
    ...emptyRawGraph, stats: Object.fromEntries(Object.entries(emptyRawGraph.stats).filter(([key]) => key !== "files")),
  }], "GKX_WATCHER_CONTRACT_GRAPH_INVALID"),
  rejectingSemanticCase("raw-graph-top-extra-key", "normalize_canonical_graph", [{ ...emptyRawGraph, unratified: 1 }], "GKX_WATCHER_CONTRACT_GRAPH_INVALID"),
  rejectingSemanticCase("raw-graph-top-missing-key", "normalize_canonical_graph", [
    Object.fromEntries(Object.entries(emptyRawGraph).filter(([key]) => key !== "areas")),
  ], "GKX_WATCHER_CONTRACT_GRAPH_INVALID"),
  rejectingSemanticCase("raw-graph-artifact-stats-extra-key", "seal_record", [resealed(rawGraphValue, "graph_artifact_digest", {
    graph: { ...emptyRawGraph, stats: { ...emptyRawGraph.stats, unratified: 1 } },
  })], "GKX_WATCHER_CONTRACT_GRAPH_INVALID"),
);

for (const terminalState of ["failed", "superseded"]) {
  for (let stageIndex = 0; stageIndex < 6; stageIndex++) {
    const terminal = exceptionalTransitionAfter(transitions[stageIndex], terminalState);
    const chain = [...transitions.slice(0, stageIndex + 1), terminal];
    semanticCases.push(semanticCase(
      `transition-${terminalState}-after-${normalStates[stageIndex]}`,
      "seal_transition_chain",
      chain,
    ));
  }
}
const repeatedObserved = resealed(transitions[0], "transition_digest", {
  transition_ordinal: 1, prior_transition_digest: transitions[0].transition_digest,
});
const postCompleteFailure = exceptionalTransitionAfter(transitions[6], "failed");
semanticCases.push(
  semanticCase("transition-skip-normalized", "seal_transition_chain", [transitions[0], transitions[2]], "GKX_WATCHER_CONTRACT_TRANSITION_INVALID"),
  semanticCase("transition-repeat-observed", "seal_transition_chain", [transitions[0], repeatedObserved], "GKX_WATCHER_CONTRACT_TRANSITION_INVALID"),
  semanticCase("transition-reordered", "seal_transition_chain", [transitions[0], transitions[2], transitions[1]], "GKX_WATCHER_CONTRACT_TRANSITION_INVALID"),
  semanticCase("transition-cross-batch-splice", "seal_transition_chain", transitions.map((item, index) => index === 3
    ? resealed(item, "transition_digest", { batch_id: retryBatchId }) : item), "GKX_WATCHER_CONTRACT_TRANSITION_INVALID"),
  semanticCase("transition-recorded-time-provenance-splice", "seal_transition_chain", transitions.map((item, index) => index === 2
    ? resealed(item, "transition_digest", { recorded_at: "2026-08-20T00:00:00.001Z" }) : item), "GKX_WATCHER_CONTRACT_TRANSITION_INVALID"),
  semanticCase("transition-unknown-key", "seal_transition_chain", transitions.map((item, index) => index === 2
    ? { ...item, unexpected: true } : item), "GKX_WATCHER_CONTRACT_KEYS_INVALID"),
  semanticCase("transition-post-complete-terminal", "seal_transition_chain", [...transitions, postCompleteFailure], "GKX_WATCHER_CONTRACT_TRANSITION_INVALID"),
  semanticCase("transition-terminal-reopened", "seal_transition_chain", [transitions[0], failedTransitionValue, transitions[1]], "GKX_WATCHER_CONTRACT_TRANSITION_INVALID"),
  semanticCase("coherent-activation-targets-prepared-not-complete", "seal_coherent_activation", coherentActivationValue,
    "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
);
semanticCases.at(-1).input.arguments[1] = resealed(pointerGuardValue, "guard_digest", {
  target_commit_digest: transitions[5].transition_digest,
});

const pointerRecipe = (changes) => ({ ...clone(pointerRecoveryRecipeValue), ...changes });
const pointerCases = [
  ["pointer-stage-only-link", pointerRecipe({ stage: pointerStageLeaf(), guard: null, temp: null }), pointerDecisionValue("link_stage_to_guard", "fixed_old", pointerGuardValue.old_pointer_digest, "continue")],
  ["pointer-stage-incomplete-discard", pointerRecipe({ stage: pointerStageLeaf("1", "20", 1, "incomplete_noncanonical"), guard: null, temp: null }), pointerDecisionValue("discard_incomplete_stage", "fixed_old", pointerGuardValue.old_pointer_digest, "continue")],
  ["pointer-stage-guard-same-inode-unlink", pointerRecipe({ stage: pointerStageLeaf("1", "30", 2), guard: pointerGuardLeaf("1", "30", 2), temp: null }), pointerDecisionValue("unlink_stage_after_link", "guard_bound_old", pointerGuardValue.old_pointer_digest, "continue")],
  ["pointer-stage-guard-distinct-inode-retain", pointerRecipe({ stage: pointerStageLeaf("1", "30", 2), guard: pointerGuardLeaf("1", "31", 2), temp: null }), pointerDecisionValue("retain_and_fail", "fail_closed", null, "retain_and_fail")],
  ["pointer-guard-old-temp-exact-replace", pointerRecipe({ temp: pointerTempLeaf() }), pointerDecisionValue("replace_temp_to_fixed", "guard_bound_old", pointerGuardValue.old_pointer_digest, "continue")],
  ["pointer-guard-old-temp-incomplete-discard", pointerRecipe({ temp: pointerTempLeaf("incomplete_noncanonical") }), pointerDecisionValue("discard_incomplete_temp", "guard_bound_old", pointerGuardValue.old_pointer_digest, "continue")],
  ["pointer-guard-new-finalize", pointerRecipe({ fixed: pointerFixedNewLeaf(), temp: null, committed_target_state: "prepared" }), pointerDecisionValue("finalize_committed_target", "guard_bound_old", pointerGuardValue.old_pointer_digest, "continue")],
  ["pointer-guard-raw-digest-substitution-retain", pointerRecipe({ guard: {
    ...pointerGuardLeaf(), raw_sha256: D("f"),
  } }), pointerDecisionValue("retain_and_fail", "fail_closed", null, "retain_and_fail")],
  ["pointer-guard-absent-fixed-new-serve", pointerRecipe({ guard: null, fixed: pointerFixedNewLeaf(), temp: null, committed_target_state: "committed" }), pointerDecisionValue("serve_fixed_new", "fixed_new", pointerGuardValue.new_pointer_digest, "serve")],
  ["pointer-guard-absent-fixed-old-serve", pointerRecipe({ guard: null, temp: null, committed_target_state: "old" }), pointerDecisionValue("serve_guard_bound_old", "fixed_old", pointerGuardValue.old_pointer_digest, "serve")],
  ["pointer-guard-absent-temp-present-retain", pointerRecipe({ guard: null, temp: pointerTempLeaf(), committed_target_state: "old" }), pointerDecisionValue("retain_and_fail", "fail_closed", null, "retain_and_fail")],
  ["pointer-fixed-new-temp-coexist-retain", pointerRecipe({ fixed: pointerFixedNewLeaf(), temp: pointerTempLeaf(), committed_target_state: "committed" }), pointerDecisionValue("retain_and_fail", "fail_closed", null, "retain_and_fail")],
  ["pointer-parent-wrong-owner-retain", pointerRecipe({ parent: { ...pointerRecoveryRecipeValue.parent, capability_state: "wrong_owner" } }), pointerDecisionValue("retain_and_fail", "fail_closed", null, "retain_and_fail")],
  ["pointer-parent-non-directory-retain", pointerRecipe({ parent: { ...pointerRecoveryRecipeValue.parent, capability_state: "non_directory" } }), pointerDecisionValue("retain_and_fail", "fail_closed", null, "retain_and_fail")],
  ["pointer-parent-reparse-retain", pointerRecipe({ parent: { ...pointerRecoveryRecipeValue.parent, capability_state: "symlink_or_reparse" } }), pointerDecisionValue("retain_and_fail", "fail_closed", null, "retain_and_fail")],
  ["pointer-parent-alias-retain", pointerRecipe({ parent: { ...pointerRecoveryRecipeValue.parent, capability_state: "aliased" } }), pointerDecisionValue("retain_and_fail", "fail_closed", null, "retain_and_fail")],
  ["pointer-parent-windows-identity-unstable-retain", pointerRecipe({ parent: { ...pointerRecoveryRecipeValue.parent, capability_state: "windows_identity_unstable" } }), pointerDecisionValue("retain_and_fail", "fail_closed", null, "retain_and_fail")],
  ["pointer-stage-third-link-retain", pointerRecipe({ stage: pointerStageLeaf("1", "30", 3), guard: pointerGuardLeaf("1", "30", 3), temp: null }), pointerDecisionValue("retain_and_fail", "fail_closed", null, "retain_and_fail")],
  ["pointer-stage-wrong-owner-retain", pointerRecipe({ stage: { ...pointerStageLeaf(), capability_state: "wrong_owner" }, guard: null, temp: null }), pointerDecisionValue("retain_and_fail", "fail_closed", null, "retain_and_fail")],
  ["pointer-fixed-symlink-reparse-retain", pointerRecipe({ fixed: { ...pointerRecoveryRecipeValue.fixed, capability_state: "symlink_or_reparse" }, temp: null }), pointerDecisionValue("retain_and_fail", "fail_closed", null, "retain_and_fail")],
  ["pointer-fixed-case-alias-retain", pointerRecipe({ fixed: { ...pointerRecoveryRecipeValue.fixed, capability_state: "aliased" }, temp: null }), pointerDecisionValue("retain_and_fail", "fail_closed", null, "retain_and_fail")],
  ["pointer-fixed-short-path-alias-retain", pointerRecipe({ fixed: { ...pointerRecoveryRecipeValue.fixed, capability_state: "windows_identity_unstable" }, temp: null }), pointerDecisionValue("retain_and_fail", "fail_closed", null, "retain_and_fail")],
  ["pointer-artifact-hardlink-retain", pointerRecipe({ old_artifact: { ...pointerRecoveryRecipeValue.old_artifact, nlink: 2 } }), pointerDecisionValue("retain_and_fail", "fail_closed", null, "retain_and_fail")],
  ["pointer-artifact-fd-path-swap-retain", pointerRecipe({ old_artifact: { ...pointerRecoveryRecipeValue.old_artifact, capability_state: "outside_parent" } }), pointerDecisionValue("retain_and_fail", "fail_closed", null, "retain_and_fail")],
  ["pointer-artifact-byte-size-substitution-retain", pointerRecipe({ old_artifact: { ...pointerRecoveryRecipeValue.old_artifact, byte_size: pointerGuardValue.old_pointer_byte_size + 1 } }), pointerDecisionValue("retain_and_fail", "fail_closed", null, "retain_and_fail")],
  ["pointer-temp-canonical-mismatch-retain", pointerRecipe({ temp: pointerLeaf(pointerGuardValue.temp_basename, "1", "21", 1, D("f"), D("e"), 333, "canonical_mismatch") }), pointerDecisionValue("retain_and_fail", "fail_closed", null, "retain_and_fail")],
  ["pointer-fixed-other-retain", pointerRecipe({ fixed: pointerLeaf(pointerGuardValue.final_basename, "1", "40", 1, D("f"), D("e"), 333, "canonical_mismatch"), temp: null }), pointerDecisionValue("retain_and_fail", "fail_closed", null, "retain_and_fail")],
];
for (const [caseId, recipe, decision] of pointerCases) {
  semanticCases.push(semanticCaseWithResult(caseId, "seal_pointer_recovery", [recipe, pointerGuardValue], decision));
}

const genesisStateChanges = Object.freeze({
  empty: {},
  "fixed-new": { fixed: genesisFixedNewLeaf() },
  "guard-empty": { guard: genesisGuardLeaf() },
  "guard-fixed-new": { guard: genesisGuardLeaf(), fixed: genesisFixedNewLeaf() },
  "guard-temp-exact": { guard: genesisGuardLeaf(), temp: genesisTempLeaf() },
  "guard-temp-incomplete": { guard: genesisGuardLeaf(), temp: genesisTempLeaf("incomplete_noncanonical") },
  "stage-exact": { stage: genesisStageLeaf() },
  "stage-guard-same-inode": { stage: genesisStageLeaf("1", "30", 2), guard: genesisGuardLeaf("1", "30", 2) },
  "stage-incomplete": { stage: genesisStageLeaf("1", "20", 1, "incomplete_noncanonical") },
});
semanticCases.push(
  semanticCaseWithResult("pointer-genesis-activation-intent-authority", "seal_record", [genesisIntentValue], genesisIntentValue),
  semanticCaseWithResult("pointer-genesis-active-pointer-authority", "seal_record", [genesisPointerValue], genesisPointerValue),
);
const genesisRetainDecision = pointerDecisionValue("retain_and_fail", "fail_closed", null, "retain_and_fail");
const genesisNoneServeDecision = pointerDecisionValue("serve_guard_bound_old", "genesis_none", null, "serve");
const genesisMatrix = [
  ["pointer-genesis-empty-ambiguous-retain", "ambiguous", "empty", genesisRetainDecision],
  ["pointer-genesis-empty-committed-retain", "committed", "empty", genesisRetainDecision],
  ["pointer-genesis-empty-old-serve", "old", "empty", genesisNoneServeDecision],
  ["pointer-genesis-empty-prepared-serve", "prepared", "empty", genesisNoneServeDecision],
  ["pointer-genesis-fixed-new-ambiguous-retain", "ambiguous", "fixed-new", genesisRetainDecision],
  ["pointer-genesis-fixed-new-committed-serve", "committed", "fixed-new", pointerDecisionValue("serve_fixed_new", "fixed_new", genesisPointerGuardValue.new_pointer_digest, "serve")],
  ["pointer-genesis-fixed-new-old-retain", "old", "fixed-new", genesisRetainDecision],
  ["pointer-genesis-fixed-new-prepared-retain", "prepared", "fixed-new", genesisRetainDecision],
  ["pointer-genesis-guard-empty-ambiguous-retain", "ambiguous", "guard-empty", genesisRetainDecision],
  ["pointer-genesis-guard-empty-committed-retain", "committed", "guard-empty", genesisRetainDecision],
  ["pointer-genesis-guard-empty-old-retain", "old", "guard-empty", genesisRetainDecision],
  ["pointer-genesis-guard-empty-prepared-create-temp", "prepared", "guard-empty", pointerDecisionValue("create_temp", "genesis_none", null, "continue")],
  ["pointer-genesis-guard-fixed-new-ambiguous-retain", "ambiguous", "guard-fixed-new", genesisRetainDecision],
  ["pointer-genesis-guard-fixed-new-committed-finalize", "committed", "guard-fixed-new", pointerDecisionValue("finalize_committed_target", "genesis_none", null, "continue")],
  ["pointer-genesis-guard-fixed-new-old-retain", "old", "guard-fixed-new", genesisRetainDecision],
  ["pointer-genesis-guard-fixed-new-prepared-finalize", "prepared", "guard-fixed-new", pointerDecisionValue("finalize_committed_target", "genesis_none", null, "continue")],
  ["pointer-genesis-guard-temp-exact-ambiguous-retain", "ambiguous", "guard-temp-exact", genesisRetainDecision],
  ["pointer-genesis-guard-temp-exact-committed-retain", "committed", "guard-temp-exact", genesisRetainDecision],
  ["pointer-genesis-guard-temp-exact-old-retain", "old", "guard-temp-exact", genesisRetainDecision],
  ["pointer-genesis-guard-temp-exact-prepared-replace", "prepared", "guard-temp-exact", pointerDecisionValue("replace_temp_to_fixed", "genesis_none", null, "continue")],
  ["pointer-genesis-guard-temp-incomplete-ambiguous-retain", "ambiguous", "guard-temp-incomplete", genesisRetainDecision],
  ["pointer-genesis-guard-temp-incomplete-committed-retain", "committed", "guard-temp-incomplete", genesisRetainDecision],
  ["pointer-genesis-guard-temp-incomplete-old-retain", "old", "guard-temp-incomplete", genesisRetainDecision],
  ["pointer-genesis-guard-temp-incomplete-prepared-discard", "prepared", "guard-temp-incomplete", pointerDecisionValue("discard_incomplete_temp", "genesis_none", null, "continue")],
  ["pointer-genesis-stage-exact-ambiguous-retain", "ambiguous", "stage-exact", genesisRetainDecision],
  ["pointer-genesis-stage-exact-committed-retain", "committed", "stage-exact", genesisRetainDecision],
  ["pointer-genesis-stage-exact-old-retain", "old", "stage-exact", genesisRetainDecision],
  ["pointer-genesis-stage-exact-prepared-link", "prepared", "stage-exact", pointerDecisionValue("link_stage_to_guard", "genesis_none", null, "continue")],
  ["pointer-genesis-stage-guard-same-inode-ambiguous-retain", "ambiguous", "stage-guard-same-inode", genesisRetainDecision],
  ["pointer-genesis-stage-guard-same-inode-committed-retain", "committed", "stage-guard-same-inode", genesisRetainDecision],
  ["pointer-genesis-stage-guard-same-inode-old-retain", "old", "stage-guard-same-inode", genesisRetainDecision],
  ["pointer-genesis-stage-guard-same-inode-prepared-unlink", "prepared", "stage-guard-same-inode", pointerDecisionValue("unlink_stage_after_link", "genesis_none", null, "continue")],
  ["pointer-genesis-stage-incomplete-ambiguous-retain", "ambiguous", "stage-incomplete", genesisRetainDecision],
  ["pointer-genesis-stage-incomplete-committed-retain", "committed", "stage-incomplete", genesisRetainDecision],
  ["pointer-genesis-stage-incomplete-old-retain", "old", "stage-incomplete", genesisRetainDecision],
  ["pointer-genesis-stage-incomplete-prepared-discard", "prepared", "stage-incomplete", pointerDecisionValue("discard_incomplete_stage", "genesis_none", null, "continue")],
];
for (const [caseId, target, state, decision] of genesisMatrix) {
  semanticCases.push(semanticCaseWithResult(caseId, "seal_pointer_recovery", [
    genesisRecipe(target, genesisStateChanges[state]), genesisPointerGuardValue,
  ], decision));
}

const genesisFixedMismatch = pointerLeaf(genesisPointerGuardValue.final_basename, "1", "40", 1, D("f"), D("e"), 333, "canonical_mismatch");
const genesisGuardMismatch = pointerLeaf(genesisPointerGuardValue.guard_basename, "1", "10", 1, D("f"), D("e"), 333, "canonical_mismatch");
const genesisStageMismatch = pointerLeaf(genesisPointerGuardValue.guard_stage_basename, "1", "20", 1, D("f"), D("e"), 333, "canonical_mismatch");
const genesisTempMismatch = pointerLeaf(genesisPointerGuardValue.temp_basename, "1", "21", 1, D("f"), D("e"), 333, "canonical_mismatch");
const genesisRetainCases = [
  ["pointer-genesis-fixed-mismatch-prepared-retain", genesisRecipe("prepared", { fixed: genesisFixedMismatch })],
  ["pointer-genesis-fixed-new-temp-coexist-ambiguous-retain", genesisRecipe("ambiguous", { fixed: genesisFixedNewLeaf(), temp: genesisTempLeaf() })],
  ["pointer-genesis-fixed-new-temp-coexist-committed-retain", genesisRecipe("committed", { fixed: genesisFixedNewLeaf(), temp: genesisTempLeaf() })],
  ["pointer-genesis-fixed-new-temp-coexist-old-retain", genesisRecipe("old", { fixed: genesisFixedNewLeaf(), temp: genesisTempLeaf() })],
  ["pointer-genesis-fixed-new-temp-coexist-prepared-retain", genesisRecipe("prepared", { fixed: genesisFixedNewLeaf(), temp: genesisTempLeaf() })],
  ["pointer-genesis-guard-leaf-canonical-mismatch-prepared-retain", genesisRecipe("prepared", { guard: genesisGuardMismatch })],
  ["pointer-genesis-guard-temp-canonical-mismatch-prepared-retain", genesisRecipe("prepared", { guard: genesisGuardLeaf(), temp: genesisTempMismatch })],
  ["pointer-genesis-no-guard-temp-present-ambiguous-retain", genesisRecipe("ambiguous", { temp: genesisTempLeaf() })],
  ["pointer-genesis-no-guard-temp-present-committed-retain", genesisRecipe("committed", { temp: genesisTempLeaf() })],
  ["pointer-genesis-no-guard-temp-present-old-retain", genesisRecipe("old", { temp: genesisTempLeaf() })],
  ["pointer-genesis-no-guard-temp-present-prepared-retain", genesisRecipe("prepared", { temp: genesisTempLeaf() })],
  ["pointer-genesis-parent-wrong-owner-prepared-retain", genesisRecipe("prepared", { parent: { ...genesisRecipe("prepared").parent, capability_state: "wrong_owner" } })],
  ["pointer-genesis-stage-canonical-mismatch-prepared-retain", genesisRecipe("prepared", { stage: genesisStageMismatch })],
  ["pointer-genesis-stage-guard-distinct-inode-prepared-retain", genesisRecipe("prepared", { stage: genesisStageLeaf("1", "30", 2), guard: genesisGuardLeaf("1", "31", 2) })],
  ["pointer-genesis-stage-guard-third-link-prepared-retain", genesisRecipe("prepared", { stage: genesisStageLeaf("1", "30", 3), guard: genesisGuardLeaf("1", "30", 3) })],
];
for (const [caseId, recipe] of genesisRetainCases) {
  semanticCases.push(semanticCaseWithResult(caseId, "seal_pointer_recovery", [recipe, genesisPointerGuardValue], genesisRetainDecision));
}

const partialGenesisGuardCases = [
  ["pointer-genesis-old-group-partial-byte-size-invalid", { old_pointer_byte_size: 256 }],
  ["pointer-genesis-old-group-partial-device-invalid", { old_final_device: "1" }],
  ["pointer-genesis-old-group-partial-digest-invalid", { old_pointer_digest: D("4") }],
  ["pointer-genesis-old-group-partial-file-invalid", { old_pointer_file: `watcher-pointer-${D("4").slice(7)}.json` }],
  ["pointer-genesis-old-group-partial-inode-invalid", { old_final_inode: "3" }],
  ["pointer-genesis-old-group-partial-raw-invalid", { old_pointer_raw_sha256: D("5") }],
];
semanticCases.push(
  rejectingSemanticCase("pointer-genesis-new-artifact-null-invalid", "seal_pointer_recovery", [genesisRecipe("prepared", { new_artifact: null }), genesisPointerGuardValue], "GKX_WATCHER_CONTRACT_POINTER_INVALID"),
  rejectingSemanticCase("pointer-genesis-old-artifact-nonnull-invalid", "seal_pointer_recovery", [genesisRecipe("prepared", { old_artifact: genesisNewArtifactLeaf() }), genesisPointerGuardValue], "GKX_WATCHER_CONTRACT_POINTER_INVALID"),
);
for (const [caseId, changes] of partialGenesisGuardCases) {
  semanticCases.push(rejectingSemanticCase(caseId, "seal_pointer_recovery", [
    genesisRecipe("prepared"), resealed(genesisPointerGuardValue, "guard_digest", changes),
  ], "GKX_WATCHER_CONTRACT_POINTER_INVALID"));
}
const journalGenesisGuard = resealed(journalPointerGuardValue, "guard_digest", {
  old_pointer_file: null, old_pointer_digest: null, old_pointer_raw_sha256: null, old_pointer_byte_size: null,
  old_final_device: null, old_final_inode: null,
});
semanticCases.push(rejectingSemanticCase(
  "pointer-journal-genesis-old-group-invalid", "seal_record", [journalGenesisGuard], "GKX_WATCHER_CONTRACT_POINTER_INVALID",
));

const decisionCase = (caseId, selected_action, reader_authority, reader_pointer_digest, evidence_disposition, accepted = false) => {
  const value = pointerDecisionValue(selected_action, reader_authority, reader_pointer_digest, evidence_disposition);
  return accepted
    ? semanticCaseWithResult(caseId, "seal_record", [value], value)
    : rejectingSemanticCase(caseId, "seal_record", [value], "GKX_WATCHER_CONTRACT_POINTER_INVALID");
};
semanticCases.push(...[
  decisionCase("pointer-recovery-decision-fail-closed-digest-invalid", "retain_and_fail", "fail_closed", D("4"), "retain_and_fail"),
  decisionCase("pointer-recovery-decision-fixed-new-null-invalid", "serve_fixed_new", "fixed_new", null, "serve"),
  decisionCase("pointer-recovery-decision-fixed-old-null-invalid", "serve_guard_bound_old", "fixed_old", null, "serve"),
  decisionCase("pointer-recovery-decision-genesis-none-digest-invalid", "serve_guard_bound_old", "genesis_none", D("4"), "serve"),
  decisionCase("pointer-recovery-decision-genesis-none-valid", "serve_guard_bound_old", "genesis_none", null, "serve", true),
  decisionCase("pointer-recovery-decision-guard-old-null-invalid", "serve_guard_bound_old", "guard_bound_old", null, "serve"),
  decisionCase("pointer-recovery-decision-guard-old-valid", "serve_guard_bound_old", "guard_bound_old", D("4"), "serve", true),
  decisionCase("pointer-recovery-decision-continue-disposition-serve-invalid", "create_temp", "guard_bound_old", D("4"), "serve"),
  decisionCase("pointer-recovery-decision-fail-closed-nonretain-action-invalid", "create_temp", "fail_closed", null, "continue"),
  decisionCase("pointer-recovery-decision-retain-authority-fixed-old-invalid", "retain_and_fail", "fixed_old", D("4"), "retain_and_fail"),
  decisionCase("pointer-recovery-decision-retain-disposition-continue-invalid", "retain_and_fail", "fail_closed", null, "continue"),
  decisionCase("pointer-recovery-decision-serve-disposition-continue-invalid", "serve_fixed_new", "fixed_new", D("4"), "continue"),
  decisionCase("pointer-recovery-decision-serve-fixed-new-authority-fixed-old-invalid", "serve_fixed_new", "fixed_old", D("4"), "serve"),
  decisionCase("pointer-recovery-decision-serve-fixed-new-authority-genesis-invalid", "serve_fixed_new", "genesis_none", null, "serve"),
  decisionCase("pointer-recovery-decision-serve-guard-old-authority-fail-closed-invalid", "serve_guard_bound_old", "fail_closed", null, "serve"),
  decisionCase("pointer-recovery-decision-serve-guard-old-authority-fixed-new-invalid", "serve_guard_bound_old", "fixed_new", D("4"), "serve"),
].sort((left, right) => compare(left.case_id, right.case_id)));
const eventCaseIds = [
  "single-add", "single-content-change", "single-metadata-change", "single-delete", "verified-one-to-one-rename", "ambiguous-rename-delete-add",
  "obsidian-atomic-save-replace", "burst-coalesced-last-snapshot", "git-pull-mass-change", "case-only-rename-supported",
  "case-only-rename-unsupported-reconcile", "delete-recreate-same-path", "duplicate-events-idempotent", "out-of-order-events-reconcile",
  "empty-filename-unscoped-reconcile", "ignored-state-archive-feedback", "queue-overflow-full-reconcile",
  "validation-rejection-removes-projection-not-ledger", "validation-reacceptance", "folder-add-delete-rename", "attachment-add-delete-rename",
  "ordinary-archive-retained", "navigation-run-archive-ignored", "stable-attachment-content-change-no-semantic-batch",
].sort(compare);
const replacementSourceId = "123e4567-e89b-42d3-a456-426614174000";
const eventCaseInputs = new Map([
  ["single-add", { target_topology: eventTopology({ accepted_sources: [eventAccepted("policy/agent-writing.md")] }), mutations: [addMutation("policy/agent-writing.md")] }],
  ["single-content-change", { target_topology: eventTopology({ accepted_sources: [eventAccepted("policy/agent-writing.md")] }), mutations: [changeMutation("policy/agent-writing.md")] }],
  ["single-metadata-change", { target_topology: eventTopology({ accepted_sources: [eventAccepted("policy/agent-writing.md", D("1"))] }), mutations: [changeMutation("policy/agent-writing.md", D("1"), "metadata_change")] }],
  ["single-delete", { target_topology: topology, mutations: [deleteMutation("policy/agent-writing.md")] }],
  ["verified-one-to-one-rename", { observed_paths: ["policy/agent-writing-renamed.md", "policy/agent-writing.md"], target_topology: eventTopology({ accepted_sources: [eventAccepted("policy/agent-writing-renamed.md", D("1"))] }), mutations: [renameMutation("policy/agent-writing.md", "policy/agent-writing-renamed.md")] }],
  ["ambiguous-rename-delete-add", { observed_paths: ["policy/agent-writing-new.md", "policy/agent-writing.md"], unscoped: true, target_topology: eventTopology({ accepted_sources: [eventAccepted("policy/agent-writing-new.md", D("6"), replacementSourceId)] }), mutations: [deleteMutation("policy/agent-writing.md"), addMutation("policy/agent-writing-new.md", replacementSourceId)] }],
  ["obsidian-atomic-save-replace", { observed_paths: ["policy/agent-writing.md"], unscoped: true, target_topology: eventTopology({ accepted_sources: [eventAccepted("policy/agent-writing.md")] }), mutations: [changeMutation("policy/agent-writing.md")] }],
  ["burst-coalesced-last-snapshot", { target_topology: eventTopology({ accepted_sources: [eventAccepted("policy/agent-writing.md", D("7"))] }), mutations: [changeMutation("policy/agent-writing.md", D("7"))] }],
  ["git-pull-mass-change", { observed_paths: ["policy/agent-writing.md", "policy/other.md"], unscoped: true, target_topology: eventTopology({ accepted_sources: [eventAccepted("policy/agent-writing.md", D("8"))] }), mutations: [changeMutation("policy/agent-writing.md", D("8"))] }],
  ["case-only-rename-supported", { observed_paths: ["Policy/agent-writing.md", "policy/agent-writing.md"], target_topology: eventTopology({ accepted_sources: [eventAccepted("Policy/agent-writing.md", D("1"))], folder_paths: ["Policy"] }), mutations: [renameMutation("policy/agent-writing.md", "Policy/agent-writing.md")] }],
  ["case-only-rename-unsupported-reconcile", { observed_paths: ["Policy/agent-writing.md", "policy/agent-writing.md"], unscoped: true, target_topology: eventTopology({ accepted_sources: [eventAccepted("Policy/agent-writing.md", D("6"), replacementSourceId)], folder_paths: ["Policy"] }), mutations: [deleteMutation("policy/agent-writing.md"), addMutation("Policy/agent-writing.md", replacementSourceId)] }],
  ["delete-recreate-same-path", { unscoped: true, target_topology: eventTopology({ accepted_sources: [eventAccepted("policy/agent-writing.md", D("6"), replacementSourceId)] }), mutations: [deleteMutation("policy/agent-writing.md"), addMutation("policy/agent-writing.md", replacementSourceId)] }],
  ["duplicate-events-idempotent", { target_topology: eventTopology({ accepted_sources: [eventAccepted("policy/agent-writing.md", D("9"))] }), mutations: [changeMutation("policy/agent-writing.md", D("9"))] }],
  ["out-of-order-events-reconcile", { unscoped: true, target_topology: eventTopology({ accepted_sources: [eventAccepted("policy/agent-writing.md", D("a"))] }), mutations: [changeMutation("policy/agent-writing.md", D("a"))] }],
  ["empty-filename-unscoped-reconcile", { observed_paths: [], unscoped: true, target_topology: eventTopology({ accepted_sources: [eventAccepted("policy/agent-writing.md", D("b"))] }), mutations: [changeMutation("policy/agent-writing.md", D("b"))] }],
  ["ignored-state-archive-feedback", { observed_paths: [".gkx/watcher-active.json"], target_topology: priorTopology, mutations: [] }],
  ["queue-overflow-full-reconcile", { observed_paths: [], unscoped: true, overflow: true, target_topology: eventTopology({ accepted_sources: [eventAccepted("policy/agent-writing.md", D("c"))] }), mutations: [changeMutation("policy/agent-writing.md", D("c"))] }],
  ["validation-rejection-removes-projection-not-ledger", { target_topology: eventTopology({ rejected_sources: [eventRejected("policy/agent-writing.md", D("1"))] }), mutations: [deleteMutation("policy/agent-writing.md", sourceId, D("1"), "validation_rejection")] }],
  ["validation-reacceptance", { target_topology: eventTopology({ accepted_sources: [eventAccepted("policy/agent-writing.md", D("6"))] }), mutations: [addMutation("policy/agent-writing.md", sourceId, D("6"), "validation_reacceptance")] }],
  ["folder-add-delete-rename", { observed_paths: ["archive", "policy", "policy-renamed"], target_topology: eventTopology({ accepted_sources: [accepted], folder_paths: ["archive", "policy-renamed"] }), mutations: [], folder_set_changed: true }],
  ["attachment-add-delete-rename", { observed_paths: ["assets/new.png", "assets/reference-renamed.png", "assets/reference.png"], target_topology: eventTopology({ accepted_sources: [accepted], attachment_paths: ["assets/new.png", "assets/reference-renamed.png"] }), mutations: [], attachment_set_changed: true }],
  ["ordinary-archive-retained", { observed_paths: ["archive/note.md"], target_topology: eventTopology({ accepted_sources: [eventAccepted("archive/note.md", D("6"))], folder_paths: ["archive", "policy"] }), mutations: [changeMutation("archive/note.md", D("6"))] }],
  ["navigation-run-archive-ignored", { observed_paths: ["_archive/moc-runs/run.md"], target_topology: priorTopology, mutations: [] }],
  ["stable-attachment-content-change-no-semantic-batch", { observed_paths: ["assets/reference.png"], target_topology: priorTopology, mutations: [] }],
]);
for (const caseId of eventCaseIds) {
  const eventCase = buildEventActivation(eventCaseInputs.get(caseId));
  semanticCases.push(["ignored-state-archive-feedback", "navigation-run-archive-ignored", "stable-attachment-content-change-no-semantic-batch"].includes(caseId)
    ? rejectingSemanticCase(caseId, "seal_coherent_activation_bundle", [eventCase.bundle, eventCase.guard], "GKX_WATCHER_CONTRACT_RELATION_INVALID")
    : semanticCaseWithResult(caseId, "seal_coherent_activation_bundle", [eventCase.bundle, eventCase.guard], eventCase.bundle));
}

for (const [caseId, input] of [
  ["topology-folder-add-operation", { observed_paths: ["archive"], target_topology: eventTopology({ accepted_sources: [accepted], folder_paths: ["archive", "policy"] }), mutations: [], folder_set_changed: true }],
  ["topology-folder-delete-operation", { observed_paths: ["policy"], target_topology: eventTopology({ accepted_sources: [accepted], folder_paths: [] }), mutations: [], folder_set_changed: true }],
  ["topology-folder-rename-operation", { observed_paths: ["policy", "policy-renamed"], target_topology: eventTopology({ accepted_sources: [accepted], folder_paths: ["policy-renamed"] }), mutations: [], folder_set_changed: true }],
  ["topology-attachment-add-operation", { observed_paths: ["assets/new.png"], target_topology: eventTopology({ accepted_sources: [accepted], attachment_paths: ["assets/new.png", "assets/reference.png"] }), mutations: [], attachment_set_changed: true }],
  ["topology-attachment-delete-operation", { observed_paths: ["assets/reference.png"], target_topology: eventTopology({ accepted_sources: [accepted], attachment_paths: [] }), mutations: [], attachment_set_changed: true }],
  ["topology-attachment-rename-operation", { observed_paths: ["assets/reference-renamed.png", "assets/reference.png"], target_topology: eventTopology({ accepted_sources: [accepted], attachment_paths: ["assets/reference-renamed.png"] }), mutations: [], attachment_set_changed: true }],
]) {
  const eventCase = buildEventActivation(input);
  semanticCases.push(semanticCaseWithResult(caseId, "seal_coherent_activation_bundle", [eventCase.bundle, eventCase.guard], eventCase.bundle));
}

const parserVectorTopology = eventTopology({
  accepted_sources: [{
    ...eventAccepted("policy/agent-writing.md"),
    parser_descriptor_digest: digest({
      contract_version: "gkos-watcher-parser-descriptor/1.0.0-draft.1",
      canonical_candidate_source_descriptors: ["forbidden-vector-authority"],
    }),
  }],
});
const parserVectorCase = buildEventActivation({
  target_topology: parserVectorTopology,
  mutations: [changeMutation("policy/agent-writing.md")],
});
semanticCases.push(rejectingSemanticCase(
  "topology-parser-vector-digest-substitution",
  "seal_coherent_activation_bundle",
  [parserVectorCase.bundle, parserVectorCase.guard],
  "GKX_WATCHER_CONTRACT_RELATION_INVALID",
));

const graphSecurityCase = buildEventActivation(eventCaseInputs.get("single-add"));
const reversedCanonicalNodes = clone(graphSecurityCase.bundle.canonical_graph);
reversedCanonicalNodes.normalized_graph.nodes.reverse();
const wrongVaultGraphiti = deriveGeneratorGraphiti(graphSecurityCase.bundle.raw_graph.graph, "phase5-watcher-convergence-other");
const noncanonicalEpisodeGraphiti = clone(graphSecurityCase.bundle.graphiti_projection);
if (noncanonicalEpisodeGraphiti.episodes.length > 0) {
  noncanonicalEpisodeGraphiti.episodes[0].episode_body = `${noncanonicalEpisodeGraphiti.episodes[0].episode_body} `;
}
const twoEpisodeCase = buildEventActivation({
  observed_paths: ["policy/agent-writing.md", "policy/other.md"],
  target_topology: eventTopology({ accepted_sources: [
    eventAccepted("policy/agent-writing.md"), eventAccepted("policy/other.md", D("3"), secondAccepted.source_id, 1),
  ] }),
  mutations: [changeMutation("policy/agent-writing.md"), addMutation("policy/other.md", secondAccepted.source_id, D("3"))],
});
const reversedEpisodeGraphiti = clone(twoEpisodeCase.bundle.graphiti_projection);
reversedEpisodeGraphiti.episodes.reverse();
semanticCases.push(
  rejectingSemanticCase("canonical-graph-semantic-array-reorder", "seal_coherent_activation_bundle", [{ ...graphSecurityCase.bundle, canonical_graph: reversedCanonicalNodes }, graphSecurityCase.guard], "GKX_WATCHER_CONTRACT_GRAPH_INVALID"),
  rejectingSemanticCase("graphiti-vault-substitution", "seal_coherent_activation_bundle", [{ ...graphSecurityCase.bundle, graphiti_projection: wrongVaultGraphiti }, graphSecurityCase.guard], "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  rejectingSemanticCase("graphiti-body-noncanonical", "seal_coherent_activation_bundle", [{ ...graphSecurityCase.bundle, graphiti_projection: noncanonicalEpisodeGraphiti }, graphSecurityCase.guard], "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  rejectingSemanticCase("graphiti-processing-time-substitution", "seal_coherent_activation_bundle", [{
    ...graphSecurityCase.bundle,
    graphiti_projection: { ...graphSecurityCase.bundle.graphiti_projection, processing_time: "2026-08-20T00:00:00.000Z" },
  }, graphSecurityCase.guard], "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  rejectingSemanticCase("graphiti-episode-order-substitution", "seal_coherent_activation_bundle", [{
    ...twoEpisodeCase.bundle, graphiti_projection: reversedEpisodeGraphiti,
  }, twoEpisodeCase.guard], "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  rejectingSemanticCase("graph-delta-invented-field", "seal_coherent_activation_bundle", [{
    ...graphSecurityCase.bundle,
    normalized_graph_delta: {
      ...graphSecurityCase.bundle.normalized_graph_delta,
      delta: { ...graphSecurityCase.bundle.normalized_graph_delta.delta, added_links: [] },
    },
  }, graphSecurityCase.guard], "GKX_WATCHER_CONTRACT_KEYS_INVALID"),
  rejectingSemanticCase("topology-graph-sink-receipt-forbidden", "seal_record", [resealed(
    graphSecurityCase.bundle.transitions[4], "transition_digest", {
      graph_projection_state: { ...graphSecurityCase.bundle.transitions[4].graph_projection_state, sink_receipts: [D("f")] },
    },
  )], "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
  rejectingSemanticCase("execution-kind-scoped-set-files-forbidden", "seal_coherent_activation_bundle", [{
    ...graphSecurityCase.bundle,
    batch: resealed(graphSecurityCase.bundle.batch, "batch_record_digest", { execution_kind: "set_files" }),
  }, graphSecurityCase.guard], "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
);
const unscopedExecutionCase = buildEventActivation(eventCaseInputs.get("out-of-order-events-reconcile"));
semanticCases.push(rejectingSemanticCase("execution-kind-unscoped-apply-changes-forbidden", "seal_coherent_activation_bundle", [{
  ...unscopedExecutionCase.bundle,
  batch: resealed(unscopedExecutionCase.bundle.batch, "batch_record_digest", { execution_kind: "apply_changes" }),
}, unscopedExecutionCase.guard], "GKX_WATCHER_CONTRACT_RELATION_INVALID"));

const twoRemovalCase = buildEventActivation({
  observed_paths: ["policy/agent-writing.md", "policy/other.md"], unscoped: true, target_topology: topology,
  mutations: [deleteMutation("policy/agent-writing.md"), deleteMutation("policy/other.md", replacementSourceId, D("3"))],
});
semanticCases.push(
  semanticCaseWithResult("source-removal-two-member-ordered", "seal_coherent_activation_bundle", [twoRemovalCase.bundle, twoRemovalCase.guard], twoRemovalCase.bundle),
  rejectingSemanticCase("source-removal-membership-order-splice", "seal_coherent_activation_bundle", [{
    ...twoRemovalCase.bundle,
    source_removal_event_set_bundle: {
      ...twoRemovalCase.bundle.source_removal_event_set_bundle,
      memberships: [...twoRemovalCase.bundle.source_removal_event_set_bundle.memberships].reverse(),
    },
  }, twoRemovalCase.guard], "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  rejectingSemanticCase("source-removal-occurrence-forged-duplicate", "seal_coherent_activation_bundle", [{
    ...twoRemovalCase.bundle,
    source_removal_event_set_bundle: {
      ...twoRemovalCase.bundle.source_removal_event_set_bundle,
      occurrences: [twoRemovalCase.bundle.source_removal_event_set_bundle.occurrences[0], twoRemovalCase.bundle.source_removal_event_set_bundle.occurrences[0]],
    },
  }, twoRemovalCase.guard], "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
  rejectingSemanticCase("source-removal-event-body-swap", "seal_coherent_activation_bundle", [{
    ...twoRemovalCase.bundle,
    source_removal_event_set_bundle: {
      ...twoRemovalCase.bundle.source_removal_event_set_bundle,
      events: [...twoRemovalCase.bundle.source_removal_event_set_bundle.events].reverse(),
    },
  }, twoRemovalCase.guard], "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"),
);

semanticCases.push(semanticCase("failure-retry-configuration-splice", "seal_failure_retry", {
  ...failureRetryValue,
  retry_pre_scan_state: { ...preScan, configuration_digest: D("f") },
}, "GKX_WATCHER_CONTRACT_RETRY_INVALID"));

const noopFailedStartedAtSplice = {
  ...noopFailureRetryValue,
  failed_batch: resealed(noopFailedBatchValue, "batch_record_digest", { started_at: "2026-08-20T00:00:03.999Z" }),
};
const noopRetryStartedAtSplice = {
  ...noopFailureRetryValue,
  retry_batch: resealed(noopRetryBatchValue, "batch_record_digest", { started_at: "2026-08-20T00:00:04.999Z" }),
};
const noopFailedExecutionSplice = {
  ...noopFailureRetryValue,
  failed_batch: resealed(noopFailedBatchValue, "batch_record_digest", { execution_kind: "set_files" }),
};
semanticCases.push(
  semanticCaseWithResult("failure-retry-noop-complete", "seal_failure_retry_noop_bundle", [failureRetryNoopBundleValue], failureRetryNoopBundleValue),
  rejectingSemanticCase("failure-retry-noop-envelope-extra-key", "seal_failure_retry_noop_bundle", [{
    ...failureRetryNoopBundleValue, unratified: null,
  }], "GKX_WATCHER_CONTRACT_KEYS_INVALID"),
  rejectingSemanticCase("failure-retry-noop-failed-batch-started-at-splice", "seal_failure_retry_noop_bundle", [{
    ...failureRetryNoopBundleValue, failure_retry_bundle: noopFailedStartedAtSplice,
  }], "GKX_WATCHER_CONTRACT_RETRY_INVALID"),
  rejectingSemanticCase("failure-retry-noop-retry-batch-started-at-splice", "seal_failure_retry_noop_bundle", [{
    ...failureRetryNoopBundleValue, failure_retry_bundle: noopRetryStartedAtSplice,
  }], "GKX_WATCHER_CONTRACT_RETRY_INVALID"),
  rejectingSemanticCase("failure-retry-noop-failed-batch-execution-splice", "seal_failure_retry_noop_bundle", [{
    ...failureRetryNoopBundleValue, failure_retry_bundle: noopFailedExecutionSplice,
  }], "GKX_WATCHER_CONTRACT_RETRY_INVALID"),
  rejectingSemanticCase("failure-retry-noop-plan-mutation-splice", "seal_failure_retry_noop_bundle", [{
    ...failureRetryNoopBundleValue,
    retry_plan: resealed(noopRetryPlanValue, "plan_digest", { folder_set_changed: true }),
  }], "GKX_WATCHER_CONTRACT_RETRY_INVALID"),
  rejectingSemanticCase("failure-retry-noop-receipt-bundle-digest-splice", "seal_failure_retry_noop_bundle", [{
    ...failureRetryNoopBundleValue,
    receipt: resealed(noopReceiptValue, "receipt_digest", { failure_retry_bundle_digest: D("f") }),
  }], "GKX_WATCHER_CONTRACT_RETRY_INVALID"),
  rejectingSemanticCase("failure-retry-noop-current-topology-splice", "seal_failure_retry_noop_bundle", [{
    ...failureRetryNoopBundleValue, current_topology: topology,
  }], "GKX_WATCHER_CONTRACT_RETRY_INVALID"),
);

const storageTables = ["watcher_meta", "batches", "observations", "normalized_plans", "transitions", "activation_intents", "activation_outcomes", "active_coherent", "source_removal_occurrences", "source_removal_events", "source_removal_event_sets", "source_removal_event_set_members", "activated_source_removal_event_sets", "source_removal_adapter_responses", "source_removal_receipts", "journal_resets"];
const storageDdl = [
  "CREATE TABLE watcher_meta (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), journal_instance_id TEXT NOT NULL UNIQUE, meta_digest TEXT NOT NULL UNIQUE, body BLOB NOT NULL CHECK (length(body) BETWEEN 1 AND 33554432)) STRICT;",
  "CREATE TABLE batches (batch_id TEXT PRIMARY KEY, started_at TEXT NOT NULL, target_topology_snapshot_digest TEXT NULL, terminal_state TEXT NULL, terminal_transition_digest TEXT NULL, body BLOB NOT NULL CHECK (length(body) BETWEEN 1 AND 33554432)) STRICT;",
  "CREATE TABLE observations (batch_id TEXT PRIMARY KEY, observation_digest TEXT NOT NULL UNIQUE, authority_digest TEXT NOT NULL UNIQUE, artifact_file TEXT NOT NULL, raw_sha256 TEXT NOT NULL, byte_size INTEGER NOT NULL, body BLOB NOT NULL CHECK (length(body) BETWEEN 1 AND 33554432), FOREIGN KEY (batch_id) REFERENCES batches(batch_id)) STRICT;",
  "CREATE TABLE normalized_plans (batch_id TEXT PRIMARY KEY, plan_digest TEXT NOT NULL UNIQUE, authority_digest TEXT NOT NULL UNIQUE, artifact_file TEXT NOT NULL, raw_sha256 TEXT NOT NULL, byte_size INTEGER NOT NULL, target_topology_snapshot_digest TEXT NOT NULL, source_removal_event_set_digest TEXT NULL, body BLOB NOT NULL CHECK (length(body) BETWEEN 1 AND 33554432), FOREIGN KEY (batch_id) REFERENCES batches(batch_id)) STRICT;",
  "CREATE TABLE transitions (batch_id TEXT NOT NULL, transition_ordinal INTEGER NOT NULL, state TEXT NOT NULL, prior_transition_digest TEXT NULL, transition_digest TEXT NOT NULL UNIQUE, body BLOB NOT NULL CHECK (length(body) BETWEEN 1 AND 33554432), PRIMARY KEY (batch_id, transition_ordinal), FOREIGN KEY (batch_id) REFERENCES batches(batch_id)) STRICT;",
  "CREATE TABLE activation_intents (intent_digest TEXT PRIMARY KEY, coherent_manifest_digest TEXT NOT NULL UNIQUE, target_complete_transition_digest TEXT NOT NULL UNIQUE, body BLOB NOT NULL CHECK (length(body) BETWEEN 1 AND 33554432)) STRICT;",
  "CREATE TABLE activation_outcomes (outcome_digest TEXT PRIMARY KEY, intent_digest TEXT NOT NULL UNIQUE, coherent_manifest_digest TEXT NOT NULL UNIQUE, outcome TEXT NOT NULL, body BLOB NOT NULL CHECK (length(body) BETWEEN 1 AND 33554432), FOREIGN KEY (intent_digest) REFERENCES activation_intents(intent_digest)) STRICT;",
  "CREATE TABLE active_coherent (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), active_digest TEXT NOT NULL UNIQUE, coherent_manifest_digest TEXT NOT NULL UNIQUE, pointer_digest TEXT NOT NULL UNIQUE, body BLOB NOT NULL CHECK (length(body) BETWEEN 1 AND 33554432)) STRICT;",
  "CREATE TABLE source_removal_occurrences (occurrence_digest TEXT PRIMARY KEY, source_id TEXT NOT NULL, source_path TEXT NOT NULL, source_digest TEXT NOT NULL, prior_coherent_manifest_digest TEXT NOT NULL, prior_topology_snapshot_digest TEXT NOT NULL, body BLOB NOT NULL CHECK (length(body) BETWEEN 1 AND 33554432)) STRICT;",
  "CREATE TABLE source_removal_events (event_digest TEXT PRIMARY KEY, occurrence_digest TEXT NOT NULL UNIQUE, adapter_binding_digest TEXT NULL, delivery_mode TEXT NOT NULL, body BLOB NOT NULL CHECK (length(body) BETWEEN 1 AND 33554432), FOREIGN KEY (occurrence_digest) REFERENCES source_removal_occurrences(occurrence_digest)) STRICT;",
  "CREATE TABLE source_removal_event_sets (event_set_digest TEXT PRIMARY KEY, set_kind TEXT NOT NULL, origin_id TEXT NOT NULL, target_topology_snapshot_digest TEXT NULL, event_count INTEGER NOT NULL, membership_digest_sequence_digest TEXT NOT NULL, body BLOB NOT NULL CHECK (length(body) BETWEEN 1 AND 33554432)) STRICT;",
  "CREATE TABLE source_removal_event_set_members (event_set_digest TEXT NOT NULL, event_ordinal INTEGER NOT NULL, membership_digest TEXT NOT NULL UNIQUE, event_digest TEXT NOT NULL, original_membership_digest TEXT NULL, body BLOB NOT NULL CHECK (length(body) BETWEEN 1 AND 33554432), PRIMARY KEY (event_set_digest, event_ordinal), UNIQUE (event_set_digest, event_digest), FOREIGN KEY (event_set_digest) REFERENCES source_removal_event_sets(event_set_digest), FOREIGN KEY (event_digest) REFERENCES source_removal_events(event_digest)) STRICT;",
  "CREATE TABLE activated_source_removal_event_sets (event_set_digest TEXT PRIMARY KEY, coherent_manifest_digest TEXT NOT NULL, activated_at TEXT NOT NULL, activation_digest TEXT NOT NULL UNIQUE, body BLOB NOT NULL CHECK (length(body) BETWEEN 1 AND 33554432), FOREIGN KEY (event_set_digest) REFERENCES source_removal_event_sets(event_set_digest)) STRICT;",
  "CREATE TABLE source_removal_adapter_responses (response_digest TEXT PRIMARY KEY, binding_digest TEXT NOT NULL, occurrence_digest TEXT NOT NULL UNIQUE, status TEXT NOT NULL, adapter_event_id TEXT NOT NULL, adapter_result_digest TEXT NOT NULL, body BLOB NOT NULL CHECK (length(body) BETWEEN 1 AND 33554432), FOREIGN KEY (occurrence_digest) REFERENCES source_removal_occurrences(occurrence_digest)) STRICT;",
  "CREATE TABLE source_removal_receipts (receipt_digest TEXT PRIMARY KEY, event_digest TEXT NOT NULL UNIQUE, occurrence_digest TEXT NOT NULL UNIQUE, adapter_binding_digest TEXT NOT NULL, adapter_response_digest TEXT NOT NULL UNIQUE, adapter_result_digest TEXT NOT NULL, adapter_event_id TEXT NOT NULL, status TEXT NOT NULL, body BLOB NOT NULL CHECK (length(body) BETWEEN 1 AND 33554432), FOREIGN KEY (event_digest) REFERENCES source_removal_events(event_digest), FOREIGN KEY (adapter_response_digest) REFERENCES source_removal_adapter_responses(response_digest)) STRICT;",
  "CREATE TABLE journal_resets (reset_digest TEXT PRIMARY KEY, prior_journal_generation_digest TEXT NOT NULL UNIQUE, new_journal_generation_digest TEXT NOT NULL UNIQUE, body BLOB NOT NULL CHECK (length(body) BETWEEN 1 AND 33554432)) STRICT;",
  "CREATE INDEX transitions_state_idx ON transitions (state, batch_id, transition_ordinal);",
  "CREATE INDEX batches_terminal_idx ON batches (terminal_state, batch_id);",
  "CREATE INDEX source_removal_ready_idx ON source_removal_events (delivery_mode, adapter_binding_digest, event_digest);",
];
const storageLimits = {
  aggregate_bytes_max: 4294967296, database_projected_bytes_max: 2048000000, blob_bytes_per_transaction_max: 33554432,
  mutated_rows_per_transaction_max: 10000, page_size_bytes: 4096, wal_frame_bytes: 4120, wal_header_bytes: 32,
  shm_reservation_bytes: 67108864, observation_artifact_bytes_max: 4194304, plan_artifact_bytes_max: 536870912,
  topology_artifact_bytes_max: 536870912, raw_graph_artifact_bytes_max: 536870912, source_rows_max: 1000000,
  dirty_page_upper_formula: "ceil(blob_bytes/4096)+4*mutated_rows+4096",
  projected_database_bytes_formula: "current_database_bytes+dirty_page_upper*4096",
  wal_upper_formula: "32+dirty_page_upper*4120",
  admission_formula: "projected_database_bytes<=2048000000&&projected_database_bytes+wal_upper+67108864<=4294967296",
  post_reopen_formula: "current_database_bytes+wal_bytes+shm_bytes<=4294967296",
};
const storageExpectation = (expected_valid, expected_reason = null) => ({ expected_valid, expected_reason });
const admissionBoundaryCases = [
  { case_id: "post-reopen-aggregate-exact", recipe: { recipe_kind: "post_reopen", current_database_bytes: 2048000000, blob_bytes: 0, mutated_rows: 0, wal_bytes: 2179858432, shm_bytes: 67108864 }, expectation: storageExpectation(true) },
  { case_id: "post-reopen-aggregate-plus-one", recipe: { recipe_kind: "post_reopen", current_database_bytes: 2048000000, blob_bytes: 0, mutated_rows: 0, wal_bytes: 2179858433, shm_bytes: 67108864 }, expectation: storageExpectation(false, "WATCHER_JOURNAL_CAP_EXCEEDED") },
  { case_id: "pre-transaction-blob-exact", recipe: { recipe_kind: "pre_transaction", current_database_bytes: 0, blob_bytes: 33554432, mutated_rows: 0, wal_bytes: 0, shm_bytes: 0 }, expectation: storageExpectation(true) },
  { case_id: "pre-transaction-blob-plus-one", recipe: { recipe_kind: "pre_transaction", current_database_bytes: 0, blob_bytes: 33554433, mutated_rows: 0, wal_bytes: 0, shm_bytes: 0 }, expectation: storageExpectation(false, "WATCHER_JOURNAL_CAP_EXCEEDED") },
  { case_id: "pre-transaction-projected-database-exact", recipe: { recipe_kind: "pre_transaction", current_database_bytes: 2031222784, blob_bytes: 0, mutated_rows: 0, wal_bytes: 0, shm_bytes: 0 }, expectation: storageExpectation(true) },
  { case_id: "pre-transaction-projected-database-plus-one", recipe: { recipe_kind: "pre_transaction", current_database_bytes: 2031222785, blob_bytes: 0, mutated_rows: 0, wal_bytes: 0, shm_bytes: 0 }, expectation: storageExpectation(false, "WATCHER_JOURNAL_CAP_EXCEEDED") },
  { case_id: "pre-transaction-rows-exact", recipe: { recipe_kind: "pre_transaction", current_database_bytes: 0, blob_bytes: 0, mutated_rows: 10000, wal_bytes: 0, shm_bytes: 0 }, expectation: storageExpectation(true) },
  { case_id: "pre-transaction-rows-plus-one", recipe: { recipe_kind: "pre_transaction", current_database_bytes: 0, blob_bytes: 0, mutated_rows: 10001, wal_bytes: 0, shm_bytes: 0 }, expectation: storageExpectation(false, "WATCHER_JOURNAL_CAP_EXCEEDED") },
];
const sqliteAuthorityCases = [
  { case_id: "canonical-authority", recipe: { recipe_kind: "pre_transaction", current_database_bytes: 0, blob_bytes: 0, mutated_rows: 0, wal_bytes: 0, shm_bytes: 0 }, expectation: storageExpectation(true) },
  ...[
    ["body-scalar-digest", "body_scalar", "body_digest_mismatch", "WATCHER_JOURNAL_VALUE_INVALID"],
    ["body-scalar-noncanonical", "body_scalar", "noncanonical_body", "WATCHER_JOURNAL_VALUE_INVALID"],
    ["column-affinity", "column", "affinity_drift", "WATCHER_JOURNAL_SCHEMA_INVALID"],
    ["column-notnull", "column", "notnull_drift", "WATCHER_JOURNAL_SCHEMA_INVALID"],
    ["column-order", "column", "column_order_drift", "WATCHER_JOURNAL_SCHEMA_INVALID"],
    ["column-primary-key", "column", "primary_key_drift", "WATCHER_JOURNAL_SCHEMA_INVALID"],
    ["foreign-key-drift", "foreign_key", "foreign_key_drift", "WATCHER_JOURNAL_SCHEMA_INVALID"],
    ["identity-alias", "identity", "alias_swap", "WATCHER_JOURNAL_IDENTITY_INVALID"],
    ["identity-hardlink", "identity", "hardlink", "WATCHER_JOURNAL_IDENTITY_INVALID"],
    ["identity-mode-widened", "identity", "mode_widened", "WATCHER_JOURNAL_IDENTITY_INVALID"],
    ["identity-parent-swap", "identity", "parent_swap", "WATCHER_JOURNAL_IDENTITY_INVALID"],
    ["identity-reparse", "identity", "reparse", "WATCHER_JOURNAL_IDENTITY_INVALID"],
    ["identity-sqlite-replacement", "identity", "sqlite_replacement", "WATCHER_JOURNAL_IDENTITY_INVALID"],
    ["index-missing", "index", "missing_object", "WATCHER_JOURNAL_SCHEMA_INVALID"],
    ["integrity-corrupt", "integrity", "corrupt_database", "WATCHER_JOURNAL_INTEGRITY_INVALID"],
    ["integrity-failure", "integrity", "integrity_failure", "WATCHER_JOURNAL_INTEGRITY_INVALID"],
    ["outbox-unreadable", "outbox", "body_digest_mismatch", "GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE"],
    ["pragma-drift", "pragma", "pragma_drift", "WATCHER_JOURNAL_SCHEMA_INVALID"],
    ["reset-unknown-leaf", "reset", "unknown_reserved_leaf", "WATCHER_POINTER_RECOVERY_REQUIRED"],
    ["sqlite-master-extra", "sqlite_master", "extra_object", "WATCHER_JOURNAL_SCHEMA_INVALID"],
    ["sqlite-master-trigger", "sqlite_master", "trigger_added", "WATCHER_JOURNAL_SCHEMA_INVALID"],
    ["sqlite-master-view", "sqlite_master", "view_added", "WATCHER_JOURNAL_SCHEMA_INVALID"],
    ["sqlite-master-virtual-table", "sqlite_master", "virtual_table_added", "WATCHER_JOURNAL_SCHEMA_INVALID"],
  ].map(([case_id, recipe_kind, mutation, reason]) => ({ case_id, recipe: { recipe_kind, target: "canonical_authority", mutation }, expectation: storageExpectation(false, reason) })),
];
const journalResetRecovery = {
  plan: {
    contract_version: "gkos-watcher-journal-reset-recovery-plan/1.0.0-draft.1",
    field_count: 17, fixed_file: "watcher-journal-reset-recovery-plan.json",
    stage_file: ".watcher-journal-reset-recovery-plan.json.gkos-watcher.stage",
    maximum_byte_size: 536870912, publication: "stage_hardlink_no_replace_final_unlink_stage",
  },
  bridge: {
    contract_version: "gkos-watcher-journal-reset-recovery-bridge/1.0.0-draft.1",
    field_count: 14, maximum_byte_size: 1073741824, executor_attempt_limit: 4096,
    kinds: ["journal_reset_live_cleanup", "journal_reset_recovery"],
    publication: "content_addressed_stage_hardlink_no_replace_final_unlink_stage_permanent",
  },
  executor: {
    contract_version: "gkos-watcher-journal-reset-recovery-executor/1.0.0-draft.1",
    field_count: 10, stage_file: ".watcher-journal-reset-recovery-executor.json.gkos-watcher.stage",
    selected_file: "watcher-journal-reset-recovery-executor.json", maximum_ordinal: 4095,
    handoff: "linear_stage_to_immutable_to_selected_no_authority_gap",
  },
  authority_predicates: ["dead_owner_recovered", "live_original", "stable_cleanup"],
  guard_publication_protocol: "plan_before_exact_reserved_reset_s_to_g_then_nested_pointer_f4",
  old_sqlite_files: "immutable_never_moved_deleted_or_recursively_cleaned",
  sqlite_states: [
    { state: "C0", authority: "child_absent", action: "create_secure_child" },
    { state: "C1", authority: "exact_empty_child", action: "create_database_wx" },
    { state: "C2a", authority: "database_0_through_99_bytes_no_sidecars", action: "secure_remove_child_and_restart" },
    { state: "C2b", authority: "database_100_through_4095_exact_sqlite_header_prefix_eof_only", action: "secure_remove_child_and_restart" },
    { state: "C3", authority: "parseable_zero_application_object_database", action: "secure_remove_child_and_restart" },
    { state: "C4", authority: "ddl19_plus_exact_meta_all_other_tables_empty", action: "atomic_reset_and_optional_carry_seed" },
    { state: "C5", authority: "ddl19_meta_and_exact_reset_optional_carry", action: "continue_pointer_publication" },
  ],
  recoverable_states: [
    { ordinal: 1, reset_guard: "absent", journal_pointer: "old_exact", new_generation: "absent", pointer_guard: "absent", action: "publish_exact_embedded_reset_guard" },
    { ordinal: 2, reset_guard: "exact", journal_pointer: "old_exact", new_generation: "absent_or_finite_incomplete_or_exact", pointer_guard: "absent", action: "verify_every_present_item_then_resume_guarded_creation" },
    { ordinal: 3, reset_guard: "exact", journal_pointer: "old_exact", new_generation: "complete_exact", pointer_guard: "absent", action: "publish_exact_prepared_pointer_guard" },
    { ordinal: 4, reset_guard: "exact", journal_pointer: "old_exact", new_generation: "complete_exact", pointer_guard: "any_exact_recoverable_old_branch", action: "resume_nested_pointer_f4" },
    { ordinal: 5, reset_guard: "exact", journal_pointer: "new_exact", new_generation: "complete_exact", pointer_guard: "any_exact_recoverable_new_branch", action: "finalize_nested_pointer_guard" },
    { ordinal: 6, reset_guard: "exact", journal_pointer: "new_exact", new_generation: "complete_exact", pointer_guard: "absent", action: "remove_reset_guard" },
    { ordinal: 7, reset_guard: "absent", journal_pointer: "new_exact", new_generation: "complete_exact", pointer_guard: "absent", action: "selected_terminal_lock_handoff_and_cleanup" },
    { ordinal: 8, reset_guard: "absent", journal_pointer: "new_exact", new_generation: "complete_exact", pointer_guard: "absent", action: "terminal" },
  ],
  mismatch_action: "retain_everything_and_exit3",
  removal_order: ["nested_pointer_guard", "reset_guard", "terminal_host_lock_transition", "root_claim_if_any", "recovery_plan", "executor_selector", "current_host_lock"],
  anchored_new_database: "meta_present_no_active_coherent_no_batches_only_until_mandatory_startup_reconciliation",
};
const storageMaterial = {
  contract_version: "gkos-watcher-storage-fixture/1.0.0-draft.1",
  pragmas: ["PRAGMA page_size=4096", "PRAGMA auto_vacuum=NONE", "PRAGMA encoding='UTF-8'", "PRAGMA user_version=1", "PRAGMA foreign_keys=ON", "PRAGMA trusted_schema=OFF", "PRAGMA locking_mode=EXCLUSIVE", "PRAGMA synchronous=FULL", "PRAGMA journal_mode=WAL", "PRAGMA wal_autocheckpoint=0", "PRAGMA temp_store=MEMORY", "PRAGMA max_page_count=500000"],
  ddl: storageDdl, limits: storageLimits, admission_boundary_cases: admissionBoundaryCases,
  sqlite_authority_cases: sqliteAuthorityCases, journal_reset_recovery: journalResetRecovery,
};
const storageFixtureValue = sealed(storageMaterial, "fixture_digest");
queueJson("watcher-storage-fixture.json", storageFixtureValue);

const statusPreGenesisValue = sealed({
  contract_version: "gkos-watcher-status/1.0.0-draft.1", service_instance_id: processId, watcher_state: "starting", freshness: "stale",
  reason_codes: ["WATCHER_NO_COHERENT_GENERATION"], document_count: 0, chunk_count: 0, embedding_model: null, last_sync: null,
  uptime_ms: 1_234, pid: 4_242, source_snapshot_digest: null, coherent_manifest_digest: null, configuration_digest: null, policy_digest: null,
}, "status_digest");
const statusReconcilingValue = resealed(statusValue, "status_digest", {
  watcher_state: "reconciling", freshness: "stale", reason_codes: ["WATCHER_STARTUP_RECONCILIATION"],
});
const statusDegradedValue = resealed(statusValue, "status_digest", {
  watcher_state: "serving", freshness: "degraded", reason_codes: ["WATCHER_SOURCE_REJECTED"],
});
const renderStatusText = (status) => [
  "gkos status", `documents: ${status.document_count}`, `chunks: ${status.chunk_count}`,
  `embedding_model: ${status.embedding_model ?? "null"}`, `watcher_state: ${status.watcher_state}`, `freshness: ${status.freshness}`,
  `last_sync: ${status.last_sync ?? "null"}`, `uptime_ms: ${status.uptime_ms}`, `pid: ${status.pid}`,
  `reasons: ${stable(status.reason_codes)}`,
].join("\n") + "\n";
const renderResetText = (result) => [
  "gkos watcher journal-reset", `status: ${result.status}`, `prior_journal_generation_digest: ${result.prior_journal_generation_digest}`,
  `archive_manifest_digest: ${result.archive_manifest_digest}`, `new_journal_generation_digest: ${result.new_journal_generation_digest}`,
  `outer_coherent_manifest_digest: ${result.outer_coherent_manifest_digest}`, `reset_digest: ${result.reset_digest}`,
  `requires_reconciliation: ${result.requires_reconciliation}`, `result_digest: ${result.result_digest}`,
].join("\n") + "\n";
const stateFixtures = [
  { fixture_id: "reset-ready", capability_state: "valid", locator: null, status: null, active_coherent: activeValue, coherent_manifest: coherentManifestValue, journal_generation: journalGenerationValue, journal_pointer: journalPointerValue, reset_result: resetResultValue },
  { fixture_id: "state-invalid", capability_state: "invalid", locator: null, status: null, active_coherent: null, coherent_manifest: null, journal_generation: null, journal_pointer: null, reset_result: null },
  { fixture_id: "state-operational-failure", capability_state: "operational_failure", locator: null, status: null, active_coherent: null, coherent_manifest: null, journal_generation: null, journal_pointer: null, reset_result: null },
  { fixture_id: "status-pre-genesis", capability_state: "valid", locator: locatorValue, status: statusPreGenesisValue, active_coherent: null, coherent_manifest: null, journal_generation: journalGenerationValue, journal_pointer: journalPointerValue, reset_result: null },
  { fixture_id: "status-reconciling-stale", capability_state: "valid", locator: locatorValue, status: statusReconcilingValue, active_coherent: activeValue, coherent_manifest: coherentManifestValue, journal_generation: journalGenerationValue, journal_pointer: journalPointerValue, reset_result: null },
  { fixture_id: "status-serving-degraded", capability_state: "valid", locator: locatorValue, status: statusDegradedValue, active_coherent: activeValue, coherent_manifest: coherentManifestValue, journal_generation: journalGenerationValue, journal_pointer: journalPointerValue, reset_result: null },
  { fixture_id: "status-serving-fresh", capability_state: "valid", locator: locatorValue, status: statusValue, active_coherent: activeValue, coherent_manifest: coherentManifestValue, journal_generation: journalGenerationValue, journal_pointer: journalPointerValue, reset_result: null },
].sort((left, right) => compare(left.fixture_id, right.fixture_id));
const command = (case_id, argv_template, expected_stdout, expected_stderr, expected_exit_code, required_state_fixture) => ({ case_id, argv_template, expected_stdout, expected_stderr, expected_exit_code, required_state_fixture });
const resetArgv = ["watcher", "journal-reset", "--state", "<STATE_DIRECTORY>", "--expected-journal-generation-digest", journalGenerationValue.journal_generation_digest, "--expected-coherent-manifest-digest", coherentManifestValue.coherent_manifest_digest];
const cliCommands = [
  command("reset-extra-argument", [...resetArgv, "unexpected"], "", "gkos watcher journal-reset: invalid arguments\n", 2, null),
  command("reset-help", ["watcher", "journal-reset", "--help"], "Usage: gkos watcher journal-reset --state <state-directory> --expected-journal-generation-digest <sha256> --expected-coherent-manifest-digest <sha256> [--json]\n", "", 0, null),
  command("reset-invalid-state", resetArgv, "", "gkos watcher journal-reset: invalid state capability\n", 2, "state-invalid"),
  command("reset-journal-coordinate-mismatch", resetArgv.map((value, index) => index === 5 ? D("f") : value), "", "gkos watcher journal-reset: expected coordinate mismatch\n", 2, "reset-ready"),
  command("reset-missing-coherent-coordinate", resetArgv.slice(0, 6), "", "gkos watcher journal-reset: invalid arguments\n", 2, null),
  command("reset-missing-journal-coordinate", ["watcher", "journal-reset", "--state", "<STATE_DIRECTORY>", "--expected-coherent-manifest-digest", coherentManifestValue.coherent_manifest_digest], "", "gkos watcher journal-reset: invalid arguments\n", 2, null),
  command("reset-missing-state", ["watcher", "journal-reset", "--expected-journal-generation-digest", journalGenerationValue.journal_generation_digest, "--expected-coherent-manifest-digest", coherentManifestValue.coherent_manifest_digest], "", "gkos watcher journal-reset: invalid arguments\n", 2, null),
  command("reset-operational-failure", resetArgv, "", "gkos watcher journal-reset: operational failure\n", 3, "state-operational-failure"),
  command("reset-json-reordered", ["watcher", "journal-reset", "--json", ...resetArgv.slice(2)], "", "gkos watcher journal-reset: invalid arguments\n", 2, null),
  command("reset-reordered-flags", ["watcher", "journal-reset", "--expected-journal-generation-digest", journalGenerationValue.journal_generation_digest, "--state", "<STATE_DIRECTORY>", "--expected-coherent-manifest-digest", coherentManifestValue.coherent_manifest_digest], "", "gkos watcher journal-reset: invalid arguments\n", 2, null),
  command("reset-repeated-coherent-coordinate", ["watcher", "journal-reset", "--state", "<STATE_DIRECTORY>", "--expected-coherent-manifest-digest", coherentManifestValue.coherent_manifest_digest, "--expected-coherent-manifest-digest", coherentManifestValue.coherent_manifest_digest], "", "gkos watcher journal-reset: invalid arguments\n", 2, null),
  command("reset-repeated-journal-coordinate", ["watcher", "journal-reset", "--state", "<STATE_DIRECTORY>", "--expected-journal-generation-digest", journalGenerationValue.journal_generation_digest, "--expected-journal-generation-digest", journalGenerationValue.journal_generation_digest], "", "gkos watcher journal-reset: invalid arguments\n", 2, null),
  command("reset-repeated-state", ["watcher", "journal-reset", "--state", "<STATE_DIRECTORY>", "--state", "<STATE_DIRECTORY>"], "", "gkos watcher journal-reset: invalid arguments\n", 2, null),
  command("reset-short-help-rejected", ["watcher", "journal-reset", "-h"], "", "gkos watcher journal-reset: invalid arguments\n", 2, null),
  command("reset-success-json", [...resetArgv, "--json"], pretty(resetResultValue), "", 0, "reset-ready"),
  command("reset-success-text", resetArgv, renderResetText(resetResultValue), "", 0, "reset-ready"),
  command("reset-vault-rejected", ["watcher", "journal-reset", "--vault", "vault"], "", "gkos watcher journal-reset: invalid arguments\n", 2, null),
  command("reset-coherent-coordinate-mismatch", resetArgv.map((value, index) => index === 7 ? D("f") : value), "", "gkos watcher journal-reset: expected coordinate mismatch\n", 2, "reset-ready"),
  command("status-extra-argument", ["status", "--state", "<STATE_DIRECTORY>", "unexpected"], "", "gkos status: invalid arguments\n", 2, null),
  command("status-help", ["status", "--help"], "Usage: gkos status --state <state-directory> [--json]\n", "", 0, null),
  command("status-invalid-state", ["status", "--state", "<STATE_DIRECTORY>"], "", "gkos status: invalid state capability\n", 2, "state-invalid"),
  command("status-json-reordered", ["status", "--json", "--state", "<STATE_DIRECTORY>"], "", "gkos status: invalid arguments\n", 2, null),
  command("status-missing-state", ["status"], "", "gkos status: invalid arguments\n", 2, null),
  command("status-operational-failure", ["status", "--state", "<STATE_DIRECTORY>"], "", "gkos status: operational failure\n", 3, "state-operational-failure"),
  command("status-pre-genesis-json", ["status", "--state", "<STATE_DIRECTORY>", "--json"], pretty(statusPreGenesisValue), "", 1, "status-pre-genesis"),
  command("status-pre-genesis-text", ["status", "--state", "<STATE_DIRECTORY>"], renderStatusText(statusPreGenesisValue), "", 1, "status-pre-genesis"),
  command("status-reconciling-json", ["status", "--state", "<STATE_DIRECTORY>", "--json"], pretty(statusReconcilingValue), "", 1, "status-reconciling-stale"),
  command("status-reconciling-text", ["status", "--state", "<STATE_DIRECTORY>"], renderStatusText(statusReconcilingValue), "", 1, "status-reconciling-stale"),
  command("status-repeated-state", ["status", "--state", "<STATE_DIRECTORY>", "--state", "<STATE_DIRECTORY>"], "", "gkos status: invalid arguments\n", 2, null),
  command("status-serving-degraded-json", ["status", "--state", "<STATE_DIRECTORY>", "--json"], pretty(statusDegradedValue), "", 1, "status-serving-degraded"),
  command("status-serving-degraded-text", ["status", "--state", "<STATE_DIRECTORY>"], renderStatusText(statusDegradedValue), "", 1, "status-serving-degraded"),
  command("status-serving-fresh-json", ["status", "--state", "<STATE_DIRECTORY>", "--json"], pretty(statusValue), "", 0, "status-serving-fresh"),
  command("status-serving-fresh-text", ["status", "--state", "<STATE_DIRECTORY>"], renderStatusText(statusValue), "", 0, "status-serving-fresh"),
  command("status-short-help-rejected", ["status", "-h"], "", "gkos status: invalid arguments\n", 2, null),
  command("status-vault-rejected", ["status", "--vault", "vault"], "", "gkos status: invalid arguments\n", 2, null),
].sort((left, right) => compare(left.case_id, right.case_id));
const cliMaterial = {
  contract_version: "gkos-watcher-cli-fixture/1.0.0-draft.1", state_fixtures: stateFixtures, commands: cliCommands,
};
const cliFixtureValue = sealed(cliMaterial, "fixture_digest");
queueJson("watcher-cli-fixture.json", cliFixtureValue);

const cliFixtureMutation = (changes) => sealed({
  contract_version: cliFixtureValue.contract_version,
  state_fixtures: changes.state_fixtures ?? clone(cliFixtureValue.state_fixtures),
  commands: changes.commands ?? clone(cliFixtureValue.commands),
}, "fixture_digest");
const stdoutSubstitutionCommands = clone(cliFixtureValue.commands);
const freshTextIndex = stdoutSubstitutionCommands.findIndex((row) => row.case_id === "status-serving-fresh-text");
stdoutSubstitutionCommands[freshTextIndex] = { ...stdoutSubstitutionCommands[freshTextIndex], expected_stdout: "gkos status\n" };
const missingCommandRows = cliFixtureValue.commands.filter((row) => row.case_id !== "status-serving-fresh-json");
const duplicateCommandRows = clone(cliFixtureValue.commands);
duplicateCommandRows.splice(1, 0, clone(duplicateCommandRows[0]));
const presenceSubstitutionStates = clone(cliFixtureValue.state_fixtures);
const preGenesisIndex = presenceSubstitutionStates.findIndex((row) => row.fixture_id === "status-pre-genesis");
presenceSubstitutionStates[preGenesisIndex] = { ...presenceSubstitutionStates[preGenesisIndex], active_coherent: activeValue };
const locatorSubstitutionStates = clone(cliFixtureValue.state_fixtures);
const freshStateIndex = locatorSubstitutionStates.findIndex((row) => row.fixture_id === "status-serving-fresh");
locatorSubstitutionStates[freshStateIndex] = {
  ...locatorSubstitutionStates[freshStateIndex], locator: resealed(locatorValue, "locator_digest", { pid: 4_243 }),
};
semanticCases.push(
  semanticCase("status-pre-genesis-bundle", "seal_status_bundle", {
    locator: locatorValue, status: statusPreGenesisValue, active: null, manifest: null,
  }),
  rejectingSemanticCase("cli-stdout-substitution", "validate_cli_fixture", [cliFixtureMutation({ commands: stdoutSubstitutionCommands })], "GKX_WATCHER_CONTRACT_CLI_INVALID"),
  rejectingSemanticCase("cli-command-missing", "validate_cli_fixture", [cliFixtureMutation({ commands: missingCommandRows })], "GKX_WATCHER_CONTRACT_CLI_INVALID"),
  rejectingSemanticCase("cli-command-duplicate", "validate_cli_fixture", [cliFixtureMutation({ commands: duplicateCommandRows })], "GKX_WATCHER_CONTRACT_CLI_INVALID"),
  rejectingSemanticCase("cli-state-presence-substitution", "validate_cli_fixture", [cliFixtureMutation({ state_fixtures: presenceSubstitutionStates })], "GKX_WATCHER_CONTRACT_CLI_INVALID"),
  rejectingSemanticCase("cli-locator-pid-substitution", "validate_cli_fixture", [cliFixtureMutation({ state_fixtures: locatorSubstitutionStates })], "GKX_WATCHER_CONTRACT_CLI_INVALID"),
);

const storageSemanticCode = (reason) => reason === "GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE" ? "GKX_WATCHER_CONTRACT_RESET_INVALID"
  : ["WATCHER_JOURNAL_IDENTITY_INVALID", "WATCHER_POINTER_RECOVERY_REQUIRED"].includes(reason) ? "GKX_WATCHER_CONTRACT_POINTER_INVALID"
    : "GKX_WATCHER_CONTRACT_SQL_INVALID";
for (const row of [...admissionBoundaryCases, ...sqliteAuthorityCases]) {
  semanticCases.push(row.expectation.expected_valid
    ? semanticCaseWithResult(`sql-${row.case_id}`, "validate_sql_authority", [row.recipe], null)
    : rejectingSemanticCase(`sql-${row.case_id}`, "validate_sql_authority", [row.recipe], storageSemanticCode(row.expectation.expected_reason)));
}
semanticCases.push(
  semanticCaseWithResult("cli-fixture-all-and-only", "validate_cli_fixture", [cliFixtureValue], null),
  semanticCaseWithResult("pack-all-seventeen-canonical-bytes", "validate_pack", [packValidationBundle], null),
  rejectingSemanticCase("pack-self-row-forbidden", "validate_pack", [packSelfBundle], "GKX_WATCHER_CONTRACT_PACK_INVALID"),
  rejectingSemanticCase("pack-file-omitted", "validate_pack", [{
    pack_root_manifest: packValidationManifest, files: packValidationFiles.slice(0, -1),
  }], "GKX_WATCHER_CONTRACT_PACK_INVALID"),
  rejectingSemanticCase("pack-file-reordered", "validate_pack", [{
    pack_root_manifest: packValidationManifest, files: [packValidationFiles[1], packValidationFiles[0], ...packValidationFiles.slice(2)],
  }], "GKX_WATCHER_CONTRACT_PACK_INVALID"),
  rejectingSemanticCase("pack-raw-byte-substitution", "validate_pack", [{
    pack_root_manifest: packValidationManifest, files: packRawMismatchFiles,
  }], "GKX_WATCHER_CONTRACT_PACK_INVALID"),
  rejectingSemanticCase("pack-schema-ownership-duplicate", "validate_pack", [duplicateOwnershipBundle], "GKX_WATCHER_CONTRACT_PACK_INVALID"),
  semanticCaseWithResult("path-portable-valid", "validate_path", ["policy/agent-writing.md"], null),
  rejectingSemanticCase("path-empty-rejected", "validate_path", [""], "GKX_WATCHER_CONTRACT_PATH_INVALID"),
  rejectingSemanticCase("path-posix-absolute-rejected", "validate_path", ["/secret.md"], "GKX_WATCHER_CONTRACT_PATH_INVALID"),
  rejectingSemanticCase("path-drive-absolute-rejected", "validate_path", ["C:/secret.md"], "GKX_WATCHER_CONTRACT_PATH_INVALID"),
  rejectingSemanticCase("path-unc-rejected", "validate_path", ["//server/share/note.md"], "GKX_WATCHER_CONTRACT_PATH_INVALID"),
  rejectingSemanticCase("path-device-rejected", "validate_path", ["\\\\?\\C:\\secret.md"], "GKX_WATCHER_CONTRACT_PATH_INVALID"),
  rejectingSemanticCase("path-uri-rejected", "validate_path", ["file:note.md"], "GKX_WATCHER_CONTRACT_PATH_INVALID"),
  rejectingSemanticCase("path-ads-rejected", "validate_path", ["note.md:ads"], "GKX_WATCHER_CONTRACT_PATH_INVALID"),
  rejectingSemanticCase("path-dot-segment-rejected", "validate_path", ["policy/./note.md"], "GKX_WATCHER_CONTRACT_PATH_INVALID"),
  rejectingSemanticCase("path-double-slash-rejected", "validate_path", ["policy//note.md"], "GKX_WATCHER_CONTRACT_PATH_INVALID"),
  rejectingSemanticCase("path-control-rejected", "validate_path", ["policy/line\nfeed.md"], "GKX_WATCHER_CONTRACT_PATH_INVALID"),
  rejectingSemanticCase("path-parent-rejected", "validate_path", ["../secret.md"], "GKX_WATCHER_CONTRACT_PATH_INVALID"),
  rejectingSemanticCase("path-backslash-rejected", "validate_path", ["policy\\note.md"], "GKX_WATCHER_CONTRACT_PATH_INVALID"),
  rejectingSemanticCase("path-timestamp-calendar-invalid", "seal_record", [impossibleDateLocator], "GKX_WATCHER_CONTRACT_RELATION_INVALID"),
);

const stoppingStatusValue = resealed(statusValue, "status_digest", { watcher_state: "stopping" });
semanticCases.push(semanticCase("shutdown-status-stopping", "seal_record", stoppingStatusValue));

const semanticIds = new Set(semanticCases.map((row) => row.case_id));
const recoveryCategories = {
  event_cases: eventCaseIds,
  transition_cases: semanticCases.filter((row) => /^(?:transition-|coherent-activation|coherent-manifest|batch-id|execution-kind)/u.test(row.case_id)).map((row) => row.case_id).sort(compare),
  topology_cases: semanticCases.filter((row) => /^(?:canonical-graph|graph-delta|graphiti|normalized-delta|raw-graph|topology-|plan-validation)/u.test(row.case_id)).map((row) => row.case_id).sort(compare),
  pointer_cases: semanticCases.filter((row) => /^(?:pointer-|journal-pointer)/u.test(row.case_id)).map((row) => row.case_id).sort(compare),
  crash_cases: semanticCases.filter((row) => /^(?:failure-retry|journal-bootstrap-|journal-reset-(?:all-and-only|anchored-|genesis-|bootstrap-|current-|new-|guard-digest|pointer-target|reconciliation-adoption|recovery-plan)|sql-)/u.test(row.case_id)).map((row) => row.case_id).sort(compare),
  source_removal_cases: semanticCases.filter((row) => /^(?:source-removal|event-|reset-carry|receipt-|adapter-|journal-reset-(?:delivered|ready|response|lost-response|carry|unactivated|prior-membership))/u.test(row.case_id)).map((row) => row.case_id).sort(compare),
  status_control_cases: semanticCases.filter((row) => /^(?:status-|cli-)/u.test(row.case_id)).map((row) => row.case_id).sort(compare),
  provider_cases: semanticCases.filter((row) => /^(?:measurement-|pack-)/u.test(row.case_id)).map((row) => row.case_id).sort(compare),
  path_identity_cases: semanticCases.filter((row) => /^path-/u.test(row.case_id)).map((row) => row.case_id).sort(compare),
  shutdown_cases: ["shutdown-status-stopping"],
};
const categorizedIds = Object.values(recoveryCategories).flat();
if (categorizedIds.length !== semanticCases.length || new Set(categorizedIds).size !== semanticCases.length
    || categorizedIds.some((id) => !semanticIds.has(id))) throw new Error("watcher recovery semantic categories must consume every case exactly once");
const recoveryMaterial = {
  contract_version: "gkos-watcher-recovery-fixture/1.0.0-draft.1", ...recoveryCategories,
};
const recoveryFixtureValue = sealed(recoveryMaterial, "fixture_digest");
queueJson("watcher-recovery-fixture.json", recoveryFixtureValue);

schemaCases.push(
  { case_id: "cli-fixture-valid", schema_file: "status.schema.json", expected_valid: true, value: cliFixtureValue },
  { case_id: "storage-fixture-valid", schema_file: "journal.schema.json", expected_valid: true, value: storageFixtureValue },
  { case_id: "recovery-fixture-valid", schema_file: "conformance.schema.json", expected_valid: true, value: recoveryFixtureValue },
);

const conformanceMaterial = {
  contract_version: "gkos-watcher-recovery-conformance/1.0.0-draft.1", pack_contract_version: PACK_VERSION, status: "frozen", frozen: true,
  sample_plan_file: "watcher-sample-plan.json", sample_plan_digest: SAMPLE_PLAN_DIGEST, schema_cases: schemaCases, semantic_cases: semanticCases,
  companion_files: ["watcher-cli-fixture.json", "watcher-recovery-fixture.json", "watcher-storage-fixture.json"],
};
queueJson("watcher-conformance-fixture.json", sealed(conformanceMaterial, "conformance_digest"));

const exactVectorSchema = (values) => ({
  type: "array", minItems: values.length, maxItems: values.length,
  prefixItems: values.map((value) => ({ const: value })), items: false,
});
const governedOrNull = (ref, present) => present ? { $ref: ref } : { type: "null" };
const stateRefs = {
  locator: `${SCHEMA_ROOT}status.schema.json#/$defs/serviceLocator`,
  status: `${SCHEMA_ROOT}status.schema.json#/$defs/watcherStatus`,
  active_coherent: `${SCHEMA_ROOT}journal.schema.json#/$defs/activeCoherent`,
  coherent_manifest: `${SCHEMA_ROOT}coherent-manifest.schema.json#/$defs/coherentManifest`,
  journal_generation: `${SCHEMA_ROOT}journal.schema.json#/$defs/journalGeneration`,
  journal_pointer: `${SCHEMA_ROOT}journal.schema.json#/$defs/journalPointer`,
  reset_result: `${SCHEMA_ROOT}status.schema.json#/$defs/resetResult`,
};
const cliStateFixture = {
  oneOf: stateFixtures.map((fixture) => exactObject({
    fixture_id: { const: fixture.fixture_id }, capability_state: { const: fixture.capability_state },
    locator: governedOrNull(stateRefs.locator, fixture.locator !== null),
    status: governedOrNull(stateRefs.status, fixture.status !== null),
    active_coherent: governedOrNull(stateRefs.active_coherent, fixture.active_coherent !== null),
    coherent_manifest: governedOrNull(stateRefs.coherent_manifest, fixture.coherent_manifest !== null),
    journal_generation: governedOrNull(stateRefs.journal_generation, fixture.journal_generation !== null),
    journal_pointer: governedOrNull(stateRefs.journal_pointer, fixture.journal_pointer !== null),
    reset_result: governedOrNull(stateRefs.reset_result, fixture.reset_result !== null),
  })),
};
const cliCommand = exactObject({
  case_id: { enum: cliCommands.map((row) => row.case_id) },
  argv_template: { type: "array", minItems: 1, maxItems: 9, items: { type: "string" } },
  expected_stdout: { type: "string" }, expected_stderr: { type: "string" },
  expected_exit_code: { type: "integer", minimum: 0, maximum: 3 },
  required_state_fixture: { anyOf: [{ enum: stateFixtures.map((row) => row.fixture_id) }, { type: "null" }] },
});
const cliFixture = exactObject({
  contract_version: { const: "gkos-watcher-cli-fixture/1.0.0-draft.1" },
  state_fixtures: { type: "array", minItems: 7, maxItems: 7, items: cliStateFixture },
  commands: { type: "array", minItems: cliCommands.length, maxItems: cliCommands.length, items: cliCommand },
  fixture_digest: digestSchema,
});
Object.assign(statusSchema.$defs, { cliStateFixture, cliCommand, cliFixture });
statusSchema.oneOf.push(schemaRef("status.schema.json", "cliFixture"));

const storageReason = {
  enum: [
    "GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE", "WATCHER_JOURNAL_CAP_EXCEEDED", "WATCHER_JOURNAL_IDENTITY_INVALID",
    "WATCHER_JOURNAL_INTEGRITY_INVALID", "WATCHER_JOURNAL_SCHEMA_INVALID", "WATCHER_JOURNAL_VALUE_INVALID", "WATCHER_POINTER_RECOVERY_REQUIRED",
  ],
};
const storageExpectationSchema = exactObject({
  expected_valid: { type: "boolean" }, expected_reason: { anyOf: [storageReason, { type: "null" }] },
});
const admissionRecipeSchema = exactObject({
  recipe_kind: { enum: ["pre_transaction", "post_reopen"] }, current_database_bytes: safeInteger,
  blob_bytes: safeInteger, mutated_rows: safeInteger, wal_bytes: safeInteger, shm_bytes: safeInteger,
});
const sqliteMutationRecipeSchema = exactObject({
  recipe_kind: { enum: ["body_scalar", "column", "foreign_key", "identity", "index", "integrity", "outbox", "pragma", "reset", "sqlite_master"] },
  target: label,
  mutation: { enum: [
    "affinity_drift", "alias_swap", "body_digest_mismatch", "column_order_drift", "corrupt_database", "extra_object", "foreign_key_drift",
    "hardlink", "integrity_failure", "missing_object", "mode_widened", "noncanonical_body", "notnull_drift", "parent_swap", "pragma_drift",
    "primary_key_drift", "reparse", "sqlite_replacement", "trigger_added", "unknown_reserved_leaf", "view_added", "virtual_table_added",
  ] },
});
const sqlValidationRecipeSchema = { oneOf: [admissionRecipeSchema, sqliteMutationRecipeSchema] };
const admissionBoundaryCaseSchema = exactObject({ case_id: label, recipe: admissionRecipeSchema, expectation: storageExpectationSchema });
const sqliteAuthorityCaseSchema = exactObject({ case_id: label, recipe: sqlValidationRecipeSchema, expectation: storageExpectationSchema });
const storageLimitsSchema = exactObject(Object.fromEntries(Object.entries(storageLimits).map(([key, value]) => [key, { const: value }])));
const storageFixture = exactObject({
  contract_version: { const: "gkos-watcher-storage-fixture/1.0.0-draft.1" },
  pragmas: exactVectorSchema(storageMaterial.pragmas), ddl: exactVectorSchema(storageDdl), limits: storageLimitsSchema,
  admission_boundary_cases: { type: "array", minItems: admissionBoundaryCases.length, maxItems: admissionBoundaryCases.length, items: admissionBoundaryCaseSchema },
  sqlite_authority_cases: { type: "array", minItems: sqliteAuthorityCases.length, maxItems: sqliteAuthorityCases.length, items: sqliteAuthorityCaseSchema },
  journal_reset_recovery: { const: journalResetRecovery }, fixture_digest: digestSchema,
});
Object.assign(journalSchema.$defs, {
  storageExpectation: storageExpectationSchema, admissionRecipe: admissionRecipeSchema, sqliteMutationRecipe: sqliteMutationRecipeSchema,
  sqlValidationRecipe: sqlValidationRecipeSchema, admissionBoundaryCase: admissionBoundaryCaseSchema,
  sqliteAuthorityCase: sqliteAuthorityCaseSchema, storageLimits: storageLimitsSchema, storageFixture,
});
journalSchema.oneOf.push(schemaRef("journal.schema.json", "storageFixture"));

const recoveryCategorySchema = (caseIds) => exactVectorSchema(caseIds);
const recoveryFixture = exactObject({
  contract_version: { const: "gkos-watcher-recovery-fixture/1.0.0-draft.1" },
  event_cases: recoveryCategorySchema(recoveryCategories.event_cases),
  transition_cases: recoveryCategorySchema(recoveryCategories.transition_cases),
  topology_cases: recoveryCategorySchema(recoveryCategories.topology_cases),
  pointer_cases: recoveryCategorySchema(recoveryCategories.pointer_cases),
  crash_cases: recoveryCategorySchema(recoveryCategories.crash_cases),
  source_removal_cases: recoveryCategorySchema(recoveryCategories.source_removal_cases),
  status_control_cases: recoveryCategorySchema(recoveryCategories.status_control_cases),
  provider_cases: recoveryCategorySchema(recoveryCategories.provider_cases),
  path_identity_cases: recoveryCategorySchema(recoveryCategories.path_identity_cases),
  shutdown_cases: recoveryCategorySchema(recoveryCategories.shutdown_cases),
  fixture_digest: digestSchema,
});
conformanceSchema.$defs.recoveryFixture = recoveryFixture;
conformanceSchema.oneOf.push(schemaRef("conformance.schema.json", "recoveryFixture"));

const semanticCaseSchema = conformanceFixtureSchema.properties.semantic_cases.items;
const semanticArities = {
  derive_graphiti_projection: 2, normalize_canonical_graph: 1, normalize_graph_delta: 1, seal_coherent_activation_bundle: 2,
  seal_failure_retry_bundle: 1, seal_failure_retry_noop_bundle: 1, seal_journal_reset_bundle: 3,
  seal_journal_reset_reconciliation_adoption_bundle: 1,
  seal_measurement: 1, seal_pointer_recovery: 2,
  seal_record: 1, seal_source_removal_adapter_verification_bundle: 1, seal_source_removal_event_set_bundle: 1,
  seal_source_removal_receipt_bundle: 1, seal_status_bundle: 1, seal_transition_chain: 1, validate_cli_fixture: 1,
  validate_pack: 1, validate_path: 1, validate_sql_authority: 1,
};
semanticCaseSchema.allOf = Object.entries(semanticArities).map(([operation, arity]) => ({
  if: { type: "object", properties: { operation: { const: operation } }, required: ["operation"] },
  then: { properties: { input: { type: "object", properties: { arguments: { type: "array", minItems: arity, maxItems: arity } } } } },
}));

for (const [name, value] of [
  ["batch.schema.json", batchSchema], ["topology.schema.json", topologySchema], ["journal.schema.json", journalSchema],
  ["transition.schema.json", transitionSchema], ["coherent-manifest.schema.json", coherentManifestSchema], ["authority.schema.json", authoritySchema],
  ["source-removal.schema.json", sourceRemovalSchema], ["status.schema.json", statusSchema], ["sample-plan.schema.json", samplePlanPackSchema],
  ["conformance.schema.json", conformanceSchema],
]) queueJson(name, value);

queueText("README.md", `# GKOS watcher recovery contract pack\n\nStatus: frozen Phase 5 Slice A contract/reference authority.\n\nThis pack freezes watcher delta coordination, durable observation/plan/topology authority, journal transitions, coherent activation, verified source-removal projection, status, crash recovery, and the fixed convergence sample plan. It is a contract/reference pack only; it does not activate a watcher, service, journal, provider, pointer writer, or source-removal adapter.\n\nPhase 5 extends the engine without changing Phase 0–4 contracts or public exports. Source notes remain read-only. A physical disappearance can create an idempotent local projection-removal event, but it never asserts authored supersession, predecessor disposition, or a canonical valid_to. Phase 7 graph storage/tools are explicitly not applicable here.\n`);
queueText("TECHNICAL_README.md", `# Watcher recovery technical contract\n\nAll governed digests use compact recursively UTF-16-code-unit-key-sorted canonical JSON and lowercase SHA-256. A record digest excludes only its own digest field. JSON Schema is structural; the private semantic sealer is mandatory for UTF-8 byte caps, ordering, transition, cross-artifact, idempotency, percentile, and digest relations.\n\nThe normal journal progression is observed(0), normalized(1), gkx_applied(2), retrieval_applied(3), graph_applied(4), activation_prepared(5), complete(6). Failed and superseded are terminal rows at prior ordinal plus one, retain the last reached payload, and never invent the next stage. Observation, Plan, topology, and raw graph artifacts are immutable and content addressed. The fixed outer pointer is replaced only by the guarded host protocol defined by the recovery fixture; readers never combine generations. A guard is removed last, and a reader requires two exact guard-absent namespace observations. The watcher and legacy Phase 3 index writer share one outer writer authority and cache ancestry coordinate.\n\nA 500 ms debounce coalesces at most 2,000 path hints, with a separate 2,000 ms maximum coalesce age. Overflow, empty-name, uncertain rename, and out-of-order evidence force an unscoped secure reconciliation through production setFiles. Scoped batches call production applyChanges once. fs.watch data is only a hint; rename additionally requires stable source ID, content digest, and parser descriptor evidence.\n\nThe fixed effective validation mode is non_strict. A deterministic invalid changed note publishes the N-1 valid target plus its sealed rejection and removes prior local projections without emitting source_removed. Only a physical disappearance creates a source-removal occurrence. Capability/read/TOCTOU instability leaves the prior coherent generation active and stale. Topology source observations retain the Phase 3 composite coordinate (source_path, source_observation_ordinal); ordinals are path-local, so distinct paths may each use zero, while a repeated composite or accepted/rejected path splice fails closed. The exact ignored set is .gkx, .obsidian, .git, node_modules, .trash, .DS_Store, the existing _archive/moc-runs/ navigation prefix, and trusted configured exclusions; ordinary archive and archives components remain authored inputs.\n\nFolders and attachments are part of the topology snapshot, and either set changing forces graph work even if production GraphDelta is otherwise empty. Canonical graph and deterministic Graphiti projections are clean-versus-incremental convergence authorities; the raw graph remains a generation-bound startup artifact and retains timing. The Graphiti processing coordinate is the fixed Unix epoch sentinel. Phase 7 graph sink storage and tools remain not_applicable.\n\nThe journal hard admission cap is 4 GiB aggregate, with projected database <=2,048,000,000 bytes, 32 MiB per BLOB, and 10,000 mutated rows per transaction. Oversized observation/plan/topology/graph artifacts fail closed. A million-row source-removal outbox is prepared in bounded preactivation transactions; activation is forbidden until the PlanAuthority or reset guard binds the complete all-and-only occurrence/event/membership set, exact count, and membership-sequence digest. Reset never deletes evidence automatically and requires an exhaustively resealable outbox; corrupt or ambiguous outbox evidence is retained and exits operationally.\n\nSource removal has stable occurrence/event identity, per-batch or immediate reset-carry membership, activation gating, stable authorized adapter binding, per-process verification capability, exact request/response/receipt persistence, and first-binding reuse. A null binding is terminal local_only and is not degraded solely by adapter absence. Configured unavailable or unauthorized prior bindings remain pending/degraded and are never silently rebound. No vendor, domain, route, or private-LAN preference exists; selected providers remain trusted-configuration, provider-neutral coordinates, and FTS-only operation requires none.\n\nGraceful shutdown stops new batches, flushes debounce, drains or checkpoints only at safe boundaries within 10,000 ms, commits the last coherent manifest, and closes stores/transports before exit. Lite supervision waits 12,000 ms before its distinct hard-kill recovery path. Slice A does not activate either path; the current Lite delegates the final signed Full behavior, while a standalone Rust watcher remains an explicit Phase 9 blocked gate.\n\nThe convergence plan is exactly 3,978 canonical UTF-8 bytes without a terminal LF and has digest ${SAMPLE_PLAN_DIGEST}. Twenty measured edit-to-external-search samples include durable writer close/atomic replacement, OS event delivery, debounce, secure scan, validation, GKX/retrieval/graph work, journal commits, outer activation, and real external search. Nearest-rank indexes are 9/18/19; each sample plus p95 must be <=5,000,000 microseconds. The reference real-FTS lane records 23 generations, 22 queries, and zero provider calls; physically unavailable matrix lanes execute the finite zero-work outcome rather than skip.\n`);
files.set("TECHNICAL_README.md", files.get("TECHNICAL_README.md").replace(
  "exactly 3,978 canonical UTF-8 bytes",
  "exactly 4,363 canonical UTF-8 bytes",
));
files.set("TECHNICAL_README.md", files.get("TECHNICAL_README.md").replace(
  "\n\nGraceful shutdown stops new batches",
  "\n\nJournal reset retains the exact journal-<UUIDv7>/watcher-journal.sqlite generation literals. It seals the closed database and optional WAL/SHM identities without moving or deleting them, publishes the fixed .gkos-watcher-journal-reset.guard through its exact staging hard-link protocol, and creates the guard-bound anchored replacement generation. The reset carry is all-and-only the exhaustively resealed activated adapter events that remain without an exact response/receipt; delivered, local_only, unactivated, missing, extra, and duplicate rows reject. Recovery admits only reset guard plus old pointer with absent/partial/exact child, old pointer with complete child and any exact nested old-pointer S/G/T/F state, or new pointer with complete child and the exact nested new-pointer state. Every alias, extra, mode, identity, body, or digest ambiguity retains all evidence. The nested pointer guard is removed and fsynced first; the reset guard is removed and fsynced last. An anchored new database may lack active_coherent and batches only until mandatory startup reconciliation.\n\nIf that mandatory startup setFiles proves the source/configuration/policy/profile/topology/retrieval/canonical-graph/Graphiti coordinates byte-identical, the replacement journal may atomically adopt the exact native Active through one ResetReconciliationAdoption receipt and one ordinal-zero adoption transition. The adoption transaction inserts only the receipt-backed batch row, transition row, and byte-identical Active row; it writes no observation/Plan table row, activation intent/outcome, retrieval generation, provider work, or outer pointer. Its Active intent resolves through the securely reopened immutable native journal. Repeated resets flatten to that same native activation rather than chaining adoption authority. Any semantic change uses ordinary reconciliation; partial, duplicate, spliced, or locally invented adoption authority rejects.\n\nGraceful shutdown stops new batches",
));
files.set("TECHNICAL_README.md", files.get("TECHNICAL_README.md").replace(
  "\n\nGraceful shutdown stops new batches",
  "\n\nA capability/read/TOCTOU failure durably commits one failed batch before arming exactly one retry timer. Consecutive failure index n starts at zero, survives restart, and uses delay min(500 * 2^min(n,4), 5000) ms: 500, 1000, 2000, 4000, then 5000 forever, with no jitter or attempt cap. Every retry is one fresh unscoped failure_reconciliation setFiles batch bound to its immediate failed parent by FailureRetryBundle. All reconciliation ingress joins the same active-plus-one-pending coordinator while backoff is armed; request-local freshness waits for that authority rather than serving a stale generation. An unchanged successful retry commits exactly the retry Batch, ObservationAuthority, PlanAuthority, and FailureRetryNoopTransition rows, leaves Active/retrieval/graph/outer bytes unchanged, and terminates the durable epoch. A changed complete activation also terminates it. Shutdown cancels only the in-process timer and never resets the durable failure index.\n\nGraceful shutdown stops new batches",
));

mkdirSync(pack, { recursive: true });
for (const [name, body] of files) writeFileSync(resolve(pack, name), body);

const manifestRows = [...files.keys()].sort(compare).map((file) => {
  const bytes = readFileSync(resolve(pack, file));
  return { file, byte_size: bytes.length, raw_sha256: sha(bytes) };
});
if (manifestRows.length !== 17) throw new Error(`watcher pack requires 17 non-manifest leaves, got ${manifestRows.length}`);
const manifest = sealed({
  contract_version: "gkos-watcher-recovery-pack-manifest/1.0.0-draft.1", pack_contract_version: PACK_VERSION,
  files: manifestRows, file_count: manifestRows.length, total_bytes: manifestRows.reduce((sum, row) => sum + row.byte_size, 0),
}, "pack_digest");
writeFileSync(resolve(pack, "pack-manifest.json"), pretty(manifest));

console.log(`generated watcher recovery pack: 18 files, ${manifest.total_bytes} governed bytes, ${manifest.pack_digest}`);
