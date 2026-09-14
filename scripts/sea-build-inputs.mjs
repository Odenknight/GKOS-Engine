import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

export function assertSameSeaAssets(before, after) {
  const ordered = map => Object.entries(map).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  if (JSON.stringify(ordered(before)) !== JSON.stringify(ordered(after))) {
    throw new Error("SEA asset map changed before inventory publication");
  }
}

export function observedFile(path, logicalName) {
  const bytes = readFileSync(path);
  return { logicalName, bytes: bytes.length, sha256: sha256(bytes) };
}

export function writeSeaBuildInputs(path, input, recheck) {
  if (Object.hasOwn(input, "schemaVersion") || Object.hasOwn(input, "completeSbom") || Object.hasOwn(input, "scope")) {
    throw new Error("SEA build input inventory scope cannot be overridden");
  }
  const files = [...input.observedInputs, input.baseNodeBeforeSignatureRemoval,
    input.preInjectionBinary, input.finalExecutable];
  if (!input.target || !["host", "download"].includes(input.sourceMode)
      || !input.hostBlobGeneratorNodeVersion || !input.targetNodeVersion
      || files.some(file => !file || typeof file.logicalName !== "string" || !file.logicalName
        || file.logicalName.includes("\\") || file.logicalName.startsWith("/") || /^[A-Za-z]:/u.test(file.logicalName)
        || !Number.isSafeInteger(file.bytes) || file.bytes < 1 || !/^[0-9a-f]{64}$/u.test(file.sha256))
      || new Set(input.observedInputs.map(file => file.logicalName)).size !== input.observedInputs.length
      || (input.sourceMode === "host" && input.downloadedChecksumProvenance !== null)
      || (input.sourceMode === "download" && (!input.downloadedChecksumProvenance
        || !input.downloadedChecksumProvenance.tarball || !/^[0-9a-f]{64}$/u.test(input.downloadedChecksumProvenance.sha256)
        || input.downloadedChecksumProvenance.expectedSha256 !== input.downloadedChecksumProvenance.sha256
        || !input.downloadedChecksumProvenance.shasumsUrl
        || !/^[0-9a-f]{64}$/u.test(input.downloadedChecksumProvenance.shasumsSha256)))) {
    throw new Error("SEA build input inventory is invalid");
  }
  const checked = recheck();
  if (JSON.stringify(checked.observedInputs) !== JSON.stringify(input.observedInputs)
      || JSON.stringify(checked.finalExecutable) !== JSON.stringify(input.finalExecutable)) {
    throw new Error("SEA build inputs changed before inventory publication");
  }
  const inventory = {
    ...input,
    schemaVersion: 1,
    completeSbom: false,
    scope: "SEA build composition only; Node internals and license completeness are not established",
  };
  writeFileSync(path, JSON.stringify(inventory, null, 2) + "\n", { flag: "wx" });
  return inventory;
}
