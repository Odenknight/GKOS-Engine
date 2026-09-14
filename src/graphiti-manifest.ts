import { sha256Bytes } from "./canonical";
import type {GraphitiQueryBinding} from "./graphiti-query-contract";

export interface ManagedGraphitiEpisode {
  name: string;
  episode_body: string;
  source_description: string;
  reference_time: string;
}

/** The ledger hashes these exact string envelopes, not normalized Engine JSON. */
export function managedEpisodeJson(episode: ManagedGraphitiEpisode): string {
  const keys = ["episode_body", "name", "reference_time", "source_description"] as const;
  if (!episode || Object.keys(episode).length !== keys.length || keys.some(key =>
    !Object.hasOwn(episode, key) || typeof episode[key] !== "string" || /[\ud800-\udfff]/u.test(episode[key]))) {
    throw new TypeError("GKOS_GRAPHITI_EPISODE_ENVELOPE_INVALID");
  }
  // Python json.dumps(ensure_ascii=True) escapes individual UTF-16 units,
  // including both halves of an astral character. Preserve CR/LF source text.
  return JSON.stringify(Object.fromEntries(keys.map(key => [key, episode[key]])))
    .replace(/[\u007f-\uffff]/g, unit => `\\u${unit.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/** Host-only manifest construction. Raw bytes must come from authorized source
 * reads; callers must recheck authority after this asynchronous hash operation.
 * This establishes digest identity, never publication or a query grant. */
export async function buildManagedGraphitiManifest(inputs: readonly {
  source_id: string; raw: Uint8Array; episode: ManagedGraphitiEpisode;
}[]): Promise<{ manifest: {source_id: string; source_digest: string; episode_digest: string}[]; source_snapshot_digest: string }> {
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 50000) throw new TypeError("GKOS_GRAPHITI_MANIFEST_INVALID");
  let bytes = 0;
  // Capture all inputs before the first await, so concurrent caller mutation
  // cannot combine one source generation with another episode generation.
  const captured = inputs.map(input => {
    if (!input || typeof input.source_id !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(input.source_id) ||
      !(input.raw instanceof Uint8Array)) throw new TypeError("GKOS_GRAPHITI_MANIFEST_INVALID");
    const episode = managedEpisodeJson(input.episode);
    bytes += input.raw.byteLength + episode.length;
    if (bytes > 64 * 1024 * 1024) throw new TypeError("GKOS_GRAPHITI_MANIFEST_TOO_LARGE");
    return {id: input.source_id, raw: new Uint8Array(input.raw), episode};
  });
  const manifest = [];
  const sources = new Map<string, string>();
  const seen = new Set<string>();
  for (const input of captured) {
    const episode_digest = await sha256Bytes(input.episode);
    const source_digest = await sha256Bytes(input.raw);
    const key = `${input.id}\u0000${episode_digest}`;
    if (seen.has(key) || sources.has(input.id) && sources.get(input.id) !== source_digest) throw new TypeError("GKOS_GRAPHITI_MANIFEST_INVALID");
    seen.add(key);
    sources.set(input.id, source_digest);
    // Key insertion order matches Python sort_keys for the fixed ASCII schema.
    manifest.push({episode_digest, source_digest, source_id: input.id});
  }
  return {manifest, source_snapshot_digest: await sha256Bytes(JSON.stringify(manifest))};
}

/** Match a host-read publication to a freshly authorized manifest. This checks
 * identity and ledger evidence only; the caller must retain and recheck its
 * own authority. Provider status and untrusted wire data are not grants.
 * The bounded publication is detached before calling the async host preparer. */
export async function reconcileManagedGraphitiPublication(
  prepareManifest: () => Promise<Awaited<ReturnType<typeof buildManagedGraphitiManifest>>>,
  authority: {corpus_id:string; scope_digest:string; configuration_digest:string; policy_digest:string},
  publication: unknown,
): Promise<{binding:GraphitiQueryBinding; episodes:Map<string,{source_id:string; source_digest:string}>} | null> {
  try {
    const digest = (value: unknown): value is string => typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
    const id = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
    const record = (value: any, keys: string[]): boolean => value !== null && typeof value === "object" &&
      !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
    const expected = { corpus_id: authority.corpus_id, scope_digest: authority.scope_digest,
      configuration_digest: authority.configuration_digest, policy_digest: authority.policy_digest };
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
    const manifest = await prepareManifest();
    if (manifest.source_snapshot_digest !== binding.source_snapshot_digest || mappings.length !== manifest.manifest.length ||
      mappings.some((item, index) => item.source_id !== manifest.manifest[index].source_id || item.source_digest !== manifest.manifest[index].source_digest)) return null;
    // All values here are validated ASCII; ordered keys reproduce ledger.canonical.
    const receipt = { binding: { configuration_digest: binding.configuration_digest, corpus_id: binding.corpus_id,
      policy_digest: binding.policy_digest, scope_digest: binding.scope_digest, source_snapshot_digest: binding.source_snapshot_digest },
      mappings, milestone: "persistence-verified", projection_id: binding.projection_id, searchability: "unverified" };
    if (await sha256Bytes(JSON.stringify(receipt)) !== observation) return null;
    return {binding: binding as GraphitiQueryBinding,
      episodes: new Map(mappings.map(item => [item.projection_episode_id, { source_id: item.source_id, source_digest: item.source_digest }]))};
  } catch { return null; }
}
