import type { GraphitiQueryRequest } from "./graphiti-query-contract";

/** Host-configured endpoint only. Never derive this address or headers from a
 * tool request. Redirects are refused so credentials cannot follow a provider.
 * This transport bounds bytes; it does not qualify backend read-only behavior.
 */
export function graphitiHttpQuery(endpoint: string, headers: Readonly<Record<string, string>> = {},
  fetcher: typeof fetch = fetch): (request: Readonly<GraphitiQueryRequest>, signal: AbortSignal) => Promise<string> {
  const url = new URL(endpoint);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash)
    throw new Error("Invalid Graphiti query endpoint");
  const fixedHeaders = new Headers(headers);
  fixedHeaders.set("Content-Type", "application/json"); fixedHeaders.set("Accept", "application/json");
  return async (request, signal) => {
    const response = await fetcher(url.href, { method: "POST", headers: fixedHeaders,
      body: JSON.stringify(request), signal, redirect: "error", cache: "no-store" });
    if (!response.ok || !/^application\/json(?:\s*;|$)/i.test(response.headers.get("Content-Type") || "")) {
      await response.body?.cancel(); throw new Error("Graphiti query response rejected");
    }
    const length = response.headers.get("Content-Length");
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > 131072)) {
      await response.body?.cancel(); throw new Error("Graphiti query response exceeds byte budget");
    }
    if (!response.body) throw new Error("Graphiti query response missing");
    const reader = response.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0, text = "", complete = false;
    try {
      for (;;) {
        if (signal.aborted) throw new Error("Graphiti query cancelled");
        const chunk = await reader.read();
        if (chunk.done) { text += decoder.decode(); complete = true; return text; }
        bytes += chunk.value.byteLength;
        if (bytes > 131072) throw new Error("Graphiti query response exceeds byte budget");
        text += decoder.decode(chunk.value, { stream: true });
      }
    } finally {
      if (!complete) { try { await reader.cancel(); } catch { /* preserve bounded failure */ } }
      reader.releaseLock();
    }
  };
}
