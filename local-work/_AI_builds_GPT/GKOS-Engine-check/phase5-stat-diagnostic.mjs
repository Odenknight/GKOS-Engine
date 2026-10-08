import { closeSync, fstatSync, lstatSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "gkos-stat-diagnostic-"));
const path = join(root, "measurement.json");
try {
  writeFileSync(path, Buffer.from("{}\n"), { flag: "wx" });
  const linked = lstatSync(path, { bigint: true });
  const descriptor = openSync(path, "r");
  const opened = fstatSync(descriptor, { bigint: true });
  readFileSync(descriptor);
  const after = fstatSync(descriptor, { bigint: true });
  closeSync(descriptor);
  const pathAfter = lstatSync(path, { bigint: true });
  for (const [name, value] of Object.entries({ linked, opened, after, pathAfter })) {
    console.log(name, JSON.stringify({
      dev: String(value.dev), ino: String(value.ino), mode: String(value.mode),
      nlink: String(value.nlink), size: String(value.size),
      mtimeNs: String(value.mtimeNs), ctimeNs: String(value.ctimeNs),
      atimeNs: String(value.atimeNs), birthtimeNs: String(value.birthtimeNs),
    }));
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
