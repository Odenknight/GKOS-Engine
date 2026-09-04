import assert from "node:assert/strict";
import { access, link, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { scanCorpus } from "../bin/gkx.mjs";

import {
  RetrievalCoordinator,
  buildRetrievalGeneration,
  chunkMarkdown,
  discoverTrustedGkosConfig,
  retrievalCanonicalDigest,
  vaultSourceReader,
} from "../dist/retrieval.mjs";

const windowsTest = process.platform === "win32" ? test : () => {};

const digest = (value) => retrievalCanonicalDigest(value);

function generationInput(state, chunks) {
  return {
    state_directory: state,
    vault_id: "windows-path-fixture",
    source_snapshot_digest: digest(chunks.map((chunk) => [chunk.source_id, chunk.source_path, chunk.source_digest])),
    configuration_digest: digest({ mode: "fts", path_fixture: 1 }),
    policy_digest: digest({ policy: "public-only" }),
    chunks,
  };
}

function fixtureChunks(text) {
  return chunkMarkdown({
    source_id: "018f0000-0000-7000-8000-0000000002f1",
    source_path: "note.md",
    text,
    metadata: { sensitivity: "public", title: "Windows path fixture" },
  });
}

windowsTest("ordinary Windows temp spelling, including 8.3 expansion, is not an alias", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "gkos-windows-path-"));
  try {
    const canonicalRoot = await realpath(root);
    t.diagnostic(`lexical temp root: ${root}`);
    t.diagnostic(`canonical temp root: ${canonicalRoot}`);
    if (process.env.GKOS_REQUIRE_SHORT_PATH_FIXTURE === "1") {
      assert.notEqual(
        root.toLowerCase(),
        canonicalRoot.toLowerCase(),
        "the hosted qualification lane must exercise a real 8.3-to-long-name spelling change",
      );
    }
    const text = "# Note\nExact short-path evidence.\n";
    await writeFile(join(root, "note.md"), text, "utf8");
    await writeFile(join(root, "gkos.toml"), "config_version = 1\n", "utf8");

    const extendedRoot = `\\\\?\\${root}`;
    const driveCaseRoot = `${root[0] === root[0].toLowerCase() ? root[0].toUpperCase() : root[0].toLowerCase()}${root.slice(1)}`;
    for (const spelling of [root, extendedRoot, driveCaseRoot]) {
      assert.equal(Buffer.from(await vaultSourceReader(spelling)("note.md")).toString("utf8"), text);
      const scan = await scanCorpus(spelling);
      assert.deepEqual(scan.files.map(({ relativePath, content }) => ({ relativePath, content })), [{ relativePath: "note.md", content: text }]);
    }
    const config = await discoverTrustedGkosConfig({
      explicit_config: join(extendedRoot, "gkos.toml"),
      cwd: root,
      workspace_root: join(root, "missing-workspace"),
      user_config_path: join(root, "missing-user.toml"),
      vault_root: root,
    });
    assert.ok(config);
    assert.equal(config.path.toLowerCase(), join(canonicalRoot, "gkos.toml").toLowerCase());

    const chunks = fixtureChunks(text);
    const built = buildRetrievalGeneration(generationInput(join(extendedRoot, ".gkx", "derived"), chunks));
    assert.ok(built.database_path.toLowerCase().startsWith(canonicalRoot.toLowerCase()));
    const coordinator = new RetrievalCoordinator(built.database_path, {
      discoverability_policy: () => "allow",
      source_reader: vaultSourceReader(root),
    });
    assert.equal((await coordinator.search({ query: "evidence", limit: 1 })).hits.length, 1);
    coordinator.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

windowsTest("Windows junction components and source hard links remain fail-closed", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "gkos-windows-alias-"));
  const actual = join(root, "actual");
  const alias = join(root, "alias");
  const text = "# Note\nExact junction evidence.\n";
  await mkdir(actual);
  await writeFile(join(actual, "note.md"), text, "utf8");
  await writeFile(join(actual, "gkos.toml"), "config_version = 1\n", "utf8");
  await link(join(actual, "note.md"), join(actual, "hardlink.md"));
  try {
    await symlink(actual, alias, "junction");
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    if (process.env.GKOS_REQUIRE_ALIAS_FIXTURE === "1") {
      throw new Error(`GKOS_WINDOWS_ALIAS_FIXTURE_REQUIRED:${error?.code ?? "unknown"}`, { cause: error });
    }
    t.skip(`junction creation unavailable on this host (${error?.code ?? "unknown"})`);
    return;
  }

  try {
    await assert.rejects(vaultSourceReader(alias)("note.md"), /SOURCE_ROOT_ALIAS_REJECTED/u);
    await assert.rejects(scanCorpus(alias), /GKX_SCAN_ROOT_ALIAS_REJECTED/u);
    await assert.rejects(vaultSourceReader(actual)("hardlink.md"), /SOURCE_HARDLINK_REJECTED/u);
    assert.deepEqual((await scanCorpus(actual)).files, [], "hard-linked source bytes never enter the scanner value surface");
    await assert.rejects(discoverTrustedGkosConfig({
      explicit_config: join(alias, "gkos.toml"),
      cwd: root,
      workspace_root: join(root, "missing-workspace"),
      user_config_path: join(root, "missing-user.toml"),
    }), /GKOS_CONFIG_ALIAS_REJECTED/u);

    const chunks = fixtureChunks(text);
    const forbiddenState = join(alias, "must-not-be-created", "state");
    assert.throws(
      () => buildRetrievalGeneration(generationInput(forbiddenState, chunks)),
      /RETRIEVAL_STATE_ANCESTOR_ALIAS_REJECTED/u,
    );
    await assert.rejects(access(join(actual, "must-not-be-created")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
