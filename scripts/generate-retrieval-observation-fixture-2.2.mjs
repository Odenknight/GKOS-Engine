import assert from 'node:assert/strict';
import { observation22Material } from './observation-2.2-material.mjs';
import { expectedPerformanceCoordinates as historicalCoordinates } from './generate-retrieval-observation-fixture.mjs';
export {
  buildPerformanceCorpus, indexRequestSequenceDigest, performanceQueryCycle,
  queryAttemptSetDigest, resultSetDigest, sampleVectorDigest,
  PERFORMANCE_POLICY_DIGEST, PERFORMANCE_EVALUATION_DIGEST, PERFORMANCE_VAULT_ID,
} from './generate-retrieval-observation-fixture.mjs';

export const PERFORMANCE_GENERATOR_VERSION = 'gkos-retrieval-evaluation-performance-generator/2.2.0';
export const PERFORMANCE_FIXTURE_VERSION = 'gkos-retrieval-evaluation-performance-fixture/2.2.0';
export const PERFORMANCE_SAMPLE_PLAN_VERSION = 'gkos-retrieval-evaluation-performance-sample-plan/2.2.0';
export const PERFORMANCE_FIXTURE_DIGEST = 'sha256:77a44ecebbe910d5ad0b5f96586f26b4519a23ab1b25e2e63650bd7b2e226134';
export const PERFORMANCE_CONFIGURATION_DIGEST = 'sha256:4a10839a307698bc010d55b6a05fce087970258e9e219cc5207c2f77fb4be9b0';
export const PERFORMANCE_SAMPLE_PLAN_DIGEST = 'sha256:fc8f3069d7161b7a31435f494f32693263b37504a94e0064adf277604d4c9f9b';
export const PINS = Object.freeze({
  fixture_digest: PERFORMANCE_FIXTURE_DIGEST,
  configuration_digest: PERFORMANCE_CONFIGURATION_DIGEST,
  sample_plan_digest: PERFORMANCE_SAMPLE_PLAN_DIGEST,
  initial_projection_digest: 'sha256:07115aadce8907fbb5829bc7ec6927c458f4a7df0facd6d9f85a711c84c97cec',
  updated_projection_digest: 'sha256:f325bf421c63be624c5c33bdba9d5d98f62f76c996d1b529d2558ab5345ccb17',
});
// A changed implementation cannot choose its own expected digest. Every oracle
// preimage must reproduce these reviewed constants before indexing can begin.
let material;
function checked() {
  if (!material) {
    const candidate = observation22Material();
    assert.deepEqual(candidate.pins, PINS, 'OBS_FIXTURE_INVALID');
    material = candidate;
  }
  return structuredClone(material);
}
export const performanceFixtureMaterial = () => checked().fixture;
export const performanceSamplePlan = () => ({ ...checked().plan, sample_plan_digest: PERFORMANCE_SAMPLE_PLAN_DIGEST });
export const expectedPerformanceManifests = () => checked().manifests;
export const expectedPerformanceCoordinates = () => ({ ...historicalCoordinates(), index: checked().plan.indexing });
