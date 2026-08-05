/**
 * Small dependency-injection boundary for downstream GKOS products.
 *
 * Consumers can type their local adapter against this interface and swap an
 * engine upgrade in one place instead of importing implementation modules.
 */
import { buildGraph, parseSourceFile, type NoteRecord } from "./graph";
import { KosmosIndex } from "./incremental";
import type { Okf23ProjectionOptions } from "./okf23";
import type { KosmosGraph, SourceFile } from "./types";
import { ENGINE_NAME, ENGINE_VERSION } from "./version";

export interface GkosEngineAdapterOptions {
  /** Deterministic projection policy shared by full and incremental builds. */
  projection?: Okf23ProjectionOptions;
}

export interface GkosEngineAdapter {
  readonly name: typeof ENGINE_NAME;
  readonly version: string;
  parseSourceFile(file: SourceFile): NoteRecord;
  buildGraph(files: SourceFile[], folders?: string[], now?: number): KosmosGraph;
  createIndex(): KosmosIndex;
}

/**
 * Create an immutable, framework-neutral adapter over declared public exports.
 * No filesystem, UI framework, HTTP server, or product-specific state is
 * captured by the adapter.
 */
export function createGkosEngineAdapter(
  options: GkosEngineAdapterOptions = {},
): Readonly<GkosEngineAdapter> {
  const projection = { ...(options.projection ?? {}) };
  return Object.freeze({
    name: ENGINE_NAME,
    version: ENGINE_VERSION,
    parseSourceFile: (file: SourceFile) => parseSourceFile(file, projection),
    buildGraph: (files: SourceFile[], folders: string[] = [], now?: number) =>
      buildGraph(files, folders, now, projection),
    createIndex: () => new KosmosIndex(projection),
  });
}
