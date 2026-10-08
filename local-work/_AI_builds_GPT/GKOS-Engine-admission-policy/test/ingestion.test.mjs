import assert from "node:assert/strict";
import test from "node:test";
import { acceptIngestionEnvelope } from "../dist/gkos-engine.mjs";

const digest = (character) => `sha256:${character.repeat(64)}`;

test("provider-neutral ingestion preserves source and conversion identity without claiming converted authority", () => {
  const envelope = acceptIngestionEnvelope({
    source: { provider: "adapter:test", identity: "document:1", version: "7", acquiredAt: "2026-08-20T00:00:00Z", acquiredBy: { id: "service:adapter", class: "service" }, acquisitionMethod: "adapter-export", originalDigest: digest("a") },
    conversion: { convertedContent: "normalized text", convertedDigest: digest("b"), converterId: "converter:test", converterVersion: "1", provenance: "provider export converted to Markdown" },
    freshness: "stale",
    connectorFailure: { code: "CONNECTOR_REFRESH_FAILED", retryable: true },
  });
  assert.equal(envelope.source.originalDigest, digest("a"));
  assert.equal(envelope.conversion.convertedDigest, digest("b"));
  assert.equal(envelope.freshness, "stale");
  assert.equal(Object.isFrozen(envelope), true);
});
