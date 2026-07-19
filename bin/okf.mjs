#!/usr/bin/env node
/**
 * okf — the GKOS Engine CLI.
 *
 * Builds a Kosmos graph, validates and assesses a folder of Markdown notes,
 * and exports Graphiti episodes, using the deterministic GKOS Engine core
 * (the same OKF+ 2.3 semantics the Kosmos-Oden Obsidian plugin consumes).
 *
 * Canonical (named) subcommands:
 *   okf validate <dir>
 *   okf assess   <dir> [--json]
 *   okf graph    <dir> -o graph.json [--watch]
 *   okf export graphiti <dir> --episodes episodes.json [--group-id <ns>]
 *
 * Deprecated positional alias (kept working unchanged for backward compat):
 *   okf <vault-dir> [graph.json] [--episodes episodes.json]
 *       [--group-id <ns>] [--watch]
 *
 * Every command embeds a deterministic `build:` block
 * (engine_version, policy_hash, corpus_hash, generated_at).
 *
 * Requires `npm run build` once (dist/kosmos-core.mjs).
 */
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { watch } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const coreUrl = new URL("../dist/kosmos-core.mjs", import.meta.url);
let core;
try {
  core = await import(coreUrl.href);
} catch (e) {
  console.error("okf: dist/kosmos-core.mjs not found — run `npm run build` first.");
  process.exit(1);
}

const {
  KOSMOS_VERSION,
  OKF23_POLICY,
  buildGraph,
  buildGraphitiEpisodesWithContent,
  contentHash,
  isAttachmentPath,
  isNotePath,
  shouldIgnoreVaultPath,
  stripFrontmatter,
} = core;

/* ---------------- read-only corpus scan (same ignore rules as every surface) ---------------- */
export async function scanCorpus(dir) {
  const files = [];
  const attachments = [];
  const folders = [];
  async function walk(abs, rel) {
    const entries = await readdir(abs, { withFileTypes: true });
    for (const e of entries) {
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (shouldIgnoreVaultPath(childRel)) continue;
      const childAbs = join(abs, e.name);
      if (e.isDirectory()) {
        folders.push(childRel);
        await walk(childAbs, childRel);
      } else if (e.isFile()) {
        if (isNotePath(childRel)) {
          const [content, st] = await Promise.all([readFile(childAbs, "utf8"), stat(childAbs)]);
          files.push({
            relativePath: childRel,
            name: e.name,
            size: st.size,
            modifiedTime: st.mtimeMs,
            createdTime: st.birthtimeMs || st.mtimeMs,
            content,
            kind: "note",
          });
        } else if (isAttachmentPath(childRel)) {
          attachments.push(childRel);
        }
      }
    }
  }
  await walk(dir, "");
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  attachments.sort((a, b) => a.localeCompare(b));
  folders.sort((a, b) => a.localeCompare(b));
  return { files, attachments, folders };
}

/* ---------------- deterministic build block ---------------- */
/** Stable corpus hash over the sorted list of (path, content_hash) pairs. */
export function corpusHash(files) {
  const canonical = [...files]
    .map((f) => `${f.relativePath} ${contentHash(f.content)}`)
    .sort()
    .join("\n");
  return contentHash(canonical);
}

export function buildBlock(files) {
  return {
    engine_version: KOSMOS_VERSION,
    policy_hash: OKF23_POLICY.hash,
    corpus_hash: corpusHash(files),
    generated_at: new Date().toISOString(),
  };
}

/** Every file node's OKF+ 2.3 projection (corpus-aware, sorted by path). */
function projectionsFrom(files, folders) {
  const graph = buildGraph(files, folders);
  const out = [];
  for (const node of graph.nodes) {
    if (node.kind !== "file") continue;
    const projection = node.okf?.projection;
    if (!projection) continue;
    out.push({ path: node.path, projection });
  }
  out.sort((a, b) => a.path.localeCompare(b.path));
  return { graph, projections: out };
}

const SEVERITIES = ["critical", "error", "warning", "info"];

