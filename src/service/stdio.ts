/**
 * Compatibility bridge for MCP clients that can speak stdio but cannot attach
 * an Authorization header to Streamable HTTP. This is deliberately a bridge
 * to the loopback service, not a second MCP runtime and not a claim of native
 * stdio contract conformance.
 */
import { basename, dirname, isAbsolute } from "node:path";
import type { Readable, Writable } from "node:stream";
import { openWatcherDirectory, readWatcherFile } from "../watcher/fs-authority";

export const STDIO_REQUEST_BYTES = 393_216;
export const STDIO_RESULT_BYTES = 1_048_576;
export const STDIO_REQUEST_TIMEOUT_MS = 30_000;
export const STDIO_SHUTDOWN_MS = 10_000;
export const STDIO_MAX_IN_FLIGHT = 4;
export const STDIO_DEFAULT_ENDPOINT = "http://127.0.0.1:4814/mcp";
const MCP_PROTOCOL_VERSION = "2025-11-25";
const TOKEN_BYTES = 4_096;
const TOKEN = /^[A-Za-z0-9._~-]{32,512}$/u;
const SESSION = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export class StdioFrameTooLargeError extends Error {
  constructor() { super("GKOS_STDIO_FRAME_TOO_LARGE"); }
}

export function validateMcpEndpoint(input: string | undefined): string {
  const raw = input || STDIO_DEFAULT_ENDPOINT;
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new TypeError("GKOS_STDIO_ENDPOINT_INVALID"); }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.pathname !== "/mcp" ||
      url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "" ||
      (url.port !== "" && (!/^[0-9]{1,5}$/u.test(url.port) || Number(url.port) < 1 || Number(url.port) > 65_535))) {
    throw new TypeError("GKOS_STDIO_ENDPOINT_INVALID");
  }
  return url.href;
}

/** Read only a securely reopened, private direct-child credential file. */
export function loadMcpToken(tokenFile: string | undefined): string {
  if (typeof tokenFile !== "string" || !isAbsolute(tokenFile) || basename(tokenFile) === "") {
    throw new TypeError("GKOS_STDIO_TOKEN_FILE_INVALID");
  }
  const directory = openWatcherDirectory(dirname(tokenFile));
  const sealed = readWatcherFile(directory, basename(tokenFile), { maximum_bytes: TOKEN_BYTES });
  const text = sealed.bytes.toString("utf8");
  const match = /^([A-Za-z0-9._~-]{32,512})(?:\r?\n)?$/u.exec(text);
  if (!match || !TOKEN.test(match[1])) throw new TypeError("GKOS_STDIO_TOKEN_FILE_INVALID");
  return match[1];
}

/** Byte-oriented LF framing; raw newlines cannot be hidden by UTF-16 counts. */
export async function* readStdioFrames(
  input: AsyncIterable<Uint8Array | string>,
  maximumBytes = STDIO_REQUEST_BYTES,
): AsyncGenerator<Buffer> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > STDIO_REQUEST_BYTES) {
    throw new TypeError("GKOS_STDIO_FRAME_LIMIT_INVALID");
  }
  let pieces: Buffer[] = [];
  let length = 0;
  const finish = (): Buffer => {
    let frame = pieces.length === 1 ? pieces[0] : Buffer.concat(pieces, length);
    pieces = []; length = 0;
    if (frame.at(-1) === 0x0d) frame = frame.subarray(0, frame.length - 1);
    return frame;
  };
  for await (const raw of input) {
    const chunk = typeof raw === "string" ? Buffer.from(raw, "utf8") : Buffer.from(raw);
    let offset = 0;
    while (offset < chunk.length) {
      const newline = chunk.indexOf(0x0a, offset);
      const end = newline < 0 ? chunk.length : newline;
      const part = chunk.subarray(offset, end);
      if (length + part.length > maximumBytes) throw new StdioFrameTooLargeError();
      if (part.length > 0) { pieces.push(part); length += part.length; }
      if (newline < 0) break;
      yield finish();
      offset = newline + 1;
    }
  }
  if (length > 0) yield finish();
}

interface BridgeEnvironment { readonly [name: string]: string | undefined }
interface SignalSource {
  once(name: "SIGINT" | "SIGTERM", listener: () => void): unknown;
  off(name: "SIGINT" | "SIGTERM", listener: () => void): unknown;
}
export interface StdioBridgeOptions {
  input?: Readable & AsyncIterable<Buffer | string>;
  output?: Writable;
  diagnostics?: Writable;
  environment?: BridgeEnvironment;
  fetch?: typeof globalThis.fetch;
  signals?: SignalSource | null;
}

function hasRequestId(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.hasOwn(value, "id");
}

