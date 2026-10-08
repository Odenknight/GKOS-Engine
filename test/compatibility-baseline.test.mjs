import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import http from "node:http";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import * as root from "../dist/gkos-engine.mjs";
import * as adapter from "../dist/adapter.mjs";
import * as gkx from "../dist/gkx.mjs";
import * as graphiti from "../dist/graphiti-adapter.mjs";
import * as navigation from "../dist/navigation.mjs";
import * as governance from "../dist/governance.mjs";
import {
  LOOPBACK_HOST,
  createAgentServer,
} from "../dist/gkos-desktop-agent.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_ROOT = resolve(
  REPO_ROOT,
  "test/fixtures/compatibility/full-v2.1.2",
);
const FIXED_PROCESSING_TIME = "2026-08-20T00:00:00.000Z";
const ADDITIVE_RETRIEVAL_SEARCH_HELP = `  gkx search <query> --kb-path <dir> [--limit <n>]    public-only lexical retrieval with exact citations
             [--as-of <GKX-timestamp>] [--config <trusted-gkos.toml>] [--trust-cwd-config]
`;
const ADDITIVE_INGEST_HELP = `  gkx validate --kb-path <path> [--schema <path-or-id>] [--format text|json]
  gkx index --kb-path <path> [--schema <path-or-id>] [--strict]
`;
const SOURCE_A = `---
gkx_version: "2.3"
uid: "019b2d14-4230-7db7-87d4-7d81cfaeca01"
title: "A"
type: "note"
created_at: "2026-01-01T00:00:00Z"
updated_at: "2026-01-01T12:00:00Z"
epistemic_state: "hypothesis"
sensitivity: "internal"
authorship_origin: "authored"
---
# A

Body links [[B]].`;
const SOURCE_B = `---
gkx_version: "2.3"
uid: "019b2d14-4230-7db7-87d4-7d81cfaeca02"
title: "B"
type: "note"
created_at: "2026-01-02T00:00:00Z"
updated_at: "2026-01-02T12:00:00Z"
epistemic_state: "hypothesis"
sensitivity: "internal"
authorship_origin: "authored"
---
# B

Body.`;

const jsonFixture = (name) =>
  JSON.parse(readFileSync(resolve(FIXTURE_ROOT, name), "utf8"));
const textFixture = (name) =>
  readFileSync(resolve(FIXTURE_ROOT, name), "utf8");
const bytesFixture = (name) => readFileSync(resolve(FIXTURE_ROOT, name));
const jsonBytes = (value) =>
  Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8");

function withoutPhase1SearchHelp(help) {
  assert.equal(help.split(ADDITIVE_RETRIEVAL_SEARCH_HELP).length - 1, 1, "additive retrieval search help must occur exactly once");
  assert.equal(help.split(ADDITIVE_INGEST_HELP).length - 1, 1, "additive ingest help must occur exactly once");
  return help.replace(ADDITIVE_RETRIEVAL_SEARCH_HELP, "").replace(ADDITIVE_INGEST_HELP, "");
}

function compatibilityCorpus() {
  return [
    {
      relativePath: "Notes/A.md",
      name: "A.md",
      extension: "md",
      kind: "note",
      size: Buffer.byteLength(SOURCE_A, "utf8"),
      createdTime: Date.parse("2026-01-01T00:00:00Z"),
      modifiedTime: Date.parse("2026-01-01T12:00:00Z"),
      content: SOURCE_A,
    },
    {
      relativePath: "Notes/B.md",
      name: "B.md",
      extension: "md",
      kind: "note",
      size: Buffer.byteLength(SOURCE_B, "utf8"),
      createdTime: Date.parse("2026-01-02T00:00:00Z"),
      modifiedTime: Date.parse("2026-01-02T12:00:00Z"),
      content: SOURCE_B,
    },
  ];
}

function stableGraphBytes(graph) {
  const {
    lastFullBuildMs: _lastFullBuildMs,
    lastIncrementalUpdateMs: _lastIncrementalUpdateMs,
    ...diagnostics
  } = graph.diagnostics;
  const {
    indexedAt: _indexedAt,
    durationMs: _durationMs,
    ...stats
  } = graph.stats;
  return jsonBytes({ ...graph, diagnostics, stats });
}

