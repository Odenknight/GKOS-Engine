/** Internal bounded native-read primitive. Call only after policy admission.
 * Failed reads remain stale-source refusals, and all admitted work is drained.
 */
export async function readNativeSourcesBounded(
  paths: readonly string[],
  read: (path: string) => Uint8Array | Promise<Uint8Array>,
): Promise<ReadonlyMap<string, Uint8Array | null>> {
  if (new Set(paths).size !== paths.length) throw new Error("RETRIEVAL_NATIVE_READ_DUPLICATE_PATH");
  const results: Array<Uint8Array | null> = new Array(paths.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, paths.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= paths.length) return;
      try { results[index] = await read(paths[index]); }
      catch { results[index] = null; }
    }
  }));
  return new Map(paths.map((path, index) => [path, results[index]]));
}