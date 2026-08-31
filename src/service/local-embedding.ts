import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createVectorProvider } from "../retrieval/providers";
import { retrievalCanonicalDigest } from "../retrieval/digest";
import type { GkxSensitivity } from "../types";
import type { VectorProvider } from "../retrieval/types";

const trustedProviders = new WeakSet<object>();
export function isTrustedLocalEmbeddingProvider(provider: unknown): provider is VectorProvider {
  return typeof provider === "object" && provider !== null && trustedProviders.has(provider);
}
const sensitivities = ["public", "internal", "restricted", "confidential", "regulated", "phi", "secret"];
/** Operator-only deployment configuration; never derived from notes or MCP. */
function trustedPath(path: string, directory = false): string {
  if (!isAbsolute(path) || realpathSync(path) !== resolve(path)) throw new Error("LOCAL_EMBEDDING_PATH_UNTRUSTED");
  const leaf = lstatSync(path);
  if (directory ? !leaf.isDirectory() : !leaf.isFile()) throw new Error("LOCAL_EMBEDDING_PATH_UNTRUSTED");
  for (let current = path;; current = dirname(current)) {
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || (process.platform !== "win32" && (stat.uid !== 0 || (stat.mode & 0o022) !== 0))) throw new Error("LOCAL_EMBEDDING_PATH_UNTRUSTED");
    if (dirname(current) === current) break;
  }
  return path;
}

export async function loadLocalEmbeddingProvider(configPath: string | undefined): Promise<{ provider: VectorProvider; indexingCeiling: GkxSensitivity; coordinate: Record<string, unknown> } | null> {
  if (!configPath) return null;
  if (process.platform !== "linux") throw new Error("LOCAL_EMBEDDING_PLATFORM_UNSUPPORTED");
  trustedPath(configPath);
  if (lstatSync(configPath).size > 16384) throw new Error("LOCAL_EMBEDDING_CONFIG_INVALID");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const keys = ["runtime_module", "model_path", "model_id", "model_manifest", "dimensions"];
  if (!config || Object.keys(config).filter(key => key !== "indexing_ceiling").sort().join() !== keys.sort().join() || config.dimensions !== 384 ||
      typeof config.model_id !== "string" || !/^Xenova\/all-MiniLM-L6-v2@[a-f0-9]{40}$/.test(config.model_id) ||
      typeof config.runtime_module !== "string" || typeof config.model_path !== "string" || !config.model_manifest || Array.isArray(config.model_manifest)) throw new Error("LOCAL_EMBEDDING_CONFIG_INVALID");
  const indexingCeiling = config.indexing_ceiling ?? "public";
  if (!sensitivities.includes(indexingCeiling)) throw new Error("LOCAL_EMBEDDING_CONFIG_INVALID");
  trustedPath(config.runtime_module);
  const runtimePackagePath = trustedPath(resolve(dirname(config.runtime_module), "..", "package.json"));
  const runtimeLockPath = trustedPath(resolve(dirname(config.runtime_module), "../../../..", "package-lock.json"));
  const runtimePackageBytes = readFileSync(runtimePackagePath);
  const runtimePackage = JSON.parse(runtimePackageBytes.toString("utf8"));
  if (runtimePackage.name !== "@huggingface/transformers" || runtimePackage.version !== "3.7.6") throw new Error("LOCAL_EMBEDDING_RUNTIME_VERSION_INVALID");
  const runtimeDigest = createHash("sha256").update(readFileSync(runtimeLockPath)).update(runtimePackageBytes).update(readFileSync(config.runtime_module)).digest("hex");
  trustedPath(config.model_path, true);
  const entries = Object.entries(config.model_manifest);
  if (!entries.length || entries.length > 32) throw new Error("LOCAL_EMBEDDING_MANIFEST_INVALID");
  for (const required of ["config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model_quantized.onnx"]) {
    if (!(required in config.model_manifest)) throw new Error("LOCAL_EMBEDDING_MANIFEST_INVALID");
  }
  for (const [relative, expected] of entries) {
    if (!/^[a-zA-Z0-9_./-]+$/.test(relative) || relative.split("/").some(part => !part || part === "." || part === "..") || !/^[a-f0-9]{64}$/.test(String(expected))) throw new Error("LOCAL_EMBEDDING_MANIFEST_INVALID");
    const file = trustedPath(join(config.model_path, relative));
    if (lstatSync(file).size > 134217728 || createHash("sha256").update(readFileSync(file)).digest("hex") !== expected) throw new Error("LOCAL_EMBEDDING_MANIFEST_MISMATCH");
  }
  // Dynamic absolute import keeps the optional runtime out of the baseline
  // bundle. Installation and dependency locking belong to the operator.
  const runtime = await import(pathToFileURL(config.runtime_module).href);
  runtime.env.allowRemoteModels = false;
  runtime.env.allowLocalModels = true;
  runtime.env.useFSCache = false;
  runtime.env.useBrowserCache = false;
  const extractor = await runtime.pipeline("feature-extraction", config.model_path, {
    device: "cpu", dtype: "q8", local_files_only: true,
    session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 },
  });
  let tail: Promise<unknown> = Promise.resolve();
  let pending = 0;
  const provider = createVectorProvider({ kind: "local_onnx", configuration_provenance: "trusted_operator",
    provider_id: `obs.local.minilm.${retrievalCanonicalDigest({ model_manifest: config.model_manifest, runtime_digest: runtimeDigest }).slice(7, 39)}`, model_id: config.model_id,
    model_path: config.model_path, dimensions: 384, timeout_ms: 120000,
  }, { local_embedding_executor: async (request) => {
    if (request.texts.length > 32 || request.texts.reduce((sum, text) => sum + Buffer.byteLength(text, "utf8"), 0) > 262144 || pending >= 8) throw new Error("LOCAL_EMBEDDING_RESOURCE_LIMIT");
    pending++;
    const job = tail.then(async () => {
      request.signal.throwIfAborted();
      const vectors: number[][] = [];
      // Sequential samples bound native tensor memory for long authored chunks.
      for (const text of request.texts) {
        request.signal.throwIfAborted();
        const output = await extractor(text, { pooling: "mean", normalize: true });
        request.signal.throwIfAborted();
        const rows = output.tolist();
        if (!Array.isArray(rows) || rows.length !== 1 || rows[0].length !== 384) throw new Error("LOCAL_EMBEDDING_OUTPUT_INVALID");
        vectors.push(rows[0]);
      }
      return { request_id: request.request_id, model_id: request.model_id, dimensions: 384, vectors };
    });
    tail = job.catch(() => undefined);
    try { return await job; } finally { pending--; }
  } });
  trustedProviders.add(provider);
  return { provider, indexingCeiling, coordinate: { kind: "local_onnx", provider_id: provider.provider_id, model_id: provider.model_id,
    dimensions: 384, runtime_version: "3.7.6", runtime_digest: runtimeDigest, model_manifest: config.model_manifest, pooling: "mean", normalize: true, dtype: "q8", embedding_sensitivity: indexingCeiling } };
}
