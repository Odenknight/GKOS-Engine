import{readFileSync,writeFileSync}from'node:fs';const p='[LOCAL_PATH]';let s=readFileSync(p,'utf8');s='import { readNativeSourcesBounded } from "./native-read";\n'+s;const start=s.indexOf('export function vaultSourceReader('),end=s.indexOf('\n}\n',start)+3;if(start<0||end<3)throw Error('factory not found');let factory=s.slice(start,end);factory=factory.replace('  return async (sourcePath) => {','  const reader = async (sourcePath: string): Promise<Uint8Array> => {');factory=factory.replace('    return readFile(actual);\n  };\n}', '    return readFile(actual);\n  };\n  nativeVaultSourceReaders.add(reader);\n  return reader;\n}');s=s.slice(0,start)+'const nativeVaultSourceReaders = new WeakSet<object>();\n\n'+factory+s.slice(end);
const old='    for (const group of new Map(policyEligible.map((chunk) => [chunk.source_id, chunksBySource.get(chunk.source_id)!])).values()) {';const replacement=`    const sourceGroups = [...new Map(policyEligible.map((chunk) => [chunk.source_id, chunksBySource.get(chunk.source_id)!])).values()];
    const sourcePaths = sourceGroups.map((group) => group[0].source_path);
    // Only Engine-created native readers can run concurrently. Arbitrary caller
    // callbacks and repeated-path retry semantics keep the existing serial path.
    // Admission above has already applied source/chunk policy and temporal filters.
    const prefetched = nativeVaultSourceReaders.has(this.#options.source_reader)
      && new Set(sourcePaths).size === sourcePaths.length
      ? await readNativeSourcesBounded(sourcePaths, this.#options.source_reader)
      : null;
    for (const group of sourceGroups) {`;
if(!s.includes(old))throw Error('group not found');s=s.replace(old,replacement);const read='        try { bytes = await this.#options.source_reader(first.source_path); sourceBytes.set(first.source_path, bytes); }\n        catch { staleCitation = true; continue; }';if(!s.includes(read))throw Error('read not found');s=s.replace(read,`        if (prefetched !== null) {
          const value = prefetched.get(first.source_path);
          if (value === null || value === undefined) { staleCitation = true; continue; }
          bytes = value;
          sourceBytes.set(first.source_path, bytes);
        } else {
          try { bytes = await this.#options.source_reader(first.source_path); sourceBytes.set(first.source_path, bytes); }
          catch { staleCitation = true; continue; }
        }`);writeFileSync(p,s);