function transportError(message: unknown): Record<string, unknown> | null {
  if (!hasRequestId(message)) return null;
  const id = typeof message.id === "string" || typeof message.id === "number" || message.id === null ? message.id : null;
  return { jsonrpc: "2.0", id, error: { code: -32000, message: "GKOS MCP transport unavailable" } };
}

async function writeBytes(output: Writable, bytes: Buffer): Promise<void> {
  if (output.destroyed || output.writableEnded) throw new Error("GKOS_STDIO_OUTPUT_CLOSED");
  if (output.write(bytes)) return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      output.off("drain", drained);
      output.off("close", closed);
      output.off("error", failed);
    };
    const drained = (): void => { cleanup(); resolve(); };
    const closed = (): void => { cleanup(); reject(new Error("GKOS_STDIO_OUTPUT_CLOSED")); };
    const failed = (): void => { cleanup(); reject(new Error("GKOS_STDIO_OUTPUT_FAILED")); };
    output.once("drain", drained);
    output.once("close", closed);
    output.once("error", failed);
    if (output.destroyed || output.writableEnded) closed();
  });
}

async function responseBytes(response: Response, controller: AbortController): Promise<Buffer> {
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^(?:0|[1-9][0-9]{0,9})$/u.test(declared) || Number(declared) > STDIO_RESULT_BYTES)) {
    controller.abort();
    throw new Error("GKOS_STDIO_RESULT_TOO_LARGE");
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = Buffer.from(next.value);
      length += chunk.length;
      if (length > STDIO_RESULT_BYTES) {
        controller.abort();
        throw new Error("GKOS_STDIO_RESULT_TOO_LARGE");
      }
      chunks.push(chunk);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, length);
}

function decodeJson(bytes: Buffer): unknown {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return JSON.parse(text);
}

function validJsonRpcResponse(payload: unknown, request: unknown): payload is Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      (payload as Record<string, unknown>).jsonrpc !== "2.0" || !hasRequestId(request)) return false;
  const response = payload as Record<string, unknown>;
  const expected = request.id;
  if (response.id !== expected) return false;
  return Object.hasOwn(response, "result") !== Object.hasOwn(response, "error");
}

