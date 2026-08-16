#!/usr/bin/env node
/**
 * gkx — the GKOS-Engine CLI.
 *
 * Builds a Gkx graph, validates and assesses a folder of Markdown notes,
 * and exports Graphiti episodes, using the deterministic GKOS-Engine core
 * (the same GKX 2.3 semantics consumed by downstream products).
 *
 * Canonical (named) subcommands:
 *   gkx validate <dir>
 *   gkx assess   <dir> [--json]
 *   gkx graph    <dir> -o graph.json [--watch]
 *   gkx export graphiti <dir> --episodes episodes.json [--group-id <ns>]
 *
 * Every command embeds a deterministic `build:` block
 * (engine_version, policy_hash, corpus_hash, generated_at).
 *
 * Requires `npm run build` once (dist/gkos-engine.mjs).
 */
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { watch, realpathSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const coreUrl = new URL("../dist/gkos-engine.mjs", import.meta.url);
let core;
try {
  core = await import(coreUrl.href);
} catch (e) {
  console.error("gkx: dist/gkos-engine.mjs not found — run `npm run build` first.");
  process.exit(1);
}

const {
  ENGINE_VERSION,
  GKX23_POLICY,
  buildGraph,
  codeUnitCompare,
  buildGraphitiEpisodesWithContent,
  contentHash,
  isAttachmentPath,
  isNotePath,
  shouldIgnoreVaultPath,
  stripFrontmatter,
  discoverNavigation,
  buildVaultNavigationConfig,
  auditNavigation,
  generateNavigationCandidates,
  diffNavigation,
  compileNavigationContext,
  planReentry,
  planMocNamePromotion,
} = core;

const NAV_POLICY = Object.freeze({ id: "engine.cli.public-only-discoverability", version: "1.0.0" });
const NAV_CONFIG_ID = "018f0000-0000-7000-8000-000000000001";

function frontmatterValue(content, key) {
  const match = new RegExp(`^${key}\\s*:\\s*["']?([^"'\\r\\n#]+)`, "im").exec(content);
  return match?.[1]?.trim();
}

async function navigationInputs(scan, vaultId) {
  const snapshot = {
    vaultId,
    directories: scan.folders,
    sources: scan.files.map((file) => ({
      relativePath: file.relativePath,
      content: file.content,
      stableId: frontmatterValue(file.content, "uid"),
      version: frontmatterValue(file.content, "gkx_version"),
      sensitivity: frontmatterValue(file.content, "sensitivity"),
      title: frontmatterValue(file.content, "title") ?? file.name?.replace(/\.(?:md|markdown)$/i, ""),
    })),
  };
  const config = await buildVaultNavigationConfig({
    configId: NAV_CONFIG_ID,
    version: 1,
    vaultId,
    promotedMocNames: [],
    createdAt: "2026-08-15T00:00:00Z",
    createdBy: "tool:gkx-cli",
    policy: NAV_POLICY,
  });
  return { snapshot, config };
}

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
  files.sort((a, b) => codeUnitCompare(a.relativePath, b.relativePath));
  attachments.sort(codeUnitCompare);
  folders.sort(codeUnitCompare);
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
    engine_version: ENGINE_VERSION,
    policy_hash: GKX23_POLICY.hash,
    corpus_hash: corpusHash(files),
    generated_at: new Date().toISOString(),
  };
}

/** Every file node's GKX 2.3 projection (corpus-aware, sorted by path). */
function projectionsFrom(files, folders) {
  const graph = buildGraph(files, folders);
  const out = [];
  for (const node of graph.nodes) {
    if (node.kind !== "file") continue;
    const projection = node.gkx?.projection;
    if (!projection) continue;
    out.push({ path: node.path, projection });
  }
  out.sort((a, b) => codeUnitCompare(a.path, b.path));
  return { graph, projections: out };
}

const SEVERITIES = ["critical", "error", "warning", "info"];

