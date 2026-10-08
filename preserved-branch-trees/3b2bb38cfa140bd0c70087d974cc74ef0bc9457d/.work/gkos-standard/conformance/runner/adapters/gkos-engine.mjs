/**
 * Example adapter binding the runner to gkos-engine (informative — the
 * standard does not depend on this implementation). Set GKOS_ENGINE_DIST to
 * the built bundle, e.g.:
 *   GKOS_ENGINE_DIST=/path/to/GKOS-Engine/dist/kosmos-core.mjs \
 *   node run.mjs --adapter ./adapters/gkos-engine.mjs
 */
const dist = process.env.GKOS_ENGINE_DIST;
if (!dist) throw new Error("Set GKOS_ENGINE_DIST to gkos-engine's dist/kosmos-core.mjs");
const core = await import(dist);
export const implementation = { name: "gkos-engine", version: core.ENGINE_VERSION, repository: "https://github.com/Odenknight/GKOS-Engine" };
export function project(content, path) {
  const p = core.buildGkx23Projection(content, path, "fixture:" + path, null);
  return {
    diagnostics: (p?.diagnostics ?? []).map(d => ({ code: d.code, severity: d.severity, field: d.field ?? null })),
    effective: { sensitivity: p?.effective?.sensitivity ?? null, epistemicState: p?.effective?.epistemicState ?? null },
  };
}
