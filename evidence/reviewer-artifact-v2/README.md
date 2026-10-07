# Bounded artifact boundary evidence — 2026-10-07

Base: Engine `f4234966ae4089b46a57a7977971de94eea47d6c`.
Applicable standard/schema/registry pin:
`b308ff7137bdbb109c31f0ace7e6c49b8988e0d5`.

- `npm run typecheck`: PASS.
- `npm run build`: PASS; browser/root bytes unchanged.
- `node --test test/reviewer-artifacts.test.mjs test/reviewer-contract.test.mjs test/public-api.test.mjs test/compatibility-baseline.test.mjs test/canonical-cbor-runtime.test.mjs`:
  Node24.18.0/Unicode17, 28/28 PASS, zero skips/cancellations.
- Actual Node22.23.2/Unicode17 artifact cases: 10/10 PASS, zero skips.
  Executable: npm-cache `_npx/5dad66f2cb301fc2/node_modules/node/bin/node.exe`.
- Actual Node23.11.1/Unicode16 profile refusal: 1/1 PASS, zero skips;
  no fabricated canonical binding digest. This is a negative capability probe,
  not supported Node23 deployment qualification. Executable: npm-cache
  `_npx/73a293fa64891ed0/node_modules/node/bin/node.exe`.
- `GKOS_CANONICAL_PYTHON=<isolated .reviewer-venv/Scripts/python.exe> node scripts/verify-reviewer-artifact-cross-language.mjs`:
  all five role byte/rendering round trips PASS and displayed-hash tampering
  refused. Python uses actual Unicode17 data. Captured report is adjacent.
- `npm run pack:check`: PASS, 668 files / 6,937,971 unpacked bytes.
- Package self-import `gkos-engine/governance/artifacts` and actual capability
  probe: PASS, all five adopted role names, actual Unicode17 available.
- `git diff --check`: PASS.

Root bundle SHA256:
`149e4a8efa265a6d17ded4330acac6553877ac80f5f87c06ae6a5dfaf4365621`.
New host artifact bundle SHA256:
`8ce2205fab176c6c428f22f51056fca126cbe53b6e827d22ce962d45ecda6d32`.

Two premature probes during an unfinished build failed ENOENT; they are not
semantic qualification results. The completed sequential probes above used
the final bundle. The earlier experimental supersession mapping for generic
holds was rejected during parent review and removed before this evidence.
Product readiness/control failures remain restrictive signed product evidence;
they do not acquire a registered supersession gate by renaming.

This evidence does not establish full profile qualification, an independent
organizational assessment, deployed HTTP integration, physical route availability,
retrieval workload completion, a timed soak or human outcomes. The separate
Observatory integration and independently authored semantic Python replay must
execute against the immutable successor source/artifact pin.