/* ---------------- gkx validate ---------------- */
export async function runValidate(dir) {
  const { files, folders } = await scanCorpus(resolve(dir));
  const { projections } = projectionsFrom(files, folders);
  const counts = { critical: 0, error: 0, warning: 0, info: 0 };
  const notes = [];
  for (const { path, projection } of projections) {
    const diagnostics = [...projection.diagnostics]
      .map((d) => ({ code: d.code, severity: d.severity, field: d.field ?? null, message: d.message }))
      .sort((a, b) => codeUnitCompare(a.code, b.code) || codeUnitCompare(a.field ?? "", b.field ?? "") || codeUnitCompare(a.message, b.message));
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
  console.log(`gkx validate — engine ${result.build.engine_version}, corpus ${result.build.corpus_hash}`);
  console.log(`  notes scanned: ${summary.notes_scanned} (with GKX projection: ${summary.notes_with_projection})`);
  console.log(`  diagnostics: ${SEVERITIES.map((s) => `${s}=${summary.diagnostics[s]}`).join("  ")}`);
  for (const note of notes) {
    if (!note.diagnostics.length) continue;
    console.log(`  ${note.path}`);
    for (const d of note.diagnostics) {
      console.log(`    [${d.severity}] ${d.code}${d.field ? ` (${d.field})` : ""}: ${d.message}`);
    }
  }
  console.log(result.ok ? "gkx validate: OK" : "gkx validate: FAILED — error/critical diagnostics present");
}

/* ---------------- gkx assess ---------------- */
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
  console.log(`gkx assess — engine ${result.build.engine_version}, corpus ${result.build.corpus_hash}`);
  console.log(`  notes scanned: ${result.summary.notes_scanned} (assessed: ${result.summary.notes_assessed})`);
  for (const n of result.notes) {
    const overall = n.overall == null ? "  n/a" : n.overall.toFixed(4);
    console.log(`  ${overall}  ${n.label.padEnd(34)}  ${n.path}`);
  }
}

/* ---------------- gkx graph / export graphiti ---------------- */
async function buildGraphOnce({ vaultDir, graphOut, episodesOut, groupId }) {
  const t0 = Date.now();
  const { files, attachments, folders } = await scanCorpus(vaultDir);
  const graph = buildGraph(files, folders);
  graph.diagnostics.attachments = attachments.length;
  const out = {
    engine: ENGINE_VERSION,
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
  console.log(`gkx: ${files.length} notes, ${folders.length} folders, ${attachments.length} attachments -> ${graphOut} (${Date.now() - t0} ms)`);
  for (const w of graph.diagnostics.lineageWarnings) console.warn("  lineage:", w);

  if (episodesOut) {
    const contents = new Map(files.map((f) => [f.relativePath, stripFrontmatter(f.content)]));
    const episodes = buildGraphitiEpisodesWithContent(graph, contents, {
      vault: basename(vaultDir),
      vaultIdentity: vaultDir,
      groupId: groupId || undefined,
    });
    await writeFile(episodesOut, JSON.stringify(episodes, null, 2));
    console.log(`gkx: ${episodes.length} Graphiti episodes -> ${episodesOut}`);
  }
}

function watchGraph(config) {
  console.log("gkx: watching for changes (Ctrl+C to stop)…");
  let timer = null;
  const trigger = (event, name) => {
    if (name && shouldIgnoreVaultPath(String(name).replace(/\\/g, "/"))) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      buildGraphOnce(config).catch((e) => console.error("gkx:", e.message));
    }, 400);
  };
  try {
    watch(config.vaultDir, { recursive: true }, trigger);
  } catch {
    console.log("gkx: recursive watch unavailable, polling every 5 s");
    setInterval(() => { buildGraphOnce(config).catch((e) => console.error("gkx:", e.message)); }, 5000);
  }
}

/* ---------------- CLI ---------------- */
const USAGE = `gkx (GKOS-Engine) v${ENGINE_VERSION}
Usage:
  gkx validate <dir>                                  schema/identity/lineage diagnostics; non-zero exit on error
  gkx assess   <dir> [--json]                         per-note documentation-quality scores/labels
  gkx graph    <dir> -o <graph.json> [--watch]        canonical Gkx graph (stable serialization)
  gkx export graphiti <dir> --episodes <out.json> [--group-id <ns>]
  gkx nav scan|audit <dir> [--json]
  gkx nav render <dir> --stdout
  gkx nav diff <before-dir> <after-dir>
  gkx nav context <dir> --recipient <id> --purpose <purpose> --stdout
  gkx nav reentry-plan --predecessor <id> --predecessor-version <v> --predecessor-digest <sha256> --input <file>
                       --new-source-id <id> --new-source-version <v> --acquired-at <ISO-Z> --actor <id>
  gkx nav promotion-plan --proposal-id <uuidv7> --operation-id <uuidv7> --vault-id <id>
                         --name <name> --actor <id> --proposed-at <ISO-Z>

Navigation is source-content read-only. nav write/apply/delete/record are rejected.`;