function invoke(relativeScript, args) {
  return spawnSync(process.execPath, [resolve(REPO_ROOT, relativeScript), ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
}

function request(port, path, token, method = "GET") {
  return new Promise((resolveRequest, rejectRequest) => {
    const headers = token ? { authorization: "Bearer " + token } : {};
    const req = http.request(
      { host: LOOPBACK_HOST, port, path, method, headers },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () =>
          resolveRequest({
            status: res.statusCode,
            contentType: res.headers["content-type"],
            body,
          }),
        );
      },
    );
    req.on("error", rejectRequest);
    req.end();
  });
}

test("Phase 0 fixture locks public exports, Navigation capabilities, and CLI behavior", () => {
  const expectedExports = jsonFixture("public-exports.json");
  const actualExports = {
    root: Object.keys(root).sort(),
    adapter: Object.keys(adapter).sort(),
    gkx: Object.keys(gkx).sort(),
    graphiti: Object.keys(graphiti).sort(),
    navigation: Object.keys(navigation).sort(),
    governance: Object.keys(governance).sort(),
  };
  assert.deepEqual(actualExports, expectedExports);
  assert.deepEqual(
    navigation.getNavigationCapabilities(),
    jsonFixture("navigation-capabilities.json"),
  );

  const expectedCli = jsonFixture("cli.json");
  const help = invoke("bin/gkx.mjs", ["--help"]);
  assert.equal(help.status, expectedCli.help_exit_code);
  assert.equal(help.stderr, "");
  assert.equal(withoutPhase1SearchHelp(help.stdout), textFixture("cli-help.txt"));

  const missing = invoke("bin/gkx.mjs", []);
  assert.equal(missing.status, expectedCli.missing_command_exit_code);
  assert.equal(missing.stderr, "");

  const unknown = invoke("bin/gkx.mjs", ["phase-0-unknown"]);
  assert.equal(unknown.status, expectedCli.unknown_command_exit_code);
  assert.match(unknown.stderr, /unknown command 'phase-0-unknown'/);

  const desktopHelp = invoke("dist/gkos-desktop-agent.mjs", ["--help"]);
  assert.equal(desktopHelp.status, expectedCli.desktop_help_exit_code);
  assert.match(desktopHelp.stdout, /gkos-agent \(GKOS-Engine desktop helper\) v2\.1\.2/);
  assert.match(desktopHelp.stdout, /This helper reads notes but never edits them\./);
});

test("Phase 0 fixture byte-locks normalized GkxIndex graph and Graphiti episodes", () => {
  const index = new root.GkxIndex();
  const graph = index.setFiles(compatibilityCorpus(), ["Notes"]).graph;
  const sourceNodes = graph.nodes.filter((node) => node.kind === "file");
  assert.equal(sourceNodes.length, 2);
  for (const node of sourceNodes) {
    assert.equal(node.gkx?.projection?.authored?.sensitivity, "internal");
    assert.equal(node.gkx?.projection?.effective?.sensitivity, "internal");
  }
  assert.deepEqual(
    stableGraphBytes(graph),
    bytesFixture("gkx-index-graph.json"),
    "deterministic GkxIndex bytes changed",
  );

  const episodes = root.buildGraphitiEpisodes(graph, {
    vault: "compat-vault",
    vaultIdentity: "phase-0-full",
    processingTime: FIXED_PROCESSING_TIME,
  });
  assert.deepEqual(
    jsonBytes(episodes),
    bytesFixture("graphiti-episodes.json"),
    "deterministic Graphiti episode bytes changed",
  );
});

