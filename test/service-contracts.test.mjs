import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";

import {
  buildServiceCapabilities,
  isServiceTraversalEvent,
  ServiceTraversalEventRing,
} from "../dist/service.mjs";
import { legacyViewerBinding, ServiceCredentialRegistry } from "../dist/service-node.mjs";

const ROOT = process.cwd();
const PACK = join(ROOT, "contracts/service/GKOS-LOCAL-SERVICE-1.0.0-draft.1");
const json = async (name) => JSON.parse(await readFile(join(PACK, name), "utf8"));

test("service contract is integration-only, loopback-only, and has no query token", async () => {
  const contract = await json("contract.json");
  assert.equal(contract.standing, "integration-only");
  assert.equal(contract.bind_policy, "loopback-only");
  assert.equal(contract.authentication, "authorization-bearer-header");
  assert.equal(contract.query_tokens, false);
  assert.equal(contract.event_transport.content_type, "text/event-stream; charset=utf-8");
  assert.equal(contract.event_transport.resume_semantics, "strictly-after-acknowledged-sequence");
});
test("capabilities report availability, configuration, authority, safety, and enablement separately", async () => {
  const unavailable = buildServiceCapabilities();
  assert.equal(unavailable.features.graph.available, true);
  assert.equal(unavailable.features.graph.enabled, false);
  assert.equal(unavailable.features.proposal_ingress.enabled, false);
  assert.equal(unavailable.features.navigation_effects.enabled, false);

  const plannerOnly = buildServiceCapabilities({ navigationEffectsPlannerAvailable: true });
  assert.equal(plannerOnly.features.navigation_effects.available, true);
  assert.equal(plannerOnly.features.navigation_effects.configured, false);
  assert.equal(plannerOnly.features.navigation_effects.authorized, false);
  assert.equal(plannerOnly.features.navigation_effects.enabled, false);

  const schema = await json("capabilities.schema.json");
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  assert.equal(ajv.validate(schema, unavailable), true, ajv.errorsText(ajv.errors));
  assert.equal(JSON.stringify(unavailable), JSON.stringify(buildServiceCapabilities()));
});

test("traversal event validator accepts only bounded redacted v1 envelopes", async () => {
  const event = {
    schema_version: 1,
    session_id: "session-1",
    sequence: 42,
    offset_ms: 1832,
    operation_id: "operation-1",
    agent_id: "agent-alpha",
    agent_label: "Alpha",
    tool: "gkos_record_search",
    paths: ["Guides/Torpedoes.md"],
    status: "completed",
    cost_units: null,
  };
  assert.equal(isServiceTraversalEvent(event), true);
  for (const invalid of [
    { ...event, sequence: -1 },
    { ...event, paths: ["../secret.md"] },
    { ...event, paths: ["C:/secret.md"] },
    { ...event, paths: ["%2e%2e/secret.md"] },
    { ...event, paths: ["%252e%252e/secret.md"] },
    { ...event, paths: ["bad%ZZ.md"] },
    { ...event, paths: ["CON.md"] },
    { ...event, cost_units: Number.NaN },
    { ...event, token: "forbidden" },
  ]) assert.equal(isServiceTraversalEvent(invalid), false);

  const schema = await json("traversal-event.schema.json");
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  assert.equal(ajv.validate(schema, event), true, ajv.errorsText(ajv.errors));
  for (const path of ["%2e%2e/secret.md", "%252e%252e/secret.md", "bad%ZZ.md", "CON.md", "bad\npath.md"])
    assert.equal(ajv.validate(schema, { ...event, paths: [path] }), false, path);
});

test("credential registry rejects weak and ambiguous configured bindings", () => {
  const tokenA = "a".repeat(32);
  const tokenB = "b".repeat(32);
  assert.throws(() => new ServiceCredentialRegistry([legacyViewerBinding("short")]), /CREDENTIAL_INVALID/);
  assert.throws(() => new ServiceCredentialRegistry([
    legacyViewerBinding(tokenA), legacyViewerBinding(tokenA),
  ]), /CREDENTIAL_DUPLICATE/);
  const second = legacyViewerBinding(tokenB);
  second.identity.credentialId = "credential:legacy-viewer";
  assert.throws(() => new ServiceCredentialRegistry([
    legacyViewerBinding(tokenA), second,
  ]), /CREDENTIAL_DUPLICATE/);
});

test("event ring validates time, sorts paths, and isolates failing listeners", () => {
  assert.throws(() => new ServiceTraversalEventRing(0), /CAPACITY_INVALID/);
  assert.throws(() => new ServiceTraversalEventRing(1, -1), /START_INVALID/);
  const ring = new ServiceTraversalEventRing(2, 1000);
  let observed = 0;
  ring.subscribe(() => { throw new Error("observer failure"); });
  ring.subscribe(() => { observed++; });
  const event = ring.append({
    session_id: "session-1", operation_id: "operation-1", agent_id: "agent-alpha",
    agent_label: "Alpha", tool: "gkos_record_validate", paths: ["z.md", "ä.md", "a.md"],
    status: "completed",
  }, 1001);
  assert.equal(observed, 1);
  assert.deepEqual(event.paths, ["a.md", "z.md", "ä.md"]);
  assert.equal(ring.after(0).length, 1);
});
