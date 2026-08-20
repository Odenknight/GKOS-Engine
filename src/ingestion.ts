import { deepFreeze } from "./canonical";
import type { ActorRef } from "./governance";

export type IngestionFreshness = "current" | "stale" | "indeterminate";

/** Provider-neutral input boundary. Provider SDKs and credentials stay in adapters. */
export interface IngestionEnvelope {
  source: {
    provider: string;
    identity: string;
    version: string;
    acquiredAt: string;
    acquiredBy: ActorRef;
    acquisitionMethod: string;
    originalDigest: string;
  };
  conversion: {
    convertedContent: string;
    convertedDigest: string;
    converterId: string;
    converterVersion: string;
    provenance: string;
  };
  freshness: IngestionFreshness;
  connectorFailure?: { code: string; retryable: boolean };
}

export function acceptIngestionEnvelope(envelope: IngestionEnvelope): Readonly<IngestionEnvelope> {
  const sha256 = /^sha256:[0-9a-f]{64}$/;
  if (!envelope?.source?.provider || !envelope.source.identity || !envelope.source.version) throw new Error("INGESTION_SOURCE_BINDING_INCOMPLETE");
  if (!envelope.source.acquiredAt || !envelope.source.acquiredBy?.id || !envelope.source.acquisitionMethod) throw new Error("INGESTION_ACQUISITION_PROVENANCE_INCOMPLETE");
  if (!sha256.test(envelope.source.originalDigest) || !sha256.test(envelope.conversion?.convertedDigest)) throw new Error("INGESTION_DIGEST_INVALID");
  if (!envelope.conversion.converterId || !envelope.conversion.converterVersion || !envelope.conversion.provenance) throw new Error("INGESTION_CONVERSION_PROVENANCE_INCOMPLETE");
  if (!["current", "stale", "indeterminate"].includes(envelope.freshness)) throw new Error("INGESTION_FRESHNESS_INVALID");
  return deepFreeze(structuredClone(envelope));
}
