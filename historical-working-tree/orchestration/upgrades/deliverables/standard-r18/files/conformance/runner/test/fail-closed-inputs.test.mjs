import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
// Optional immutable checkout for running this exact regression suite red without
// copying tests into (or changing) preserved audit evidence.
const moduleURL = name => process.env.GKOS_TEST_BASELINE
  ? pathToFileURL(resolve(process.env.GKOS_TEST_BASELINE, "conformance/runner", name))
  : new URL(`../${name}`, import.meta.url);
const { evaluateGate } = await import(moduleURL("gate-evaluator.mjs"));
const { canonicalEncode, verifyCanonicalBytes } = await import(moduleURL("canonical.mjs"));
const { evaluateAuthorityWindow } = await import(moduleURL("authority-window.mjs"));
import cbor from "cbor";

const cases = JSON.parse(readFileSync(new URL("../../../fixtures/track-a/cases.json", import.meta.url))).cases;

test("known gate missing and mistyped required evidence always refuses without throwing", async t => {
  for (const fixture of cases) {
    await t.test(fixture.id, () => {
      for (const [field, value] of Object.entries(fixture.baseline)) {
        if (field === "kind") continue;
        const invalid = [undefined, null, {}, ...(Array.isArray(value) ? [[null], [""]] : [[]]), ...(typeof value === "boolean" ? [0, 1, "false", "true"] : typeof value === "number" ? [false, "2", NaN, Infinity, -1] : [false, 17, ""])];
        for (const replacement of invalid) {
          const input = { ...fixture.baseline, [field]: replacement };
          // HOLD validity evidence uses L4-001 before retention-conflict L4-002.
          const expected = input.kind === "hold" ? "GKOS-GATE-L4-001" : fixture.expected;
          assert.equal(evaluateGate(input), expected, `${field}=${String(replacement)}`);
          assert.equal(evaluateGate(input), expected, "repeat must be deterministic");
        }
      }
    });
  }
});

const invalidTimes = ["2026-99-99T12:00:00.000000Z", "2026-02-29T12:00:00.000000Z", "1900-02-29T12:00:00.000000Z", "2026-04-31T12:00:00.000000Z", "2026-01-00T12:00:00.000000Z", "2026-01-01T24:00:00.000000Z", "2026-01-01T12:00:60.000000Z", "2026-01-01T12:00:00.000000Z\n"];
test("impossible timestamps refuse in encoder, verifier, gate and authority window", () => {
  for (const value of invalidTimes) {
    assert.equal(evaluateGate({kind:"canonical-time", value}), "GKOS-GATE-L6-004");
    assert.throws(() => canonicalEncode({compiled_at:value}), /GKOS-GATE-L6-004/);
    assert.throws(() => verifyCanonicalBytes(cbor.encodeCanonical({compiled_at:value})), /GKOS-GATE-L6-004/);
    for (const field of ["valid_from", "valid_until", "evaluation_time"]) {
      const input = {...cases.find(c => c.baseline.kind === "authority").baseline, [field]:value};
      assert.equal(evaluateGate(input), "GKOS-GATE-L7-001");
      assert.equal(evaluateAuthorityWindow(input).allowed, false);
    }
  }
});

test("lone UTF-16 surrogates refuse instead of replacement encoding, including keys", () => {
  for (const value of ["\ud800", "\udfff", "a\ud800b", "\ud800\ud800", "\udfff\ud800"]) {
    assert.throws(() => canonicalEncode({text:value}), /GKOS-GATE-L6-005/);
    assert.throws(() => canonicalEncode({[value]:true}), /GKOS-GATE-L6-005/);
  }
  // Invalid UTF-8 bytes for a lone surrogate must not decode to accepted replacement text.
  assert.throws(() => verifyCanonicalBytes(Buffer.from("63eda080", "hex")), /GKOS-GATE-L6-005/);
});

test("valid leap dates, microsecond boundaries and Unicode preserve exact positive bytes", () => {
  for (const compiled_at of ["2000-02-29T00:00:00.000000Z", "2024-02-29T23:59:59.999999Z", "0096-02-29T12:00:00.000001Z"]) {
    const input = {compiled_at, text:"é😀�"};
    const expected = cbor.encodeCanonical(input);
    assert.deepEqual(canonicalEncode(input), expected);
    assert.deepEqual(verifyCanonicalBytes(expected), input);
  }
  const baseline = cases.find(c => c.baseline.kind === "authority").baseline;
  assert.equal(evaluateGate({...baseline,evaluation_time:baseline.valid_from}), null);
  assert.equal(evaluateGate({...baseline,evaluation_time:baseline.valid_until}), "GKOS-GATE-L7-001");
});

test("direct authority evaluation refuses absent records and coerced time evidence", () => {
  for (const input of [undefined, null, false, [], {}, {valid_from:{toString(){return "2026-08-29T12:00:00.000000Z";}}}]) {
    assert.equal(evaluateAuthorityWindow(input).allowed, false);
  }
});

test("sparse canonical arrays refuse without silently encoding undefined", () => {
  assert.throws(() => canonicalEncode({items:new Array(1)}), /GKOS-GATE-L6-006/);
  assert.deepEqual(verifyCanonicalBytes(canonicalEncode({items:[null, "", []]})), {items:[null, "", []]});
});

test("unregistered or absent fixture kinds cannot return the open sentinel", () => {
  for (const record of [undefined, null, [], {}, {kind:"invented"}, {kind:"constructor"}]) {
    assert.throws(() => evaluateGate(record), {name:"TypeError",message:"invalid or unknown gate fixture kind"});
  }
});