function parseFlags(args) {
  const flags = new Set();
  const opts = {
    o: null, episodes: null, groupId: null, operationId: null, proposalId: null, vaultId: null,
    predecessorId: null, predecessorVersion: null, predecessorDigest: null, input: null,
    newSourceId: null, newSourceVersion: null, newSourcePath: null, acquiredAt: null,
    actor: null, name: null, proposedAt: null, recipient: null, recipientClass: null,
    purpose: null, itemBudget: "50", tokenBudget: "12000",
  };
  const positional = [];
  const unknownFlags = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--watch") flags.add("watch");
    else if (a === "--json") flags.add("json");
    else if (a === "--stdout") flags.add("stdout");
    else if (a === "--help" || a === "-h") flags.add("help");
    else if (a === "-o" || a === "--out") opts.o = args[++i];
    else if (a === "--episodes") opts.episodes = args[++i];
    else if (a === "--group-id") opts.groupId = args[++i];
    else if (a === "--operation-id") opts.operationId = args[++i];
    else if (a === "--proposal-id") opts.proposalId = args[++i];
    else if (a === "--vault-id") opts.vaultId = args[++i];
    else if (a === "--predecessor" || a === "--predecessor-id") opts.predecessorId = args[++i];
    else if (a === "--predecessor-version") opts.predecessorVersion = args[++i];
    else if (a === "--predecessor-digest") opts.predecessorDigest = args[++i];
    else if (a === "--input") opts.input = args[++i];
    else if (a === "--new-source-id") opts.newSourceId = args[++i];
    else if (a === "--new-source-version") opts.newSourceVersion = args[++i];
    else if (a === "--new-source-path") opts.newSourcePath = args[++i];
    else if (a === "--acquired-at") opts.acquiredAt = args[++i];
    else if (a === "--actor") opts.actor = args[++i];
    else if (a === "--name") opts.name = args[++i];
    else if (a === "--proposed-at") opts.proposedAt = args[++i];
    else if (a === "--recipient") opts.recipient = args[++i];
    else if (a === "--recipient-class") opts.recipientClass = args[++i];
    else if (a === "--purpose") opts.purpose = args[++i];
    else if (a === "--item-budget") opts.itemBudget = args[++i];
    else if (a === "--token-budget") opts.tokenBudget = args[++i];
    else if (a.startsWith("-")) unknownFlags.push(a);
    else positional.push(a);
  }
  return { flags, opts, positional, unknownFlags };
}

