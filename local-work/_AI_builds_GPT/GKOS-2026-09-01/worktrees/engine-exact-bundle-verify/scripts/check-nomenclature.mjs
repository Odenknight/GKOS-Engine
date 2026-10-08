import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const legacyWord = ["O", "K", "F"].join("");
const prohibited = new RegExp(`\\b${legacyWord}(?:\\+)?\\b|${legacyWord.toLowerCase()}_`, "i");

export function scanLegacyNomenclature(files, exceptions = new Set()) {
  const findings = [];
  for (const file of [...files].sort()) {
    const lines = readFileSync(resolve(root, file), "utf8").split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      if (prohibited.test(lines[index]) && !exceptions.has(`${file}:${index + 1}`)) findings.push(`${file}:${index + 1}`);
    }
  }
  return findings;
}

function generatedReleaseFiles(directory) {
  if (!existsSync(resolve(root, directory))) return [];
  const found = [];
  const walk = (relativeDirectory) => {
    for (const entry of readdirSync(resolve(root, relativeDirectory), { withFileTypes: true })) {
      const relativePath = `${relativeDirectory}/${entry.name}`;
      if (entry.isDirectory()) walk(relativePath);
      else if (entry.isFile()) found.push(relativePath);
    }
  };
  walk(directory);
  return found;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  const exceptions = new Set(JSON.parse(readFileSync(resolve(root, "scripts/nomenclature-exceptions.json"), "utf8")));
  const findings = scanLegacyNomenclature([...new Set([...tracked, ...generatedReleaseFiles("dist")])], exceptions);
  if (findings.length) {
    console.error(`Legacy nomenclature gate failed:\n${findings.join("\n")}`);
    process.exit(1);
  }
  console.log("Legacy nomenclature gate passed: zero unapproved matches.");
}
