import { timingSafeEqual } from "node:crypto";

import { sealWatcherRecoveryRecord } from "./contracts";
import {
  openWatcherDirectory,
  parseCanonicalWatcherJson,
  readWatcherFile,
  watcherCanonicalBytes,
} from "./fs-authority";
import { watcherStatusText } from "./service";

type JsonRecord = Record<string, unknown>;

const STATUS_HELP = "Usage: gkos status --state <state-directory> [--json]\n";
const RESET_HELP = "Usage: gkos watcher journal-reset --state <state-directory> --expected-journal-generation-digest <sha256> --expected-coherent-manifest-digest <sha256> [--json]\n";
const SHA256_RE = /^sha256:[0-9a-f]{64}$/u;

export interface GkosCliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exit_code: 0 | 1 | 2 | 3;
}

export interface GkosCliOptions {
  readonly reset_journal?: (input: {
    readonly state_directory: string;
    readonly expected_journal_generation_digest: string;
    readonly expected_coherent_manifest_digest: string;
  }) => Promise<Readonly<JsonRecord>> | Readonly<JsonRecord>;
}

function result(stdout: string, stderr: string, exitCode: 0 | 1 | 2 | 3): GkosCliResult {
  return Object.freeze({ stdout, stderr, exit_code: exitCode });
}

function equalToken(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function readStatusAuthority(stateDirectory: string): {
  readonly locator: Readonly<JsonRecord>;
  readonly locator_raw_sha256: string;
  readonly token: string;
} {
  const directory = openWatcherDirectory(stateDirectory);
  const locatorFile = readWatcherFile(directory, "watcher-service-locator.json", { maximum_bytes: 1_048_576 });
  const locator = sealWatcherRecoveryRecord(parseCanonicalWatcherJson(locatorFile));
  const tokenFile = readWatcherFile(directory, "desktop-agent.token", { maximum_bytes: 4_096 });
  const token = tokenFile.bytes.toString("utf8").trim();
  if (locator.loopback_host !== "127.0.0.1" || locator.status_route !== "/status" ||
      !Number.isSafeInteger(locator.port) || Number(locator.port) < 1 || Number(locator.port) > 65_535 ||
      token.length < 1 || token.length > 1_024 || /[\u0000-\u001f\u007f]/u.test(token)) {
    throw new Error("GKX_WATCHER_STATUS_AUTHORITY_INVALID");
  }
  return { locator, locator_raw_sha256: locatorFile.raw_sha256, token };
}

async function invokeStatus(stateDirectory: string): Promise<Readonly<JsonRecord>> {
  const first = readStatusAuthority(stateDirectory);
  const response = await fetch(`http://127.0.0.1:${String(first.locator.port)}${String(first.locator.status_route)}`, {
    headers: { authorization: `Bearer ${first.token}` },
  });
  if (response.status !== 200) throw new Error("GKX_WATCHER_STATUS_UNAVAILABLE");
  const text = await response.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error("GKX_WATCHER_STATUS_INVALID"); }
  const status = sealWatcherRecoveryRecord(parsed);
  const second = readStatusAuthority(stateDirectory);
  if (first.locator_raw_sha256 !== second.locator_raw_sha256 ||
      first.locator.service_instance_id !== second.locator.service_instance_id ||
      first.locator.pid !== second.locator.pid || !equalToken(first.token, second.token) ||
      status.service_instance_id !== second.locator.service_instance_id || status.pid !== second.locator.pid ||
      !watcherCanonicalBytes(status).equals(Buffer.from(text, "utf8"))) {
    throw new Error("GKX_WATCHER_STATUS_AUTHORITY_CHANGED");
  }
  return status;
}

