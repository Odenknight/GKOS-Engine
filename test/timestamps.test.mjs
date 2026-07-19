import test from "node:test";
import assert from "node:assert/strict";
import { applyNoteTimestamps, isoZulu, timestampEligible } from "../dist/kosmos-core.mjs";

test("portable timestamps use canonical UTC Zulu and preserve creation",()=>{
  const fm={created_at:"2026-01-01T00:00:00.000Z"};
  assert.equal(applyNoteTimestamps(fm,0,Date.UTC(2026,6,18,12,34,56)),true);
  assert.equal(fm.created_at,"2026-01-01T00:00:00.000Z");
  assert.equal(fm.updated_at,"2026-07-18T12:34:56.000Z");
  assert.match(isoZulu(0),/Z$/);
});
test("editable OKF+ 2.2 uses its compact timestamp and does not regain beta.10 boilerplate",()=>{
  const fm={okf_version:"2.2",timestamp:"2026-01-01T00:00:00.000Z"};
  assert.equal(applyNoteTimestamps(fm,Date.UTC(2026,0,1),Date.UTC(2026,6,18)),false);
  assert.equal(fm.timestamp,"2026-01-01T00:00:00.000Z");
  assert.equal(fm.created_at,undefined);
  assert.equal(fm.updated_at,undefined);
  const missing={okf_version:"2.2"};
  assert.equal(applyNoteTimestamps(missing,Date.UTC(2026,0,2),Date.UTC(2026,6,18)),true);
  assert.equal(missing.timestamp,"2026-01-02T00:00:00.000Z");
});

test("timestamp eligibility excludes plugin and OKF internals",()=>{
  assert.equal(timestampEligible("Notes/A.md","md"),true);
  assert.equal(timestampEligible(".obsidian/plugins/x.md","md"),false);
  assert.equal(timestampEligible(".okf/diagnostics/x.md","md"),false);
});