export async function main(argv = process.argv.slice(2)) {
  const subcommands = new Set(["validate", "assess", "graph", "export", "nav"]);
  const first = argv[0];

  if (!first || first === "--help" || first === "-h") {
    console.log(USAGE);
    return first ? 0 : 1;
  }

  if (subcommands.has(first)) {
    const { flags, opts, positional, unknownFlags } = parseFlags(argv.slice(1));
    if (unknownFlags.length) { console.error(`gkx: unsupported flag(s): ${unknownFlags.join(", ")}`); return 2; }
    if (flags.has("help")) { console.log(USAGE); return 0; }

    if (first === "validate") {
      if (!positional[0]) { console.error("gkx validate: <dir> required"); return 1; }
      const result = await runValidate(positional[0]);
      printValidate(result);
      return result.ok ? 0 : 1;
    }
    if (first === "nav") {
      const action = positional.shift();
      if (["write", "apply", "delete", "record", "archive-delete", "rollback", "moc-apply"].includes(action)) {
        console.error(`gkx nav ${action}: rejected; Navigation 2.1 is source-content read-only`);
        return 2;
      }
      if (opts.o || opts.episodes || flags.has("watch")) {
        console.error("gkx nav: output/write/watch flags are unavailable; Navigation 2.1 commands emit plans or stdout only");
        return 2;
      }
      if (action === "reentry-plan") {
        try {
          if (!opts.input) throw new Error("--input is required");
          const bytes = await readFile(resolve(opts.input), "utf8");
          const plan = await planReentry(
            { stableId: opts.predecessorId, version: opts.predecessorVersion, digest: opts.predecessorDigest },
            {
              bytes,
              sourceId: opts.newSourceId,
              sourceVersion: opts.newSourceVersion,
              path: opts.newSourcePath ?? opts.input,
              acquiredAt: opts.acquiredAt,
              acquiredBy: { id: opts.actor, class: "human" },
              acquisitionMethod: "gkx-cli-file-read",
            },
            { id: "engine.reentry-plan", version: "1.0.0" },
          );
          console.log(JSON.stringify(plan, null, 2));
          if (plan.status === "rejected") return 2;
          return 0;
        } catch (error) { console.error(`gkx nav reentry-plan: ${error.message}`); return 1; }
      }
      if (action === "promotion-plan") {
        try {
          console.log(JSON.stringify(planMocNamePromotion({
            proposalId: opts.proposalId,
            operationId: opts.operationId,
            vaultId: opts.vaultId,
            observedName: opts.name,
            observedPaths: [],
            proposedBy: { id: opts.actor, class: "human" },
            proposedAt: opts.proposedAt,
          }), null, 2));
          return 0;
        } catch (error) { console.error(`gkx nav promotion-plan: ${error.message}`); return 1; }
      }
      const dir = positional[0];
      if (!dir) { console.error(`gkx nav ${action ?? ""}: <dir> required`); return 1; }
      if (action === "diff") {
        if (!positional[1]) { console.error("gkx nav diff: <before-dir> <after-dir> required"); return 1; }
        const [before, after] = await Promise.all([scanCorpus(resolve(dir)), scanCorpus(resolve(positional[1]))]);
        const beforeInputs = await navigationInputs(before, basename(resolve(dir)));
        const afterInputs = await navigationInputs(after, basename(resolve(positional[1])));
        process.stdout.write((await diffNavigation(beforeInputs.snapshot, afterInputs.snapshot)).text);
        return 0;
      }
      const snapshot = await scanCorpus(resolve(dir));
      const inputs = await navigationInputs(snapshot, basename(resolve(dir)));
      const discovery = discoverNavigation(inputs.snapshot, inputs.config);
      if (action === "scan") console.log(JSON.stringify(discovery, null, 2));
      else if (action === "audit") console.log(JSON.stringify(await auditNavigation(inputs.snapshot, inputs.config), null, 2));
      else if (action === "render") {
        if (!flags.has("stdout")) { console.error("gkx nav render: --stdout is required; file output is unavailable in 2.1"); return 2; }
        const result = await generateNavigationCandidates(inputs.snapshot, inputs.config);
        console.log(JSON.stringify(result, null, 2));
      } else if (action === "context") {
        if (!flags.has("stdout")) { console.error("gkx nav context: --stdout is required; file output is unavailable in 2.1"); return 2; }
        if (!opts.recipient || !opts.purpose) { console.error("gkx nav context: --recipient and --purpose are required"); return 2; }
        const recipientClass = opts.recipientClass ?? "human";
        if (!["human", "agent", "system", "service"].includes(recipientClass)) { console.error("gkx nav context: invalid --recipient-class"); return 2; }
        const publicOnlyPolicy = {
          ...NAV_POLICY,
          canDiscover: ({ object }) => object.sensitivity === "public" ? "allow" : "deny",
        };
        const pack = await compileNavigationContext(inputs.snapshot, {
          recipient: { id: opts.recipient, class: recipientClass },
          purpose: opts.purpose,
          itemBudget: Number(opts.itemBudget),
          tokenBudget: Number(opts.tokenBudget),
          generationPolicy: NAV_POLICY,
        }, publicOnlyPolicy);
        console.log(pack.canonicalBytes);
      } else { console.error(`gkx nav: unknown read-only command '${action ?? ""}'`); return 1; }
      return 0;
    }
    if (first === "assess") {
      if (!positional[0]) { console.error("gkx assess: <dir> required"); return 1; }
      const result = await runAssess(positional[0]);
      printAssess(result, flags.has("json"));
      return 0;
    }
    if (first === "graph") {
      if (!positional[0]) { console.error("gkx graph: <dir> required"); return 1; }
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
      if (kind !== "graphiti") { console.error(`gkx export: unknown target '${kind ?? ""}' (supported: graphiti)`); return 1; }
      if (!positional[1]) { console.error("gkx export graphiti: <dir> required"); return 1; }
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

  console.error(`gkx: unknown command '${first}'`);
  console.error(USAGE);
  return 1;
}

/* Run only when invoked directly (kept importable for tests).
 * Compare the *realpath* of process.argv[1] against this module's own realpath.
 * Node resolves import.meta.url to the module's REAL path while argv[1] keeps
 * the AS-INVOKED path, so under `npm link`, global bin shims, or pnpm/npm
 * workspace symlinks (symlinked package dirs) the raw-string comparison fails,
 * main() never runs, and the CLI exits 0 with zero output. Realpath resolution
 * canonicalizes both sides. If realpath throws (e.g. argv[1] gone from disk),
 * fall back to the raw URL comparison rather than crashing. This module must
 * stay side-effect-free on import for test harnesses, so the guard must only
 * fire on genuine direct invocation. */
function isInvokedDirectly() {
  const invokedPath = process.argv[1];
  if (!invokedPath) return false;
  try {
    return realpathSync(invokedPath) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return pathToFileURL(invokedPath).href === import.meta.url;
  }
}

const invokedDirectly = isInvokedDirectly();
if (invokedDirectly) {
  const code = await main();
  if (typeof code === "number" && code !== 0) process.exit(code);
}
