import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';
const read=p=>readFileSync(p,'utf8').replaceAll('\r\n','\n');const put=(p,t)=>writeFileSync(p,t);let s=read('README.md');
function change(a,b){if(!s.includes(a))throw Error('Missing README target: '+a.slice(0,60));s=s.replace(a,b);}
change('# GKOS-Engine\n','# GKOS-Engine 2.2.0\n');
change('**GKOS-Engine 2.2.0** (development candidate)','**GKOS-Engine 2.2.0** (current `main` source; release qualification pending)');
const start=s.indexOf('The `main` branch contains the **2.2.0 development candidate**');const end=s.indexOf('\nRead [release status',start);if(start<0||end<0)throw Error('Status section missing');
s=s.slice(0,start)+`The current source version is **2.2.0**. The package manifest, lockfile and
runtime identity agree. As verified on September 9, 2026:

| Surface | Version and status |
| --- | --- |
| Current main source | **2.2.0**; includes the changes merged through PRs #48, #49 and #50 |
| Public npm package | **2.0.1**, the current \`latest\` dist-tag; \`npm install gkos-engine\` does not install current main |
| Latest GitHub release | [2.1.1](https://github.com/Odenknight/GKOS-Engine/releases/tag/v2.1.1) |
| Newest Git version tag | \`v2.1.2\`; historical snapshot |

The 2.2.0 source includes durable managed-MOC \`NO_CHANGE\` audit receipts,
separate current and historical retrieval-observation lanes, deterministic
incremental graph convergence, bounded native retrieval reads, and the
[documentation digest verifier](docs/DOCUMENTATION-DIGEST-VERIFIER.md).
Main baseline [\`dee4a53\`](https://github.com/Odenknight/GKOS-Engine/commit/dee4a53ab8eade0e49c726d34cdc86f46e05c253)
passed CI, Linux/Windows runtime qualification, retrieval observation and native
audit checks. These results belong to that commit. The final artifact, consumer,
soak and publisher-setup gates still control an official 2.2.0 release.
`+s.slice(end);
change('| Optional intelligence |','| Documentation verification | Check exact file bytes and ordered SHA-256 manifests; validate claimed receipts against pinned v0.81 schemas | Repository tools; schema validation is not authority or profile qualification |\n| Optional intelligence |');
change('The candidate npm package is `2.2.0`.','The current source package version is `2.2.0`; npm currently publishes `2.0.1`.');
change('must handle that idempotently. Byte-identical passes avoid rewrites but do not\nyet emit dedicated durable no-op audit receipts.','must handle that idempotently. Byte-identical passes avoid source rewrites and\nemit dedicated durable `NO_CHANGE` audit receipts with operation, authority,\nownership, digest, sequence and recovery bindings. See the\n[no-change audit guide](docs/MANAGED-MOC-NO-CHANGE-AUDIT.md).');
change('Near-term work includes durable no-op audit records, measured end-to-end','Near-term work includes final-artifact qualification, measured end-to-end');
put('README.md',s);
s=read('CHANGELOG.md');s=s.replace('Development candidate; not yet a tagged or published release.','Current main source version; not yet a tagged or published 2.2.0 release.\n\n- Merged separately versioned 2.2 retrieval observation with independent digest\n  pins, real SQLite FTS5 indexing, incremental reuse and deterministic rebuild\n  checks; preserved the historical 2.1.2 replay and frozen evidence.\n- Added durable managed-MOC `NO_CHANGE` audit receipts and native recovery tests.\n- Made incremental graph ordering deterministic and bounded native source reads\n  while preserving policy admission, citation freshness and path checks.\n- Made packed-MCP qualification setup cancellable, with one explicit build\n  and bounded phase diagnostics under the unchanged deadlines.\n- Added pinned documentation digest and refusal-receipt schema verification.\n- Prepared exact-tag OIDC-only publication gates; final release qualification\n  and owner publisher setup remain required.');put('CHANGELOG.md',s);
put('docs/RELEASE-STATUS.md',`# Source and release status

Checked September 9, 2026. Current main implements Engine **2.2.0**. This source
version is distinct from the artifacts already published to npm and GitHub.

| Surface | Verified status |
| --- | --- |
| Implementation baseline | [\`dee4a53ab8eade0e49c726d34cdc86f46e05c253\`](https://github.com/Odenknight/GKOS-Engine/commit/dee4a53ab8eade0e49c726d34cdc86f46e05c253), incorporating PRs #48, #49 and #50 |
| Package, lockfile and runtime version | **2.2.0**, current source; not a published 2.2.0 artifact |
| Public npm latest | [gkos-engine 2.0.1](https://www.npmjs.com/package/gkos-engine/v/2.0.1) |
| Newest Git version tag | \`v2.1.2\`, resolving to \`7bf14b481e78c5ae9d1e14661602be4f24559d0e\` |
| GitHub latest published release | [2.1.1](https://github.com/Odenknight/GKOS-Engine/releases/tag/v2.1.1) |
| Managed MOC writes | Implemented experimental Node host; explicit ownership and authority required; durable no-change audit receipts implemented |
| MCP | Ten credential-filtered read-only tools; no agent source-write endpoints |

## Main verification

The exact baseline above passed:

- [CI](https://github.com/Odenknight/GKOS-Engine/actions/runs/34303985235).
- [Historical and current runtime qualification](https://github.com/Odenknight/GKOS-Engine/actions/runs/34303985155), including mandatory native Linux/Windows Node 22 and 24. Node 26 remains informational.
- [Engine 2.2 retrieval observation](https://github.com/Odenknight/GKOS-Engine/actions/runs/34303985108).
- [Managed-MOC native audit qualification](https://github.com/Odenknight/GKOS-Engine/actions/runs/34303985163).

These results bind that revision. Documentation updates and subsequent source
changes have their own checks; earlier results do not certify a new artifact,
consumer installation, physical power-loss safety or a completed 24-hour soak.

## Implemented and remaining

Main now includes the separate [2.2 observation lane](OBSERVATION-2.2-QUALIFICATION.md),
[durable no-change audits](MANAGED-MOC-NO-CHANGE-AUDIT.md), deterministic graph
convergence, bounded native retrieval reads, and the
[documentation verifier](DOCUMENTATION-DIGEST-VERIFIER.md). Historical 2.1.2
fixtures and replay remain separate. See [current capabilities](CURRENT_CAPABILITIES.md).

An official 2.2.0 release still requires the exact final candidate and tarball,
complete native durability/performance and consumer evidence, a full 24-hour
soak, exact Kosmos integration, and owner trusted-publisher/protected-environment
setup. [Issue #44](https://github.com/Odenknight/GKOS-Engine/issues/44) controls the
remaining inventory. The prepared OIDC workflow refuses incomplete approval or
mismatched source/artifact identity.

Developers using main should record an exact commit. Consumers selecting a
published package should use an immutable version and integrity pin. Existing
tags and releases remain historical; this documentation does not create or move
a tag, publish a package, grant write authority or establish GKOS conformance.
`);
s=read('docs/CURRENT_CAPABILITIES.md').replace('Updated 2026-09-06.','Updated 2026-09-09.');s=s.replace('## Evidence and updates\n','## Evidence and updates\n\nThe merged `dee4a53` baseline includes the separate 2.2 observation lane, durable\nno-change audits, bounded native retrieval reads and documentation verification.\nIts CI, native runtime, observation and audit checks passed; see\n[current release status](RELEASE-STATUS.md) for exact run links and remaining gates.\n');put('docs/CURRENT_CAPABILITIES.md',s);
const p='contracts/runtime-qualification/v1/change-inventory.json';const m=JSON.parse(read(p));for(const path of ['README.md','CHANGELOG.md','docs/RELEASE-STATUS.md','docs/CURRENT_CAPABILITIES.md']){const row=m.candidate_changes.find(x=>x.path===path);if(!row)throw Error('Missing existing inventory row '+path);row.after=createHash('sha256').update(readFileSync(path)).digest('hex');row.rationale='Reconcile current main 2.2.0 source capabilities and exact passed baseline checks with separately verified npm/GitHub versions; preserve outstanding release gates and historical identities.';}put(p,JSON.stringify(m,null,2)+'\n');