test("Phase 0 fixture locks legacy REST response envelopes and authorization", async () => {
  const index = new root.GkxIndex();
  const graph = index.setFiles(compatibilityCorpus(), ["Notes"]).graph;
  const token = "phase-0-compatibility-token";
  const status = {
    pid: 1234,
    port: 4814,
    url: "http://127.0.0.1:4814/",
    token_path: "<owner-protected>",
    notes_dir: "<fixture>",
    default_sensitivity: "secret",
    notes_indexed: 2,
    state: "serving",
    last_scan_iso: null,
  };
  const server = createAgentServer({
    index,
    token,
    getStatus: () => status,
    vaultName: "compat-vault",
  });
  server.listen(0, LOOPBACK_HOST);
  await once(server, "listening");
  const address = server.address();
  assert.equal(typeof address, "object");
  try {
    const unauthorized = await request(address.port, "/health", null);
    assert.deepEqual(
      {
        status: unauthorized.status,
        contentType: unauthorized.contentType,
        body: JSON.parse(unauthorized.body),
      },
      {
        status: 401,
        contentType: "application/json; charset=utf-8",
        body: {
          error: "unauthorized",
          detail: "Bearer token required.",
        },
      },
    );

    const health = await request(address.port, "/health", token);
    assert.equal(health.status, 200);
    assert.equal(health.contentType, "application/json; charset=utf-8");
    assert.deepEqual(JSON.parse(health.body), status);

    const notes = await request(address.port, "/notes", token);
    assert.equal(notes.status, 200);
    assert.deepEqual(JSON.parse(notes.body), {
      notes: [
        {
          id: "file:Notes/A.md",
          path: "Notes/A.md",
          label: "A",
          type: "note",
          sensitivity: "internal",
        },
        {
          id: "file:Notes/B.md",
          path: "Notes/B.md",
          label: "B",
          type: "note",
          sensitivity: "internal",
        },
      ],
      count: 2,
    });

    const graphResponse = await request(address.port, "/graph", token);
    assert.equal(graphResponse.status, 200);
    assert.deepEqual(
      stableGraphBytes(JSON.parse(graphResponse.body)),
      bytesFixture("gkx-index-graph.json"),
    );

    const graphitiResponse = await request(
      address.port,
      "/graphiti/episodes",
      token,
    );
    assert.equal(graphitiResponse.status, 200);
    const graphitiBody = JSON.parse(graphitiResponse.body);
    assert.deepEqual(Object.keys(graphitiBody), ["episodes", "count"]);
    assert.equal(graphitiBody.count, 2);
    for (const episode of graphitiBody.episodes) {
      assert.deepEqual(Object.keys(episode), [
        "uuid",
        "name",
        "episode_body",
        "source",
        "source_description",
        "reference_time",
        "group_id",
        "episode_metadata",
      ]);
    }

    const wrongMethod = await request(address.port, "/notes", token, "POST");
    assert.deepEqual(
      {
        status: wrongMethod.status,
        body: JSON.parse(wrongMethod.body),
      },
      {
        status: 405,
        body: {
          error: "method_not_allowed",
          detail: "Read-only agent API; GET only.",
        },
      },
    );

    const missingRoute = await request(address.port, "/phase-0-missing", token);
    assert.deepEqual(
      {
        status: missingRoute.status,
        body: JSON.parse(missingRoute.body),
      },
      {
        status: 404,
        body: {
          error: "not_found",
          detail: "/phase-0-missing",
        },
      },
    );
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("Phase 0 fixture comparison detects deliberate interface perturbations", () => {
  const expectedCapabilities = jsonFixture("navigation-capabilities.json");
  const perturbedCapabilities = structuredClone(expectedCapabilities);
  perturbedCapabilities.navigation.source_content_write = true;
  assert.throws(
    () => assert.deepEqual(navigation.getNavigationCapabilities(), perturbedCapabilities),
    assert.AssertionError,
  );

  const expectedGraph = bytesFixture("gkx-index-graph.json");
  const perturbedGraph = Buffer.from(
    expectedGraph
      .toString("utf8")
      .replace('"kind": "wikilink"', '"kind": "semantic"'),
    "utf8",
  );
  const index = new root.GkxIndex();
  const graph = index.setFiles(compatibilityCorpus(), ["Notes"]).graph;
  assert.throws(
    () => assert.deepEqual(stableGraphBytes(graph), perturbedGraph),
    assert.AssertionError,
  );

  const currentHelp = invoke("bin/gkx.mjs", ["--help"]).stdout;
  const perturbedLegacyHelp = currentHelp.replace("gkx validate <dir>", "gkx validate-broken <dir>");
  assert.throws(
    () => assert.equal(withoutPhase1SearchHelp(perturbedLegacyHelp), textFixture("cli-help.txt")),
    assert.AssertionError,
  );
});
