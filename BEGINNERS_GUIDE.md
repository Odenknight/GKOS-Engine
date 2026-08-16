# Beginner's guide to GKOS-Engine Navigation

This guide helps you safely explore a folder of Markdown notes with
GKOS-Engine 2.1.0. You do not need to understand GKOS layers or governance
internals before trying the read-only commands.

## What Navigation is

A map of content, or MOC, is a note that links to other notes. Navigation can
find likely MOCs, propose consistent MOC content, show differences between two
folders, audit common problems, and assemble a limited context pack.

Version 2.1 does not apply any proposed content. Think of it as an inspector
and planner: it can show what it would produce, but it cannot edit your notes.

## Before you start

Install Node.js 22, 23, or 24. Then open a terminal in the GKOS-Engine folder
and run:

```sh
npm ci
npm run build
```

Use a test notes folder for your first run. The examples below call it
`./my-notes`; replace that path with your folder.

## 1. Scan your notes

```sh
node bin/gkx.mjs nav scan ./my-notes
```

The result lists discovered entries, classifications, management style,
evidence, and findings. Navigation recognizes exactly these built-in filenames,
ignoring case and the `.md` or `.markdown` extension:

- `index`
- `_index`
- `readme`
- `moc`
- `contents`

Older heuristic names such as `home`, `map`, `overview`, `dashboard`, `start`,
and `toc` are not silently treated as MOCs. They are flagged so a human can
decide whether the whole vault should promote that basename.

## 2. Audit the vault

```sh
node bin/gkx.mjs nav audit ./my-notes
```

An audit reports issues but never fixes them. A finding includes a code,
severity, path, explanation, and `autoFix: false`. Review errors first, then
warnings. A clean result is an empty JSON array.

## 3. Preview generated MOCs

```sh
node bin/gkx.mjs nav render ./my-notes --stdout
```

This prints a candidate set. Each candidate includes:

- the proposed target path;
- the exact candidate text;
- a SHA-256 digest;
- the source snapshot and configuration it was based on; and
- exact references to included sources.

`--stdout` is required because 2.1 has no file-output or apply mode. Copying or
applying the text yourself is a separate human action outside the command.

## 4. Compare two snapshots

If you have two folders representing before and after states:

```sh
node bin/gkx.mjs nav diff ./notes-before ./notes-after
```

The output uses reasons such as `MOVE_STABLE_ID`, `CONTENT_CHANGED`, `ADDED`,
and `REMOVED`. A move backed by a stable GKX identity is stronger evidence than
an exact-content move observation. Navigation never uses similarity to invent
identity.

## 5. Build public-only context

```sh
node bin/gkx.mjs nav context ./my-notes \
  --recipient alice \
  --purpose research \
  --stdout
```

The CLI only allows sources whose sensitivity is explicitly `public`. Missing,
denied, or uncertain access fails closed. Protected notes are removed before
relationships and counts are assembled, so their existence is not indirectly
revealed.

The result is a Navigation Context Pack. It is not a GKOS Context Manifest and
does not grant Layer-6 authority.

## 6. Understand re-entry plans

Re-entry is for a human-edited artifact that should be considered as new source
evidence. The command needs exact predecessor and new-source bindings:

```sh
node bin/gkx.mjs nav reentry-plan \
  --predecessor 018f0000-0000-7000-8000-000000000010 \
  --predecessor-version 1 \
  --predecessor-digest sha256:PREDECESSOR_DIGEST \
  --input ./edited-note.md \
  --new-source-id 018f0000-0000-7000-8000-000000000011 \
  --new-source-version 1 \
  --acquired-at 2026-08-16T12:00:00Z \
  --actor alice
```

The result proposes a new Layer-1 source. It does not merge into, edit, delete,
or inherit standing from the predecessor. It also does not infer supersession.
A lineage effect needs a separate explicit human declaration or valid bounded
delegation through a host application.

## 7. Understand name promotion

If `overview.md` is a deliberate vault-wide MOC convention, start by creating a
proposal:

```sh
node bin/gkx.mjs nav promotion-plan \
  --proposal-id 018f0000-0000-7000-8000-000000000020 \
  --operation-id 018f0000-0000-7000-8000-000000000021 \
  --vault-id my-vault \
  --name overview \
  --actor alice \
  --proposed-at 2026-08-16T12:00:00Z
```

This is only a plan. A host must authenticate the human decision, create the
next versioned configuration and receipt role, append them through its explicit
Governance Store, and verify durable binding. The CLI cannot commit a
promotion.

## What commands cannot do

These Navigation mutations are intentionally unavailable and rejected:

```text
gkx nav write
gkx nav apply
gkx nav delete
gkx nav record
gkx nav archive-delete
gkx nav rollback
gkx nav moc-apply
```

There is also no Navigation `--out` or `--watch` mode. Source-content writing,
archival, locking, stale-plan enforcement, and rollback belong to a separately
reviewed future executor.

## Where to go next

- [README.md](README.md) gives the general product overview.
- [TECHNICAL_README.md](TECHNICAL_README.md) explains APIs, deterministic
  behavior, Governance Store integration, delegation, and evidence standing.
- [`docs/NAVIGATION-CONTRACT.md`](docs/NAVIGATION-CONTRACT.md) states the Engine
  integration contract.
- [`docs/NAVIGATION-AUTHORITY-BOUNDARY.md`](docs/NAVIGATION-AUTHORITY-BOUNDARY.md)
  explains what may and may not change state.