/** Run one compatibility process. Returns an exit code and never exits itself. */
export async function runStdioBridge(options: StdioBridgeOptions = {}): Promise<number> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const diagnostics = options.diagnostics ?? process.stderr;
  const environment = options.environment ?? process.env;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const signals = options.signals === undefined ? process : options.signals;
  let token: string;
  let endpoint: string;
  try {
    if (environment.GKOS_MCP_TOKEN !== undefined) throw new TypeError("GKOS_STDIO_RAW_TOKEN_FORBIDDEN");
    token = loadMcpToken(environment.GKOS_MCP_TOKEN_FILE);
    endpoint = validateMcpEndpoint(environment.GKOS_MCP_URL);
    if (typeof fetchImpl !== "function") throw new TypeError("GKOS_STDIO_FETCH_UNAVAILABLE");
  } catch {
    diagnostics.write("gkos-mcp-stdio: configuration rejected\n");
    return 2;
  }

  let sessionId: string | null = null;
  let protocolVersion: string | null = null;
  let initialized = false;
  let closing = false;
  let exitCode = 0;
  let outputFailed = false;
  const active = new Set<Promise<void>>();
  const controllers = new Set<AbortController>();
  let outputTail = Promise.resolve();
  const emit = (value: unknown): Promise<void> => {
    let bytes: Buffer;
    try { bytes = Buffer.from(`${JSON.stringify(value)}\n`, "utf8"); }
    catch { bytes = Buffer.from('{"jsonrpc":"2.0","id":null,"error":{"code":-32603,"message":"Internal error"}}\n'); }
    if (bytes.length - 1 > STDIO_RESULT_BYTES) {
      bytes = Buffer.from('{"jsonrpc":"2.0","id":null,"error":{"code":-32603,"message":"Internal error"}}\n');
    }
    outputTail = outputTail.then(async () => {
      if (outputFailed) return;
      try { await writeBytes(output, bytes); }
      catch {
        outputFailed = true;
        exitCode = 3;
        stopInput();
      }
    });
    return outputTail;
  };
  const stopInput = (): void => {
    closing = true;
    if (typeof input.destroy === "function" && !input.destroyed) input.destroy();
  };
  const onSignal = (): void => { stopInput(); };
  signals?.once("SIGINT", onSignal);
  signals?.once("SIGTERM", onSignal);

  const forward = async (message: unknown): Promise<void> => {
    const controller = new AbortController();
    controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), STDIO_REQUEST_TIMEOUT_MS);
    const isNotification = !hasRequestId(message);
    try {
      const body = Buffer.from(JSON.stringify(message), "utf8");
      if (body.length > STDIO_REQUEST_BYTES) throw new Error("GKOS_STDIO_REQUEST_TOO_LARGE");
      const headers: Record<string, string> = {
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };
      if (sessionId) headers["Mcp-Session-Id"] = sessionId;
      if (sessionId && protocolVersion) headers["MCP-Protocol-Version"] = protocolVersion;
      const response = await fetchImpl(endpoint, { method: "POST", headers, body, signal: controller.signal });
      const bytes = await responseBytes(response, controller);
      if (!response.ok && response.status !== 202) {
        const error = transportError(message);
        if (error) await emit(error);
        if (response.status === 401 || response.status === 403 || response.status === 404) {
          exitCode = 3; stopInput();
        }
        return;
      }
      if (response.status === 202 || bytes.length === 0) {
        if (!isNotification) {
          const error = transportError(message);
          if (error) await emit(error);
        } else if ((message as Record<string, unknown>)?.method === "notifications/initialized") initialized = true;
        return;
      }
      if (!/^application\/json(?:\s*;|$)/iu.test(response.headers.get("content-type") ?? "")) {
        throw new Error("GKOS_STDIO_UPSTREAM_MEDIA_INVALID");
      }
      let payload: unknown;
      try { payload = decodeJson(bytes); }
      catch { throw new Error("GKOS_STDIO_UPSTREAM_JSON_INVALID"); }
      if (!isNotification && !validJsonRpcResponse(payload, message)) {
        throw new Error("GKOS_STDIO_UPSTREAM_RESPONSE_INVALID");
      }
      const method = !Array.isArray(message) && message && typeof message === "object" ? (message as Record<string, unknown>).method : null;
      if (method === "initialize" && payload && typeof payload === "object" && !Array.isArray(payload) &&
          (payload as Record<string, unknown>).result && typeof (payload as Record<string, unknown>).result === "object") {
        const nextSession = response.headers.get("mcp-session-id");
        const nextProtocol = response.headers.get("mcp-protocol-version");
        const resultProtocol = ((payload as Record<string, unknown>).result as Record<string, unknown>).protocolVersion;
        if (!nextSession || !SESSION.test(nextSession) || nextProtocol !== MCP_PROTOCOL_VERSION || resultProtocol !== MCP_PROTOCOL_VERSION) {
          throw new Error("GKOS_STDIO_INITIALIZE_BINDING_INVALID");
        }
        sessionId = nextSession; protocolVersion = nextProtocol;
      }
      if (!isNotification) await emit(payload);
    } catch {
      const error = transportError(message);
      if (error) await emit(error);
      diagnostics.write("gkos-mcp-stdio: transport operation failed\n");
    } finally {
      clearTimeout(timer);
      controllers.delete(controller);
    }
  };

  try {
    for await (const frame of readStdioFrames(input)) {
      if (closing || frame.length === 0) continue;
      let message: unknown;
      try { message = decodeJson(frame); }
      catch {
        await emit({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
        continue;
      }
      if (!initialized) {
        await forward(message);
        continue;
      }
      while (!closing && active.size >= STDIO_MAX_IN_FLIGHT) await Promise.race(active);
      if (closing) break;
      const operation = forward(message).catch(() => { exitCode = 3; stopInput(); });
      active.add(operation);
      void operation.then(() => active.delete(operation));
    }
  } catch (error) {
    if (!closing) {
      exitCode = 3;
      if (error instanceof StdioFrameTooLargeError) {
        await emit({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } });
      }
      diagnostics.write("gkos-mcp-stdio: input rejected\n");
    }
  } finally {
    closing = true;
    const shutdownStarted = Date.now();
    const settle = Promise.allSettled([...active]);
    let settled = false;
    let shutdownTimer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      settle.then(() => { settled = true; }),
      new Promise<void>((resolve) => { shutdownTimer = setTimeout(resolve, STDIO_SHUTDOWN_MS - 2_000); }),
    ]);
    if (shutdownTimer !== undefined) clearTimeout(shutdownTimer);
    if (!settled) for (const controller of controllers) controller.abort();
    if (sessionId && protocolVersion) {
      const controller = new AbortController();
      const remaining = Math.max(10, STDIO_SHUTDOWN_MS - (Date.now() - shutdownStarted));
      const timer = setTimeout(() => controller.abort(), Math.min(2_000, remaining));
      try {
        await fetchImpl(endpoint, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}`, "Mcp-Session-Id": sessionId, "MCP-Protocol-Version": protocolVersion },
          signal: controller.signal,
        });
      } catch { /* best-effort closure during process shutdown */ }
      finally { clearTimeout(timer); }
    }
    await outputTail;
    signals?.off("SIGINT", onSignal);
    signals?.off("SIGTERM", onSignal);
    token = "";
  }
  return exitCode;
}
