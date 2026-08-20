import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import test from "node:test";
import { scanLegacyNomenclature } from "../scripts/check-nomenclature.mjs";

const oldName = ["O", "K", "F"].join("");

test("legacy nomenclature fixture fails unless its exact line is allowlisted", () => {
  const dir = mkdtempSync(join(resolve("."), ".nomenclature-test-"));
  try {
    const file = join(dir, "historical.txt");
    writeFileSync(file, `historical ${oldName} citation\n`);
    const rel = relative(resolve("."), file).replace(/\\/g, "/");
    assert.deepEqual(scanLegacyNomenclature([rel]), [`${rel}:1`]);
    assert.deepEqual(scanLegacyNomenclature([rel], new Set([`${rel}:1`])), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
