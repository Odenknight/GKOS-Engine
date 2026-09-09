import { createHash } from "node:crypto";
import { readSync, lstatSync, openSync, fstatSync, closeSync, realpathSync, constants } from "node:fs";
import { resolve, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
const MANIFEST_FORMAT = "GNU sha256sum lines '<hex>  <file>\\n', in listed order, LF";
const MAX_FILE = 16 * 1024 * 1024, MAX_TOTAL = 64 * 1024 * 1024;
const hex = /^[a-f0-9]{64}$/;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fail = (code) => {
  throw Object.assign(new Error(code), { code });
};
function boundedRead(fd, size) {
  const out = Buffer.alloc(size + 1);
  let offset = 0;
  while (offset < out.length) {
    const count = readSync(fd, out, offset, out.length - offset, null);
    if (!count) break;
    offset += count;
  }
  if (offset > size) fail("DOCUMENTATION_SOURCE_CHANGED");
  return out.subarray(0, offset);
}
function declaration(value) {
  const d = value?.digest_method;
  if (!d || d.algorithm !== "sha256" || d.manifest_format !== MANIFEST_FORMAT || !Array.isArray(d.files) || d.files.length < 1 || d.files.length > 64 || new Set(d.files).size !== d.files.length || !hex.test(d.manifest_sha256)) fail("DOCUMENTATION_DECLARATION_INVALID");
  for (const p of d.files) if (typeof p !== "string" || p.length > 256 || !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(p) || p.split("/").some((x) => x === "." || x === "..") || !hex.test(d.per_file_sha256?.[p])) fail("DOCUMENTATION_DECLARATION_INVALID");
  if (!d.per_file_sha256 || Object.keys(d.per_file_sha256).length !== d.files.length) fail("DOCUMENTATION_DECLARATION_INVALID");
  if (sha256(Buffer.from(d.files.map((p) => d.per_file_sha256[p] + "  " + p + "\n").join(""), "utf8")) !== d.manifest_sha256) fail("DOCUMENTATION_DECLARED_MANIFEST_INCONSISTENT");
  return d;
}
function verifyDocumentationArtifact(value, files) {
  const d = declaration(value);
  if (!(files instanceof Map) || files.size !== d.files.length) fail("DOCUMENTATION_INPUT_SET_INVALID");
  let total = 0;
  const rows = d.files.map((p, index) => {
    const bytes = files.get(p);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_FILE || (total += bytes.byteLength) > MAX_TOTAL) fail("DOCUMENTATION_INPUT_INVALID");
    const actual2 = sha256(bytes);
    return { index, bytes: bytes.byteLength, expected: d.per_file_sha256[p], actual: actual2, matches: actual2 === d.per_file_sha256[p] };
  });
  const actual = sha256(Buffer.from(rows.map((r, i) => r.actual + "  " + d.files[i] + "\n").join(""), "utf8"));
  const match = rows.every((r) => r.matches) && actual === d.manifest_sha256;
  return { schema: "gkos-documentation-digest-verification/1", supersedes: "none", status: match ? "MATCH" : "MISMATCH", code: match ? "DOCUMENTATION_DIGEST_MATCH" : "DOCUMENTATION_DIGEST_MISMATCH", scope: "exact-file-bytes-and-ordered-sha256sum-manifest", manifest: { expected: d.manifest_sha256, actual, matches: actual === d.manifest_sha256 }, files: rows, refusalReceipt: false };
}
function readDocumentationFiles(value, root) {
  const d = declaration(value);
  const requested = resolve(root);
  const canonical = realpathSync(requested);
  if (canonical !== requested || !lstatSync(canonical).isDirectory() || lstatSync(canonical).isSymbolicLink()) fail("DOCUMENTATION_ROOT_INVALID");
  const files = /* @__PURE__ */ new Map();
  let total = 0;
  for (const p of d.files) {
    let current = canonical;
    const parts = p.split("/");
    for (const [i, part] of parts.entries()) {
      current = join(current, part);
      const s = lstatSync(current);
      if (s.isSymbolicLink() || i < parts.length - 1 && !s.isDirectory()) fail("DOCUMENTATION_PATH_INVALID");
    }
    if (!current.startsWith(canonical + sep)) fail("DOCUMENTATION_PATH_INVALID");
    const before = lstatSync(current);
    if (!before.isFile() || before.nlink !== 1 || before.size > MAX_FILE || (total += before.size) > MAX_TOTAL) fail("DOCUMENTATION_INPUT_INVALID");
    const fd = openSync(current, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    let bytes;
    try {
      const opened = fstatSync(fd);
      if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size || opened.nlink !== 1) fail("DOCUMENTATION_SOURCE_CHANGED");
      bytes = boundedRead(fd, before.size);
      const after = fstatSync(fd);
      if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) fail("DOCUMENTATION_SOURCE_CHANGED");
    } finally {
      closeSync(fd);
    }
    const final = lstatSync(current);
    if (final.isSymbolicLink() || realpathSync(current) !== current || final.dev !== before.dev || final.ino !== before.ino || final.size !== before.size || final.mtimeMs !== before.mtimeMs || final.ctimeMs !== before.ctimeMs) fail("DOCUMENTATION_SOURCE_CHANGED");
    files.set(p, bytes);
  }
  return files;
}
function readBoundedJson(path) {
  const fd = openSync(path, "r");
  try {
    const s = fstatSync(fd);
    if (!s.isFile() || s.size > 1024 * 1024) fail("DOCUMENTATION_JSON_INVALID");
    return JSON.parse(boundedRead(fd, s.size).toString("utf8"));
  } finally {
    closeSync(fd);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4) fail("DOCUMENTATION_USAGE_INVALID");
    const value = readBoundedJson(process.argv[2]);
    const result = verifyDocumentationArtifact(value, readDocumentationFiles(value, process.argv[3]));
    console.log(JSON.stringify(result));
    process.exitCode = result.status === "MATCH" ? 0 : 1;
  } catch (error) {
    const code = /^DOCUMENTATION_[A-Z_]+$/.test(error.code ?? "") ? error.code : "DOCUMENTATION_INPUT_UNREADABLE";
    console.log(JSON.stringify({ schema: "gkos-documentation-digest-verification/1", status: "REFUSED", code, refusalReceipt: false }));
    process.exitCode = 2;
  }
}
export {
  MANIFEST_FORMAT,
  readBoundedJson,
  readDocumentationFiles,
  sha256,
  verifyDocumentationArtifact
};
