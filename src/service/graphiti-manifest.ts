import { buildAuthorizedView, GkosServiceDeniedError } from "./authorized-view";
import type { BuildAuthorizedViewInput } from "./authorized-view";
import { buildManagedGraphitiManifest } from "../graphiti-manifest";
import { attachGraphitiContent, stripFrontmatter } from "../graphiti";

/** Private ingestion boundary. Bytes must be read by the host for this exact
 * snapshot. The host must recheck source/credential authority after awaiting
 * this function and before ingestion or publication; this is not a query grant. */
export async function buildServiceGraphitiManifest(
  input: Omit<BuildAuthorizedViewInput, "operation" | "sensitivityCeiling">,
  sourceBytes: ReadonlyMap<string, Uint8Array>,
) {
  const deny = (): never => { throw new GkosServiceDeniedError(); };
  if (!input.identity || !input.corpus.sourceRecords) deny();
  const view = buildAuthorizedView({ ...input, operation: "graphiti_episodes",
    sensitivityCeiling: input.identity!.sensitivityCeiling });
  const records = new Map<string, string>();
  const visible = new Set(view.notes.map(note => note.path));
  for (const record of input.corpus.sourceRecords!) {
    if (!visible.has(record.relativePath)) continue;
    if (records.has(record.relativePath) || typeof record.content !== "string") deny();
    records.set(record.relativePath, record.content!);
  }
  const notes = new Map(view.notes.map(note => [note.path, note]));
  if (view.notes.length > 50000) deny();
  const uidCounts = new Map<string, number>();
  for (const node of input.corpus.graph?.nodes ?? []) {
    if (node.kind === "file" && node.gkx?.uid) uidCounts.set(node.gkx.uid, (uidCounts.get(node.gkx.uid) ?? 0) + 1);
  }
  const bytes = new Map<string, Uint8Array>();
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  let totalBytes = 0;
  for (const note of view.notes) {
    // A UID shared with even a hidden note cannot identify a unique source.
    if (!note.uid || uidCounts.get(note.uid) !== 1) deny();
    const raw = sourceBytes.get(note.path);
    if (!(raw instanceof Uint8Array) || !records.has(note.path)) deny();
    totalBytes += raw!.byteLength;
    if (totalBytes > 64 * 1024 * 1024) deny();
    const captured = new Uint8Array(raw!);
    try { if (decoder.decode(captured) !== records.get(note.path)) deny(); }
    catch { deny(); }
    bytes.set(note.path, captured);
  }
  const contents = new Map([...records].map(([path, content]) => [path, stripFrontmatter(content)]));
  const inputs = attachGraphitiContent(view.graphiti_episodes, contents).map(episode => {
    let path: unknown;
    try {
      const body = JSON.parse(episode.episode_body);
      path = episode.source === "fact_triple" ? body.source_path : body.path;
    } catch { deny(); }
    const note = typeof path === "string" ? notes.get(path) : undefined;
    if (!note?.uid || !bytes.has(note.path)) deny();
    return { source_id: note!.uid!, raw: bytes.get(note!.path)!, episode: {
      name: episode.name, episode_body: episode.episode_body,
      source_description: episode.source_description, reference_time: episode.reference_time,
    } };
  });
  // Preserve Engine ordering and the worker's exact four-string envelope.
  const result = await buildManagedGraphitiManifest(inputs);
  return { ...result, episodes: inputs.map(input => input.episode) };
}
