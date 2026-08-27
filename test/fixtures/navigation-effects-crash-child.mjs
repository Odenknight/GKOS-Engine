import { open, readFile } from "node:fs/promises";

import { NodeNavigationEffectsExecutor } from "gkos-engine/navigation-effects/node";

const config = JSON.parse(await readFile(process.argv[2], "utf8"));
const executor = new NodeNavigationEffectsExecutor({
  vaultRoot: config.vaultRoot,
  pathThreatModel: "cooperative-vault",
  preconditionValidator: () => [],
  faultInjector: async (point) => {
    if (point !== config.point) return;
    const handle = await open(config.sentinel, "w");
    try { await handle.writeFile(point, "utf8"); await handle.sync(); } finally { await handle.close(); }
    await new Promise(() => setInterval(() => {}, 1_000));
  },
});

await executor.execute({ plan: config.plan, proposedBytes: config.proposedBytes });
process.exitCode = 2;
