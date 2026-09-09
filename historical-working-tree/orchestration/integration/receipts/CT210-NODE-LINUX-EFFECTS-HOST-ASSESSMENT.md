# KnightsAI CT210 Node/Linux Effects host assessment

Date assessed: 2026-08-31 America/New_York (`2026-09-01T02:36:41Z` through `02:37:57Z`)  
Host coordinate: KnightsAI `192.168.5.10`, Proxmox VE `9.2.11`, CT210 `gkos-observatory`  
Disposition: **ACCEPTED FOR NL-E0 WRITES-DISABLED ASSESSMENT ONLY**  
Effects execution: **DENIED / UNQUALIFIED**  
Hosted CI runner: **NOT PRESENT / NOT QUALIFIED**

This receipt resolves the concrete-machine part of Q-EFFECTS after the owner selected KnightsAI CT210. It does not authorize a source write, vault enrollment, grant, policy, proposal persistence, service change, dependency installation, CI-runner installation, or deployment. The inspection used the existing host-root SSH authorization only for read-only `pct`, system, filesystem-metadata, service-metadata, DNS, and HTTPS checks. It did not enumerate or read files beneath the live vault bind mount.

## Source documents

- `orchestration/integration/receipts/NODE-LINUX-EFFECTS-DECISION-PACKET.md`
- `orchestration/integration/observatory/README.md`
- `orchestration/integration/observatory/DEPLOYMENT.md`
- `orchestration/integration/observatory/docs/RUNBOOK.md`
- `orchestration/integration/observatory/docs/LIVE-VAULT-ADMISSION.md`
- `orchestration/2026-08-31/GKOS-ECOSYSTEM-TS-FIRST-RUST-ROADMAP.md`
- `orchestration/2026-08-31/reports/AUDIT-ENGINE-LITE-BENCHMARK.md`
- `orchestration/integration/kosmos/docs/navigation-effects/CAPABILITY-MATRIX.md`
- `orchestration/integration/kosmos/docs/navigation-effects/IMPLEMENTATION-HANDOFF.md`
- `orchestration/integration/kosmos/docs/navigation-effects/QUALIFICATION-PLAN.md`

## Observed host and guest facts

| Topic | Direct observation | Consequence |
| --- | --- | --- |
| Hypervisor | KnightsAI; `pve-manager/9.2.11`; kernel `7.0.14-14-pve` | Concrete host is established. |
| Isolation | Running **privileged LXC**; `nesting=0`; identity map `0 0 4294967295` | CT210 is not a hostile-tenant boundary. Effects defects have greater host blast radius than in an unprivileged guest. |
| Guest | Debian GNU/Linux 13.6 (trixie), amd64; systemd 257 | Meets the selected Linux/systemd family. |
| Allocation | Proxmox config: 4 cores, 4096 MiB RAM, 1024 MiB swap; guest has 4 CPUs online and about 4 GiB RAM | Supersedes the older 2-core/2-GiB deployment table. Capacity is observed, not soak-qualified. |
| Runtime | Node `v22.23.2`; npm `10.9.8`; Node-bundled SQLite `3.51.3`; Git `2.47.3` | One supported-looking Node 22 lane is available. Node 23/24 are not installed or qualified. No standalone `sqlite3` CLI was found. |
| Network | LAN address `192.168.5.99/24`; default route `192.168.5.1`; GitHub DNS resolves; validated HTTPS request to `github.com` returned 200 | Outbound GitHub connectivity exists at the observation time. This does not prove credentials or hosted-CI execution. |
| CI tooling | No `gh` executable, actions-runner unit, or runner process was found | CT210 is not presently a GitHub Actions runner. |
| Existing workloads | Active/enabled `gkos-engine`, `observatory`, and `caddy`; Engine listens on loopback `4814`, Observatory on loopback `7002`, Caddy on 80/443 | Effects work would share a live Observatory host and must not disturb these services. |
| Engine identity | Existing `gkos-engine` UID/GID, no-login home `/var/lib/gkos-engine`; active Node process runs as that identity | The recommended separate unprivileged service owner already exists. No new identity is needed for NL-E0 inspection. |
| Engine state | `/var/lib/gkos-engine` is `0700 gkos-engine:gkos-engine`; Engine working directory is that path; unit umask is `0077` | Suitable for private service-local status and disposable NL-E0 evidence, subject to an approved subpath and capacity policy. It is not a vault or semantic authority. |
| Configuration | `/etc/gkos-engine` exists as `0755 root:root` | The root is not the proposed `0750 root:gkos-engine` default. File-level secrecy was not inspected; tightening requires a separately reviewed service change. |
| Service confinement | Engine has an empty capability bounding set, `NoNewPrivileges=yes`, `LockPersonality=yes`, and limited address families. It has `ProtectSystem=no`, `ProtectHome=no`, `PrivateTmp=no`, `PrivateDevices=no`, no `ReadOnlyPaths`, no `ReadWritePaths`, and no systemd state/runtime/configuration directories. | Existing DAC controls are useful, but the unit does not provide the path-level systemd confinement proposed for Effects. Do not add writer authority to it as-is. |

