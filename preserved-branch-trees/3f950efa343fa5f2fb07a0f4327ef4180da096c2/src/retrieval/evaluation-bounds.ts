/** Pure base64 decoded-length arithmetic used before any source-byte decode. */
export function retrievalEvaluationDecodedBase64Length(encodedLength: number, paddingCount: number): number {
  if (!Number.isSafeInteger(encodedLength) || encodedLength < 0 || encodedLength % 4 !== 0 ||
      !Number.isSafeInteger(paddingCount) || paddingCount < 0 || paddingCount > 2 || encodedLength === 0 && paddingCount !== 0) {
    throw new TypeError("GKX_EVAL_SOURCE_OBSERVATION_BASE64_LENGTH_INVALID");
  }
  return encodedLength / 4 * 3 - paddingCount;
}
