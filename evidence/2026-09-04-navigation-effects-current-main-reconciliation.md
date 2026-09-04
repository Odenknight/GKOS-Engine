# Navigation Effects current-main reconciliation evidence

Date: 2026-09-04

This candidate replays the preserved experimental Navigation Effects work onto
GKOS-Engine `main` at `8207958047b3361ae21ac07c5a2abbd26a42a684`.
The source work was preserved at `e4f00b3`; conflicts in `CHANGELOG.md`,
`README.md`, and `TECHNICAL_README.md` were resolved by retaining both the
current admission-policy material and the additive Effects boundary text.

The plane remains experimental and additive. It does not activate a writer,
grant release authority, change Navigation's existing read-only default, or
claim Standard conformance. Node filesystem execution remains behind the
explicit `navigation-effects/node` surface.

## Qualification performed

- `npm run typecheck`: PASS.
- `npm run build`: PASS, including `dist/navigation-effects.mjs` and
  `dist/navigation-effects-node.mjs`.
- Focused Navigation/Effects, architecture, public API, and compatibility
  suite: 97 tests, 97 pass, zero fail, zero skipped.
- `npm run check:license`: PASS (`Apache-2.0`).
- `npm run check:nomenclature`: PASS (zero unapproved matches).
- `npm run pack:check`: PASS (570 files, 6,586,520 bytes).

The focused suite exercises deterministic planning, capability boundaries,
path and grant validation, node execution, crash recovery, fault injection,
receipt/journal/archive tamper rejection, collision handling, symlink or
junction rejection, public exports, and the Phase 0 compatibility baseline.

## Current-main suite boundary

The unmodified current-main `npm test` command still executes the historical
Draft.1 identity assertion against the working tree. It therefore rejects the
first additive path (`.gitignore`) before it can qualify an unrelated feature
branch. That authority problem is being repaired separately by PR #39 under
the ratified Q-GUARD decision. This reconciliation does not edit or weaken the
frozen historical evidence to make itself pass.

One resource-intensive watcher restart case also exceeded its 120-second
shutdown bound during the highly concurrent full run. It is unrelated to the
Effects path set. Its isolated serialized rerun passed 1/1 with zero skips in
171.97 seconds. The concurrent timeout is not represented as an Effects
qualification pass.
