import { createHash, timingSafeEqual } from "node:crypto";
import type { GkxSensitivity } from "../types";
import type { ServiceCredentialBinding, ServiceCredentialIdentity } from "./types";

const ALL_READ_CAPABILITIES = Object.freeze([
  "health.read", "capabilities.read", "notes.read", "graph.read", "graphiti.read", "events.read",
] as const);
const DEFAULT_LIMITS = Object.freeze({ concurrentRequests: 4, bucketCapacity: 10, refillMs: 1_000 });

function equalSecret(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left, "utf8").digest();
  const rightDigest = createHash("sha256").update(right, "utf8").digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

export function defaultMcpAgentBinding(token: string, input: {
  credentialId: string;
  agentId: string;
  agentLabel: string;
  sensitivityCeiling: GkxSensitivity;
  revoked: boolean;
  limits?: ServiceCredentialIdentity["limits"];
}): ServiceCredentialBinding {
  return {
    token,
    identity: {
      ...input,
      capabilities: ["mcp.read"],
    },
  };
}

/** In-memory credential registry. Secrets never enter returned identities. */
export class ServiceCredentialRegistry {
  readonly #bindings: ServiceCredentialBinding[];

  constructor(bindings: readonly ServiceCredentialBinding[]) {
    const tokenDigests = new Set<string>();
    const credentialIds = new Set<string>();
    for (const binding of bindings) {
      if (!/^[A-Za-z0-9._~-]{32,512}$/u.test(binding.token)) throw new TypeError("GKOS_SERVICE_CREDENTIAL_INVALID");
      const limits = binding.identity.limits ?? DEFAULT_LIMITS;
      if (!Number.isSafeInteger(limits.concurrentRequests) || limits.concurrentRequests < 1 || limits.concurrentRequests > 16 ||
        !Number.isSafeInteger(limits.bucketCapacity) || limits.bucketCapacity < 1 || limits.bucketCapacity > 100 ||
        !Number.isSafeInteger(limits.refillMs) || limits.refillMs < 10 || limits.refillMs > 60_000) {
        throw new TypeError("GKOS_SERVICE_CREDENTIAL_LIMITS_INVALID");
      }
      const tokenDigest = createHash("sha256").update(binding.token, "utf8").digest("hex");
      if (tokenDigests.has(tokenDigest) || credentialIds.has(binding.identity.credentialId)) {
        throw new TypeError("GKOS_SERVICE_CREDENTIAL_DUPLICATE");
      }
      tokenDigests.add(tokenDigest);
      credentialIds.add(binding.identity.credentialId);
    }
    this.#bindings = bindings.map((binding) => ({ token: binding.token, identity: {
      ...binding.identity,
      capabilities: [...binding.identity.capabilities],
      limits: { ...(binding.identity.limits ?? DEFAULT_LIMITS) },
    } }));
  }

  resolve(token: string): ServiceCredentialIdentity | null {
    let match: ServiceCredentialIdentity | null = null;
    for (const binding of this.#bindings) {
      if (equalSecret(token, binding.token)) match = { ...binding.identity, capabilities: [...binding.identity.capabilities], limits: binding.identity.limits ? { ...binding.identity.limits } : undefined };
    }
    return match;
  }

  setRevoked(credentialId: string, revoked: boolean): void {
    const binding = this.#bindings.find((item) => item.identity.credentialId === credentialId);
    if (binding) binding.identity = { ...binding.identity, revoked };
  }
}

/** Compatibility viewer identity for the existing reveal-once sidecar token. */
export function legacyViewerBinding(token: string, ceiling: GkxSensitivity = "secret"): ServiceCredentialBinding {
  return {
    token,
    identity: {
      credentialId: "credential:legacy-viewer",
      agentId: "018f47a3-7b5e-7c9d-8a1b-123456789abc",
      agentLabel: "Local Viewer",
      sensitivityCeiling: ceiling,
      capabilities: ALL_READ_CAPABILITIES,
      revoked: false,
      limits: { ...DEFAULT_LIMITS },
    },
  };
}