## Storage coordinates and durability facts

| Root | Direct observation | Effects standing |
| --- | --- | --- |
| `/` | `rpool/data/subvol-210-disk-0`, ZFS, 16 GiB, about 19% used | Guest root only; not an enrolled vault. |
| `/mnt/data` | `rpool/data/subvol-210-disk-1`, ZFS, 32 GiB, about 1% used, Proxmox backup flag enabled; root-owned `0755`; current `gkos-engine` can read/search but cannot write the root | Candidate for separately provisioned synthetic NL-E0 data only after an explicit subpath/owner decision. No subpath was created. |
| `/mnt/data/Oden` | Host bind mount from `rpool/data[/Oden]`, ZFS, about 664 GiB total / 475 GiB available; root `2775 root:samba-oden` on host and `root:UNKNOWN` in CT210; no ACL; current `gkos-engine` can read/search the mount root but cannot write it | Contains the documented live vault beneath `/mnt/data/Oden/_NC/Obsidian-Oden`. It is **not enrolled for Effects** and was not traversed. Existing read-only Engine admission does not authorize Effects planning or persistence against it. |
| `/srv/gkos-vaults` | Absent | The generic decision-packet convention is not deployed here. |

The three ZFS datasets observed use `recordsize=128K`, compression on, `sync=standard`, and `logbias=latency`. The pool is online on one NVMe vdev, with no known data errors; its last recorded scrub completed with zero repaired bytes and zero errors on 2026-08-09. Pool `ashift=12`, `autotrim=off`, and `failmode=wait` were observed. This is health and configuration evidence only. A single-device online ZFS pool is not redundancy, and `sync=standard` does not prove that the current Effects executor flushes the required files and containing directories or survives sudden power loss.

The historical Node executor reports `directoryFlush:false`. Nothing observed on CT210 changes that fact. No directory-fsync, atomic-replace, lock, journal-reopen, disk-full, read-only-remount, process-crash, container-crash, host-crash, or power-cut qualification was performed. Therefore `durability_qualified=false` and an outcome must not be reported committed on this host.

## Effects host decision

CT210 is the selected concrete Node/Linux host for **NL-E0 only**, with these mandatory values:

```text
effects_mode=off
writes_enabled=false
auto_maintenance=false
auto_creation=false
mcp_write_surface=false
durability_qualified=false
```

Allowed future work under the existing authorization is limited to redacted capability/status detection, deterministic planning over synthetic or disposable data, schema validation, and recovery inspection that cannot execute a recovery action. The live vault bind mount must remain outside NL-E0. No writer adapter, ownership record, grant, apply/rollback route, or live-vault Effects state may be created.

CT210 is not accepted for NL-E1 or later execution because:

1. it co-hosts the currently active Observatory and read-only Engine;
2. it is a privileged LXC with a direct host bind mount of owner data;
3. the existing Engine unit lacks explicit systemd read/write path allowlists and several proposed isolation controls;
4. the mounted filesystem and executor have no demonstrated directory-durability or crash/power-loss profile;
5. the pool has one NVMe vdev and no approved external durable checkpoint;
6. exact vault, policy, issuer, retention, backup, and recovery authorities remain unappointed.

## Owner decisions still required

1. **NL-E0 data root:** approve a new, synthetic-only service-owned subpath on the private 32-GiB `/mnt/data` dataset, or keep all NL-E0 artifacts under a bounded subpath of `/var/lib/gkos-engine`. Do not select `/mnt/data/Oden` by implication.
2. **Service boundary:** decide whether to extend the existing `gkos-engine.service` or create a separate Effects-lab unit/identity. Approve exact systemd hardening and path allowlists after compatibility testing.
3. **Live vault:** separately name an exact canonical vault and allowed generated-content targets if live planning is ever wanted. The documented live vault remains read-only and non-enrolled now.
4. **Human authority:** appoint grant issuer, reviewer, policy owner, credential provisioning/rotation/revocation, and separation-of-duties rules.
5. **Durability:** approve the required filesystem profile, directory-fsync implementation, crash/power-cut test method, archive/receipt retention, backup and restore requirements, and whether an external immutable checkpoint is mandatory.
6. **Resource isolation:** approve CPU/memory/I/O limits and a maintenance window that protect the active Observatory workload before any qualification load is run.
7. **CI role:** decide separately whether CT210 should ever become a self-hosted runner. Current outbound access is not runner qualification, and installing a runner would expand its trust and secret exposure.

## Non-mutation statement

No package was installed, no file or directory was created on CT210, no service was started/stopped/restarted, no process was signaled, no configuration or vault file was read, no credential was accessed, no mount or ZFS property was changed, and no Effects capability was enabled. The only network probe from CT210 was an unauthenticated, TLS-validated HTTPS header request to `https://github.com/`.
