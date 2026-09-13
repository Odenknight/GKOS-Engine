import { buildAuthorizedView, GkosServiceDeniedError } from "./authorized-view";
import type { BuildAuthorizedViewInput } from "./authorized-view";
import { buildManagedGraphitiManifest } from "../graphiti-manifest";
import { attachGraphitiContent, stripFrontmatter } from "../graphiti";
import { sha256Bytes } from "../canonical";
import { GRAPHITI_QUERY_CONTRACT_VERSION, type GraphitiQueryContext } from "../graphiti-query-contract";

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

/** Reconcile a host-read published ledger receipt with freshly authorized source
 * bytes. Authority and publication must come from host configuration/ledger,
 * never from wire fields. Recheck host generations after this async function.
 * Ledger publication is a prerequisite; this does not publish or probe a model. */
export async function buildServiceGraphitiQueryContext(
  input: Omit<BuildAuthorizedViewInput, "operation" | "sensitivityCeiling">,
  sourceBytes: ReadonlyMap<string, Uint8Array>,
  authority: { corpus_id: string; scope_digest: string; configuration_digest: string },
  publication: unknown,
): Promise<GraphitiQueryContext | null> {
  try {
    const digest = (value: unknown): value is string => typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
    const id = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
    const record = (value: any, keys: string[]): boolean => value !== null && typeof value === "object" &&
      !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
    const expected = { corpus_id: authority.corpus_id, scope_digest: authority.scope_digest,
      configuration_digest: authority.configuration_digest, policy_digest: input.authorization.policyDigest };
    if (!id(expected.corpus_id) || !digest(expected.scope_digest) || !digest(expected.configuration_digest) || !digest(expected.policy_digest)) return null;
    // Detach the small bounded receipt before the first await.
    const value = publication as any;
    if (!record(value, ["binding", "mappings", "observation", "sequence"]) ||
      !record(value.binding, ["corpus_id", "scope_digest", "configuration_digest", "policy_digest", "source_snapshot_digest", "projection_id"]) ||
      !digest(value.binding.source_snapshot_digest) || typeof value.binding.projection_id !== "string" || !/^gkos_[0-9a-f]{32}$/.test(value.binding.projection_id) ||
      !digest(value.observation) || !Number.isSafeInteger(value.sequence) || value.sequence < 1 ||
      !Array.isArray(value.mappings) || value.mappings.length < 1 || value.mappings.length > 50000) return null;
    if (Object.entries(expected).some(([key, valueExpected]) => value.binding[key] !== valueExpected)) return null;
    const binding = { ...value.binding };
    const mappings = [];
    const seen = new Set<string>();
    for (const item of value.mappings) {
      if (!record(item, ["projection_episode_id", "source_id", "source_digest"]) ||
        !id(item.projection_episode_id) || !id(item.source_id) || !digest(item.source_digest) || seen.has(item.projection_episode_id)) return null;
      seen.add(item.projection_episode_id);
      mappings.push({ projection_episode_id: item.projection_episode_id, source_digest: item.source_digest, source_id: item.source_id });
    }
    const observation = value.observation;
    const manifest = await buildServiceGraphitiManifest(input, sourceBytes);
    if (manifest.source_snapshot_digest !== binding.source_snapshot_digest || mappings.length !== manifest.manifest.length ||
      mappings.some((item, index) => item.source_id !== manifest.manifest[index].source_id || item.source_digest !== manifest.manifest[index].source_digest)) return null;
    // All values here are validated ASCII; ordered keys reproduce ledger.canonical.
    const receipt = { binding: { configuration_digest: binding.configuration_digest, corpus_id: binding.corpus_id,
      policy_digest: binding.policy_digest, scope_digest: binding.scope_digest, source_snapshot_digest: binding.source_snapshot_digest },
      mappings, milestone: "persistence-verified", projection_id: binding.projection_id, searchability: "unverified" };
    if (await sha256Bytes(JSON.stringify(receipt)) !== observation) return null;
    return { status: { contract_version: GRAPHITI_QUERY_CONTRACT_VERSION, mode: "managed", searchable: true, binding },
      decision: "allow", complete_dependency_scope: true,
      authorized_episodes: new Map(mappings.map(item => [item.projection_episode_id, { source_id: item.source_id, source_digest: item.source_digest }])) };
  } catch { return null; }
}