/* ---------------- okf validate ---------------- */
export async function runValidate(dir) {
  const { files, folders } = await scanCorpus(resolve(dir));
  const { projections } = projectionsFrom(files, folders);
  const counts = { critical: 0, error: 0, warning: 0, info: 0 };
  const notes = [];
  for (const { path, projection } of projections) {
    const diagnostics = [...projection.diagnostics]
      .map((d) => ({ code: d.code, severity: d.severity, field: d.field ?? null, message: d.message }))
      .sort((a, b) => a.code.localeCompare(b.code) || (a.field ?? "").localeCompare(b.field ?? "") || a.message.localeCompare(b.message));
    for (const d of diagnostics) if (counts[d.severity] != null) counts[d.severity]++;
    notes.push({ path, diagnostics });
  }
  const hasErrors = counts.critical > 0 || counts.error > 0;
  return {
    build: buildBlock(files),
    summary: { notes_scanned: files.length, notes_with_projection: projections.length, diagnostics: counts },
    notes,
    ok: !hasErrors,
  };
}

function printValidate(result) {
  const { summary, notes } = result;
  console.log(`okf validate — engine ${result.build.engine_version}, corpus ${result.build.corpus_hash}`);
  console.log(`  notes scanned: ${summary.notes_scanned} (with OKF+ projection: ${summary.notes_with_projection})`);
  console.log(`  diagnostics: ${SEVERITIES.map((s) => `${s}=${summary.diagnostics[s]}`).join("  ")}`);
  for (const note of notes) {
    if (!note.diagnostics.length) continue;
    console.log(`  ${note.path}`);
    for (const d of note.diagnostics) {
      console.log(`    [${d.severity}] ${d.code}${d.field ? ` (${d.field})` : ""}: ${d.message}`);
    }
  }
  console.log(result.ok ? "okf validate: OK" : "okf validate: FAILED — error/critical diagnostics present");
}

/* ---------------- okf assess ---------------- */
export async function runAssess(dir) {
  const { files, folders } = await scanCorpus(resolve(dir));
  const { projections } = projectionsFrom(files, folders);
  const notes = projections.map(({ path, projection }) => {
    const a = projection.assessment;
    return {
      path,
      target_uid: a.targetUid ?? null,
      overall: a.scores.overall,
      label: a.labels.derived[0] ?? "assessment:not-assessable",
      scores: { ...a.scores },
    };
  });
  return {
    build: buildBlock(files),
    summary: { notes_scanned: files.length, notes_assessed: projections.length },
    notes,
  };
}

function printAssess(result, asJson) {
  if (asJson) {
    // Stable-key-ordered JSON array of per-note assessments.
    console.log(JSON.stringify(result.notes, null, 2));
    return;
  }
  console.log(`okf assess — engine ${result.build.engine_version}, corpus ${result.build.corpus_hash}`);
  console.log(`  notes scanned: ${result.summary.notes_scanned} (assessed: ${result.summary.notes_assessed})`);
  for (const n of result.notes) {
    const overall = n.overall == null ? "  n/a" : n.overall.toFixed(4);
    console.log(`  ${overall}  ${n.label.padEnd(34)}  ${n.path}`);
  }
}

/* ---------------- okf graph / export graphiti (legacy build path) ---------------- */
async function buildGraphOnce({ vaultDir, graphOut, episodesOut, groupId }) {
  const t0 = Date.now();
  const { files, attachments, folders } = await scanCorpus(vaultDir);
  const graph = buildGraph(files, folders);
  graph.diagnostics.attachments = attachments.length;
  const out = {
    kosmos: KOSMOS_VERSION,
    vault: basename(vaultDir),
    build: buildBlock(files),
    nodes: graph.nodes,
    links: graph.links,
    stats: graph.stats,
    areas: graph.areas,
    tags: graph.tags,
    statuses: graph.statuses,
    types: graph.types,
    diagnostics: graph.diagnostics,
    attachments,
  };
  await writeFile(graphOut, JSON.stringify(out, null, 2));
  console.log(`okf: ${files.length} notes, ${folders.length} folders, ${attachments.length} attachments -> ${graphOut} (${Date.now() - t0} ms)`);
  for (const w of graph.diagnostics.lineageWarnings) console.warn("  lineage:", w);

  if (episodesOut) {
    const contents = new Map(files.map((f) => [f.relativePath, stripFrontmatter(f.content)]));
    const episodes = buildGraphitiEpisodesWithContent(graph, contents, {
      vault: basename(vaultDir),
      vaultIdentity: vaultDir,
      groupId: groupId || undefined,
    });
    await writeFile(episodesOut, JSON.stringify(episodes, null, 2));
    console.log(`okf: ${episodes.length} Graphiti episodes -> ${episodesOut}`);
  }
}

