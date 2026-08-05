/**
 * Small dependency-injection boundary for downstream GKOS products.
 *
 * Consumers can type their local adapter against this interface and swap an
 * engine upgrade in one place instead of importing implementation modules.
 */
import { buildGraph, parseSourceFile, type NoteRecord } from "./graph";
import { GkxIndex } from "./incremental";
import type { Gkx23ProjectionOptions } from "./gkx23";
import type { GkxGraph, SourceFile } from "./types";
import { ENGINE_NAME, ENGINE_VERSION } from "./version";

export interface GkosEngineAdapterOptions {
  /** Deterministic projection policy shared by full and incremental builds. */
  projection?: Gkx23ProjectionOptions;
}

export interface GkosEngineAdapter {
  readonly name: typeof ENGINE_NAME;
  readonly version: string;
  parseSourceFile(file: SourceFile): NoteRecord;
  buildGraph(files: SourceFile[], folders?: string[], now?: number): GkxGraph;
  createIndex(): GkxIndex;
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
    createIndex: () => new GkxIndex(projection),
  });
}
