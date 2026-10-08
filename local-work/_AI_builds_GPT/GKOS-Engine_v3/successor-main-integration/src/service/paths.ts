const CONTROL = /[\u0000-\u001f\u007f]/u;
const RESERVED_DEVICE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

/** Closed portable path grammar for serialized service paths and events. */
export function isServiceVaultRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024 || CONTROL.test(value)) return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return false;
  }
  // Service paths are filesystem coordinates, never URL-encoded values. This
  // single inequality rejects single and multiply encoded traversal alike.
  if (decoded !== value) return false;
  if (value !== value.normalize("NFC") || value.includes("\\") || value.startsWith("/") || /^[A-Za-z]:/u.test(value)) return false;
  const segments = value.split("/");
  return segments.every((segment) =>
    segment.length > 0 && segment !== "." && segment !== ".." &&
    !/[. ]$/u.test(segment) && !RESERVED_DEVICE.test(segment) && !/[<>:"|?*]/u.test(segment));
}
