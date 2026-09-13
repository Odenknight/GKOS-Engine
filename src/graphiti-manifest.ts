import { sha256Bytes } from "./canonical";

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
  const seen = new Set<string>();
  let bytes = 0;
  // Capture all inputs before the first await, so concurrent caller mutation
  // cannot combine one source generation with another episode generation.
  const captured = inputs.map(input => {
    if (!input || typeof input.source_id !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(input.source_id) ||
      seen.has(input.source_id) || !(input.raw instanceof Uint8Array)) throw new TypeError("GKOS_GRAPHITI_MANIFEST_INVALID");
    seen.add(input.source_id);
    const episode = managedEpisodeJson(input.episode);
    bytes += input.raw.byteLength + episode.length;
    if (bytes > 64 * 1024 * 1024) throw new TypeError("GKOS_GRAPHITI_MANIFEST_TOO_LARGE");
    return {id: input.source_id, raw: new Uint8Array(input.raw), episode};
  });
  const manifest = [];
  for (const input of captured) {
    // Key insertion order matches Python sort_keys for the fixed ASCII schema.
    manifest.push({episode_digest: await sha256Bytes(input.episode), source_digest: await sha256Bytes(input.raw), source_id: input.id});
  }
  return {manifest, source_snapshot_digest: await sha256Bytes(JSON.stringify(manifest))};
}
