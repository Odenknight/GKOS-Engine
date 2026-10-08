import { evaluateGate } from "./gate-evaluator.mjs";

// Execute catalog-bound predicate twins. This establishes predicate coverage only,
// not receipts, protected-state preservation or cumulative profile qualification.
export function evaluateTrackATwins(catalog, suite) {
  const errors = [];
  const coverage = {};
  const ids = new Set();
  for (const fixture of catalog.fixtures) {
    const matches = suite.cases.filter(item => item.id === fixture.case_id);
    if (ids.has(fixture.fixture_id) || matches.length !== 1 || fixture.file !== "track-a/cases.json") {
      errors.push(`${fixture.fixture_id}: missing, duplicate or unsupported executable binding`);
      continue;
    }
    ids.add(fixture.fixture_id);
    const twin = matches[0];
    const expected = fixture.gate_expectation?.expected_codes;
    if (!Array.isArray(expected) || expected.length !== 1 || expected[0] !== twin.expected || fixture.class !== "mutation") {
      errors.push(`${fixture.fixture_id}: executable expectation differs from catalog`);
      continue;
    }
    try {
      if (evaluateGate(twin.baseline) !== null || evaluateGate(twin.mutation) !== twin.expected) {
        errors.push(`${fixture.fixture_id}: executed baseline/mutation mismatch`);
        continue;
      }
      (coverage[twin.expected] ??= []).push(fixture.fixture_id);
    } catch {
      errors.push(`${fixture.fixture_id}: executable evaluation failed`);
    }
  }
  for (const twin of suite.cases) {
    if (!catalog.fixtures.some(fixture => fixture.case_id === twin.id)) errors.push(`${twin.id}: case has no catalog binding`);
  }
  return {errors, coverage};
}
