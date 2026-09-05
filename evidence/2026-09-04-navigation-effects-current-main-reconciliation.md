# Navigation Effects current-main reconciliation evidence

Date: 2026-09-04

This candidate replays the preserved experimental Navigation Effects work onto
GKOS-Engine `main` at `18c53b8d553d75f03c52310f06e3c60f20f6068b`,
the exact merge of qualified current-runtime PR #39. The preserved Effects
source remains `e4f00b3`; the current-main replay commit is
`5a4df27ee1892b29ba4461b786723f60e5756db7`.

The plane remains experimental and additive. It does not activate a writer,
grant release authority, change Navigation's existing read-only default, or
claim Standard conformance. Node filesystem execution remains behind the
explicit `navigation-effects/node` surface.

## Qualification performed

- `npm run typecheck`: PASS.
- `npm run build`: PASS, including `dist/navigation-effects.mjs` and
  `dist/navigation-effects-node.mjs`.
- Focused Navigation/Effects, architecture, public API, and compatibility
  suite: 128 tests, 128 pass, zero fail, zero skipped.
- Complete serialized current-runtime suite: 1,032 tests, 1,032 pass, zero
  fail, zero cancelled, zero skipped, zero todo.
- Current-runtime change inventory: 80 reviewed candidate paths, excluding the
  inventory's self-entry; `qualify:current -- --check` passed.
- `npm run check:license`: PASS (`Apache-2.0`).
- `npm run check:nomenclature`: PASS (zero unapproved matches).
- `npm run pack:check`: PASS (572 files, 6,605,449 bytes).

The focused suite exercises deterministic planning, capability boundaries,
path and grant validation, node execution, crash recovery, fault injection,
receipt/journal/archive tamper rejection, collision handling, symlink or
junction rejection, public exports, and the Phase 0 compatibility baseline.

## Authority and hosted boundary

The Q-GUARD historical/current-runtime separation from PR #39 is preserved.
The frozen Draft.1 identity pack is unchanged; Effects paths are admitted only
through the reviewed current-runtime candidate inventory. Local qualification
does not substitute for the blocking hosted Ubuntu/Windows Node 22 and 24
matrix, which must pass at the exact published head before merge. Node 23 stays
informative, and real local ONNX remains an owner-resource qualification lane.

Effects remain an unregistered library and explicit Node adapter. Draft.2 MCP
stays seven-tool and read-only. `AgentGrant` is structural input at this stage;
it is not yet bound to the authority database, authentication epoch, live
session, or current credential status. No merge of this candidate activates a
writer, enables automatic MOC application, or authorizes owner-data writes.

## Hosted stability follow-up

The first post-rebase hosted runtime attempt at `2d79be0` passed all historical
lanes, the complete CI workflow, and both blocking Ubuntu lanes. Windows Node
24 ran 1,032 tests with 1,031 pass and one failure: the watcher latency oracle
ran immediately after the large-restart stressor and exceeded its unchanged
limit. The same exact watcher lane passed the dedicated Windows qualification.

The follow-up orders the separately isolated watcher latency process before the
large-restart stress process. It does not change an assertion, duration limit,
production behavior, or selected test. The focused local watcher observation
rerun passed 2/2. Fresh hosted qualification at the follow-up head is required;
the failed attempt remains preserved as reliability evidence.