function resetText(value: Readonly<JsonRecord>): string {
  return [
    "gkos watcher journal-reset",
    `status: ${String(value.status)}`,
    `prior_journal_generation_digest: ${String(value.prior_journal_generation_digest)}`,
    `archive_manifest_digest: ${String(value.archive_manifest_digest)}`,
    `new_journal_generation_digest: ${String(value.new_journal_generation_digest)}`,
    `outer_coherent_manifest_digest: ${String(value.outer_coherent_manifest_digest)}`,
    `reset_digest: ${String(value.reset_digest)}`,
    `requires_reconciliation: ${String(value.requires_reconciliation)}`,
    `result_digest: ${String(value.result_digest)}`,
    "",
  ].join("\n");
}

function statusArgv(argv: readonly string[]): { state: string; json: boolean } | "help" | null {
  if (argv.length === 2 && argv[0] === "status" && argv[1] === "--help") return "help";
  if ((argv.length === 3 || argv.length === 4) && argv[0] === "status" && argv[1] === "--state" &&
      typeof argv[2] === "string" && argv[2].length > 0 && (argv.length === 3 || argv[3] === "--json")) {
    return { state: argv[2], json: argv.length === 4 };
  }
  return null;
}

function resetArgv(argv: readonly string[]): {
  state: string;
  journal_digest: string;
  coherent_digest: string;
  json: boolean;
} | "help" | null {
  if (argv.length === 3 && argv[0] === "watcher" && argv[1] === "journal-reset" && argv[2] === "--help") return "help";
  if ((argv.length === 8 || argv.length === 9) && argv[0] === "watcher" && argv[1] === "journal-reset" &&
      argv[2] === "--state" && argv[3].length > 0 && argv[4] === "--expected-journal-generation-digest" && SHA256_RE.test(argv[5]) &&
      argv[6] === "--expected-coherent-manifest-digest" && SHA256_RE.test(argv[7]) && (argv.length === 8 || argv[8] === "--json")) {
    return { state: argv[3], journal_digest: argv[5], coherent_digest: argv[7], json: argv.length === 9 };
  }
  return null;
}

function stateCapabilityError(error: unknown): boolean {
  const code = String((error as NodeJS.ErrnoException)?.code ?? "");
  const message = String((error as Error)?.message ?? "");
  return code === "ENOENT" || code === "ENOTDIR" || message.startsWith("GKX_WATCHER_DIRECTORY_");
}

export async function runGkosCli(argv: readonly string[], options: GkosCliOptions = {}): Promise<GkosCliResult> {
  const status = statusArgv(argv);
  if (status === "help") return result(STATUS_HELP, "", 0);
  if (status !== null) {
    try {
      const record = await invokeStatus(status.state);
      const stdout = status.json ? watcherCanonicalBytes(record).toString("utf8") : watcherStatusText(record);
      return result(stdout, "", record.watcher_state === "serving" && record.freshness === "fresh" ? 0 : 1);
    } catch (error) {
      return stateCapabilityError(error)
        ? result("", "gkos status: invalid state capability\n", 2)
        : result("", "gkos status: operational failure\n", 3);
    }
  }
  const reset = resetArgv(argv);
  if (reset === "help") return result(RESET_HELP, "", 0);
  if (reset !== null) {
    let directory;
    try { directory = openWatcherDirectory(reset.state); }
    catch { return result("", "gkos watcher journal-reset: invalid state capability\n", 2); }
    try {
      if (options.reset_journal === undefined) throw new Error("GKX_WATCHER_JOURNAL_RESET_UNAVAILABLE");
      const output = sealWatcherRecoveryRecord(await options.reset_journal({
        state_directory: directory.path,
        expected_journal_generation_digest: reset.journal_digest,
        expected_coherent_manifest_digest: reset.coherent_digest,
      }));
      return result(reset.json ? watcherCanonicalBytes(output).toString("utf8") : resetText(output), "", 0);
    } catch (error) {
      return String((error as Error)?.message).includes("EXPECTED_COORDINATE")
        ? result("", "gkos watcher journal-reset: expected coordinate mismatch\n", 2)
        : result("", "gkos watcher journal-reset: operational failure\n", 3);
    }
  }
  return argv[0] === "watcher"
    ? result("", "gkos watcher journal-reset: invalid arguments\n", 2)
    : result("", "gkos status: invalid arguments\n", 2);
}
