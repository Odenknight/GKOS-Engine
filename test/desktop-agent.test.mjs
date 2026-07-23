/**
 * Desktop-agent sidecar tests (build spec Repo A).
 *
 * Covers: arg validation (bad/missing level → secret; --notes required; --host
 * rejected; port defaulting), the coalescing watcher debounce, loopback-only
 * bind, and the mandatory bearer token (401 without / 200 with).
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";

import {
  parseArgs,
  Debouncer,
  createAgentServer,
  loadOrCreateToken,
  SENSITIVITY_LEVELS,
  DEFAULT_PORT,
  LOOPBACK_HOST,
} from "../dist/kosmos-desktop-agent.mjs";
import { KosmosIndex } from "../dist/kosmos-core.mjs";
import { mkdtempSync, rmSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---- arg validation ----------------------------------------------------

test("parseArgs: valid sensitivity is honored", () => {
  const a = parseArgs(["--notes", "/x", "--default-sensitivity", "internal"]);
  assert.equal(a.defaultSensitivity, "internal");
});

test("parseArgs: invalid sensitivity fails closed to secret", () => {
  const a = parseArgs(["--notes", "/x", "--default-sensitivity", "banana"]);
  assert.equal(a.defaultSensitivity, "secret");
});

test("parseArgs: missing sensitivity fails closed to secret", () => {
  const a = parseArgs(["--notes", "/x"]);
  assert.equal(a.defaultSensitivity, "secret");
});

test("parseArgs: --notes is required", () => {
  assert.throws(() => parseArgs(["--default-sensitivity", "public"]), /--notes/);
});

test("parseArgs: --host is rejected (loopback only)", () => {
  assert.throws(() => parseArgs(["--notes", "/x", "--host", "0.0.0.0"]), /host/);
});

test("parseArgs: port defaults to 4814; invalid falls back to default", () => {
  assert.equal(parseArgs(["--notes", "/x"]).port, DEFAULT_PORT);
  assert.equal(parseArgs(["--notes", "/x", "--port", "0"]).port, DEFAULT_PORT);
  assert.equal(parseArgs(["--notes", "/x", "--port", "not-a-number"]).port, DEFAULT_PORT);
  assert.equal(parseArgs(["--notes", "/x", "--port", "5000"]).port, 5000);
});

test("SENSITIVITY_LEVELS is the seven-level vocabulary ending at secret", () => {
  assert.equal(SENSITIVITY_LEVELS.length, 7);
  assert.equal(SENSITIVITY_LEVELS[SENSITIVITY_LEVELS.length - 1], "secret");
});

// ---- debounce -----------------------------------------------------------

test("Debouncer coalesces a burst into a single flush carrying every path", async () => {
  let flushes = 0;
  let lastPaths = [];
  const d = new Debouncer(30, (paths) => {
    flushes++;
    lastPaths = paths;
  });
  d.schedule("a.md");
  d.schedule("b.md");
  d.schedule("a.md"); // duplicate coalesced
  d.schedule("c.md");
  assert.equal(flushes, 0, "no flush before the quiet window elapses");
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(flushes, 1, "exactly one flush for the whole burst");
  assert.deepEqual([...lastPaths].sort(), ["a.md", "b.md", "c.md"]);
});

test("Debouncer arms a fresh window per burst", async () => {
  let flushes = 0;
  const d = new Debouncer(30, () => flushes++);
  d.schedule("x");
  await new Promise((r) => setTimeout(r, 80));
  d.schedule("y");
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(flushes, 2);
});

// ---- token persistence --------------------------------------------------

test("loadOrCreateToken generates a 64-hex token and reuses it on subsequent runs", () => {
  const dir = mkdtempSync(join(tmpdir(), "gkos-tok-"));
  try {
    const p = join(dir, "desktop-agent.token");
    const t1 = loadOrCreateToken(p);
    assert.match(t1, /^[0-9a-f]{64}$/);
    const t2 = loadOrCreateToken(p);
    assert.equal(t1, t2, "token persists across runs");
    assert.equal(readFileSync(p, "utf8").trim(), t1);
    assert.ok(statSync(p).isFile());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- server: loopback bind + token gate ---------------------------------

// A note WITH frontmatter (so a projection is built) but NO sensitivity field
// — the unlabeled case the configured default governs.
const UNLABELED =
  '---\nokf_version: "2.3"\nuid: "note:a"\ntitle: A\ntype: note\ncreated_at: 2026-01-01T00:00:00Z\nepistemic_state: observation\n---\nBody';

async function withServer(fn) {
  const index = new KosmosIndex({ defaultSensitivity: "internal" });
  index.setFiles([{ relativePath: "a.md", content: UNLABELED, kind: "note" }], []);
  const token = "test-token-abc";
  const getStatus = () => ({
    pid: process.pid,
    port: 0,
    url: "",
    token_path: "",
    notes_dir: "/x",
    default_sensitivity: "internal",
    notes_indexed: index.noteCount,
    state: "serving",
    last_scan_iso: null,
  });
  const server = createAgentServer({ index, token, getStatus });
  server.listen(0, LOOPBACK_HOST);
  await once(server, "listening");
  try {
    await fn(server, token, server.address());
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("server binds 127.0.0.1 only (loopback)", async () => {
  await withServer(async (_server, _token, addr) => {
    assert.equal(addr.address, LOOPBACK_HOST);
  });
});

function req(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request(
      { host: LOOPBACK_HOST, port, path, method: "GET", headers },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      },
    );
    r.on("error", reject);
    r.end();
  });
}

test("server returns 401 without a bearer token", async () => {
  await withServer(async (_server, _token, addr) => {
    const res = await req(addr.port, "/health");
    assert.equal(res.status, 401);
  });
});

test("server returns 200 with the bearer token and projects effective sensitivity", async () => {
  await withServer(async (_server, token, addr) => {
    const res = await req(addr.port, "/notes", { authorization: `Bearer ${token}` });
    assert.equal(res.status, 200);
    const parsed = JSON.parse(res.body);
    const note = parsed.notes.find((n) => n.path === "a.md");
    assert.equal(note.sensitivity, "internal", "unlabeled note takes the configured default");
  });
});
