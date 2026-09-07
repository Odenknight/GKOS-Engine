/** Informative P1.1 observer. No expectations, selection rules, or verdicts. */
import { buildGraph, ENGINE_NAME, ENGINE_VERSION } from '../../dist/gkos-engine.mjs';

export function observeDossierSnapshot({ records, now }) {
  if (!Array.isArray(records) || !Number.isFinite(now)) {
    throw new TypeError('records and a finite fixed observation time are required');
  }
  for (const record of records) {
    if (typeof record.relativePath !== 'string' || typeof record.content !== 'string'
        || !Number.isFinite(record.createdTime) || !Number.isFinite(record.modifiedTime)) {
      throw new TypeError('Each record requires a path, content, and explicit source times');
    }
  }
  return {
    engine: { name: ENGINE_NAME, version: ENGINE_VERSION },
    graph: buildGraph(records, [], now),
  };
}
