# README reconciliation v2 — applicability and evidence

Status: Phase 10 review artifacts only. These patches are not authorization to
apply, commit, push, merge, tag, release, publish, deploy, activate a service,
or perform external effects.

## Outputs

| Repository | Successor patch | Exact base | Base `README.md` blob | Result blob | Diff |
| --- | --- | --- | --- | --- | --- |
| GKOS-Engine Full | `GKOS-Engine-README-reconciliation-v2-phase10.patch` | `7b5262baee9fcda23d50b0cee0c4977d6e4305e7` | `a3a388e240edbcf59bc6b578083d4c70a01a1e4f` | `baea4a79c630d4c90a46a514ef01706ac7a62d55` | 114 insertions, 16 deletions; `README.md` only |
| GKOS-Engine-Lite | `GKOS-Engine-Lite-README-reconciliation-v2-phase10.patch` | `a39f14d1394e3dd8f8dada8bec77bd995b1a0bc4` | `446cd5d1f9f79dff76aa1e268b1f51551c7dd6cb` | `47d354f1cb5fbe8d3a198536639e945fc6939c19` | 116 insertions, 66 deletions; `README.md` only |

Patch SHA-256:

- Full: `00c8f55d7a22fb2a6f1abc84ed3ece5f7fb460ea284dab941e63910e96335efe`
- Lite: `ea777e0e8e9bd4c82e6fa67f67dd266213b4071135eba0a8c3222769a50d3931`

The historical patches remain unchanged:

- `GKOS-Engine-README-reconciliation.patch`:
  `755ecb1e3697c05cb72d5555edc1855b1624adf745f43b6c255cc833dc40cc70`
- `GKOS-Engine-Lite-README-reconciliation.patch`:
  `51145392b4b1a38e0a770207a32b12953b110a64303623b8e490336d4f462b83`

## Verified coordinates used in wording

- Full Phase 5 head `7b5262baee9fcda23d50b0cee0c4977d6e4305e7`;
  push run `32803396417`; PR run `32803399153`; open draft PR #30
  remains clean/mergeable and stacked on `codex/phase-4-retrieval-evaluation`.
- Lite Phase 5 implementation `6d94e40dc11e1bb43693b225e32ec6110d4e03b1`;
  successful attempt-1 run `32807434279`; evidence head
  `a39f14d1394e3dd8f8dada8bec77bd995b1a0bc4`; successful attempt-1 run
  `32808011926`; open draft PR #20 remains clean/mergeable and stacked on
  `codex/phase-4-retrieval-evaluation`.
- Full is the TypeScript contract/reference authority. Lite Rust remains a
  private conformance/verifier layer at the recorded coordinate.
- The released/current sidecar routes are GET-only `/health`, `/notes`,
  `/graph`, and `/graphiti/episodes`; `/mcp` is absent. Sensitivity is attached
  projection metadata and is not enforced as access control by `/notes` or
  `/graph`.
- No Lite npm publication, final `gkx-lite` executable, operational MCP,
  governed external-effects plane, activated Phase 5 watcher, or signed
  clean-machine package is claimed.

## Active defect status captured before wording freeze

Full's post-Phase-5 continuation has an uncommitted BOM-aware bounded-
frontmatter repair and a fenced-YAML body regression test for CLI `nav context`.
The independent and broad gates were not complete at wording freeze. The Full
patch therefore keeps CLI `nav context` behind an explicit defect gate and
does not present it as a confidentiality boundary.

Lite's active continuation preserves verifier-only/no-runtime authority and is
repairing misleading desktop/connect behavior without touching root
`README.md`. Its tests were not complete at wording freeze. The Lite patch
describes the verified base behavior, not the unqualified continuation.

## Required Phase 10 refresh placeholders

Before either patch is applied:

1. Replace the Full defect paragraph with the exact signed repair commit,
   independent review disposition, focused/broad test totals, and hosted runs.
2. Recheck the Lite sidecar routes, sensitivity behavior, npm registry status,
   watcher visibility, effects boundary, and exact Full pin against the final
   Phase 9 artifacts.
3. Replace every Phase 6-9 planned statement that has become implemented with
   an exact claim-to-evidence coordinate; leave unavailable items explicitly
   unavailable.
4. Re-run installation, CLI examples, clean-machine packaging, links,
   nomenclature, licenses, SBOM/checksum, and Full/Lite reciprocal checks.
5. If either base README blob has changed, do not force-apply this patch.
   Rebase the wording against the new exact head and regenerate the patch.

No line-number-based nomenclature exception is added. If a later Phase 10 edit
requires an exception, prefer a stable content/path rule accepted by the
repository checker; otherwise regenerate any exact-line exception after final
README layout is frozen.

## Validation performed

Both mail/unified patches were parsed by `git apply --stat` and
`git apply --numstat`. Each passed:

```text
git apply --check --whitespace=error-all <patch>
git apply --cached --check --whitespace=error-all <patch>  # isolated temp index
git apply --cached --whitespace=error-all <patch>          # isolated temp index
git diff --cached --check
```

The checks were run against temporary repositories containing the exact base
README blobs. Read-only `git apply --check` also passed in both designated
target worktrees. Neither target README, index, branch, nor historical patch
was modified.