function watchGraph(config) {
  console.log("okf: watching for changes (Ctrl+C to stop)…");
  let timer = null;
  const trigger = (event, name) => {
    if (name && shouldIgnoreVaultPath(String(name).replace(/\\/g, "/"))) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      buildGraphOnce(config).catch((e) => console.error("okf:", e.message));
    }, 400);
  };
  try {
    watch(config.vaultDir, { recursive: true }, trigger);
  } catch {
    console.log("okf: recursive watch unavailable, polling every 5 s");
    setInterval(() => { buildGraphOnce(config).catch((e) => console.error("okf:", e.message)); }, 5000);
  }
}

/* ---------------- CLI ---------------- */
const USAGE = `okf (GKOS Engine) v${KOSMOS_VERSION}
Usage:
  okf validate <dir>                                  schema/identity/lineage diagnostics; non-zero exit on error
  okf assess   <dir> [--json]                         per-note documentation-quality scores/labels
  okf graph    <dir> -o <graph.json> [--watch]        canonical Kosmos graph (stable serialization)
  okf export graphiti <dir> --episodes <out.json> [--group-id <ns>]

Deprecated positional alias (still supported):
  okf <vault-dir> [graph.json] [--episodes <out.json>] [--group-id <ns>] [--watch]`;

function parseFlags(args) {
  const flags = new Set();
  const opts = { o: null, episodes: null, groupId: null };
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--watch") flags.add("watch");
    else if (a === "--json") flags.add("json");
    else if (a === "--help" || a === "-h") flags.add("help");
    else if (a === "-o" || a === "--out") opts.o = args[++i];
    else if (a === "--episodes") opts.episodes = args[++i];
    else if (a === "--group-id") opts.groupId = args[++i];
    else positional.push(a);
  }
  return { flags, opts, positional };
}

export async function main(argv = process.argv.slice(2)) {
  const subcommands = new Set(["validate", "assess", "graph", "export"]);
  const first = argv[0];

  if (!first || first === "--help" || first === "-h") {
    console.log(USAGE);
    return first ? 0 : 1;
  }

  if (subcommands.has(first)) {
    const { flags, opts, positional } = parseFlags(argv.slice(1));
    if (flags.has("help")) { console.log(USAGE); return 0; }

    if (first === "validate") {
      if (!positional[0]) { console.error("okf validate: <dir> required"); return 1; }
      const result = await runValidate(positional[0]);
      printValidate(result);
      return result.ok ? 0 : 1;
    }
    if (first === "assess") {
      if (!positional[0]) { console.error("okf assess: <dir> required"); return 1; }
      const result = await runAssess(positional[0]);
      printAssess(result, flags.has("json"));
      return 0;
    }
    if (first === "graph") {
      if (!positional[0]) { console.error("okf graph: <dir> required"); return 1; }
      const config = {
        vaultDir: resolve(positional[0]),
        graphOut: resolve(opts.o || positional[1] || "graph.json"),
        episodesOut: opts.episodes ? resolve(opts.episodes) : null,
        groupId: opts.groupId,
      };
      await buildGraphOnce(config);
      if (flags.has("watch")) watchGraph(config);
      return 0;
    }
    if (first === "export") {
      const kind = positional[0];
      if (kind !== "graphiti") { console.error(`okf export: unknown target '${kind ?? ""}' (supported: graphiti)`); return 1; }
      if (!positional[1]) { console.error("okf export graphiti: <dir> required"); return 1; }
      const episodesOut = opts.episodes ? resolve(opts.episodes) : resolve("graphiti-episodes.json");
      const config = {
        vaultDir: resolve(positional[1]),
        graphOut: resolve(opts.o || "graph.json"),
        episodesOut,
        groupId: opts.groupId,
      };
      await buildGraphOnce(config);
      return 0;
    }
    return 1;
  }

  /* ---- deprecated positional alias: <vault> [graph.json] [--episodes …] ---- */
  const { flags, opts, positional } = parseFlags(argv);
  if (flags.has("help") || positional.length < 1) {
    console.log(USAGE);
    return flags.has("help") ? 0 : 1;
  }
  const config = {
    vaultDir: resolve(positional[0]),
    graphOut: resolve(positional[1] || "graph.json"),
    episodesOut: opts.episodes ? resolve(opts.episodes) : null,
    groupId: opts.groupId,
  };
  await buildGraphOnce(config);
  if (flags.has("watch")) watchGraph(config);
  return 0;
}

/* Run only when invoked directly (kept importable for tests). */
const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  const code = await main();
  if (typeof code === "number" && code !== 0) process.exit(code);
}
