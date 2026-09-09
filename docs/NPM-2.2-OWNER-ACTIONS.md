# Engine 2.2 trusted publication setup

Publication is blocked until the entire release inventory passes at one exact
commit. The workflow alone does not establish that qualification. There is no
token fallback. npm currently lists 2.0.1 as latest; recheck immediately before
publication. Local `npm whoami` returned E401 on September 8.

Owner account checklist:

- Sign into npmjs.com as the owner/maintainer of the unscoped public
  `gkos-engine` package. Run `npm whoami` from that authenticated owner session
  and retain its result with the qualification evidence. Do not save credentials
  in repository files.
- In package Settings → Trusted publishing, add GitHub Actions with owner
  `Odenknight`, repository `GKOS-Engine`, workflow filename
  `npm-release-2.2.yml`, environment `gkos-engine-release`.
- Keep account 2FA and package publishing protection enabled. Confirm the exact
  trusted-publisher match. No alternative npm token should take over on failure.
- Configure GitHub environment `gkos-engine-release` with required reviewer
  Odenknight and only the protected tag `v2.2.0`. Protect that tag against update
  and deletion. Confirm intended branch/tag policy before any tag push.
- Set environment `GKOS_RELEASE_ALLOWED_SIGNERS` to the approved SSH tag-signing
  principal and public key. Set `GKOS_220_APPROVAL_JSON` only after reviewing
  the exact candidate and all evidence. Its schema is validated by
  `scripts/release-220-preflight.mjs`; do not fabricate PASS entries for gaps.

The approval record identifies the exact source commit, tarball SHA-256 and
SHA-512 integrity, canonical file-inventory digest, immutable GitHub Actions
evidence artifact ID and ZIP digest, and each named gate's bound receipt digest
and evidence URL. The soak must cover at least 86,400 seconds with zero unexplained
failures. Experimental Node 26 is not substituted for mandatory Node 22/24.
The record is external to the candidate to avoid self-referential commit or
tarball hashes. Source changes invalidate it.

`npm-release-2.2.yml` requires an annotated SSH-signed v2.2.0 tag, verifies it
against the protected signer record and approved commit, downloads the exact
qualified evidence bundle, reruns release gates, packs once, checks both digests
and the bounded inventory, dry-runs publication, then publishes that same file
to the public registry with `latest`. Missing approval/signers, existing 2.2.0,
dirty source, mismatched evidence or artifact all refuse publication. GitHub's
older sidecar workflow also reacts to version tags; its behavior must be
reconciled in the final release review before the tag is pushed.

npm Trusted Publishing requires compatible Node/npm versions and automatically
generates provenance. This workflow pins npm 12.0.2 on Node 24; it does not inject
a provenance substitute. See [npm trusted-publisher documentation](https://docs.npmjs.com/trusted-publishers/).
Local owner-account verification is separate from the job's OIDC publish
identity; a local E401 must not be relabeled a successful owner check.

After publication, compare registry integrity/tarball bytes and run fresh Linux
and Windows consumer smoke tests before recording a successful release or
updating Kosmos. Never move the tag or attempt to reuse an npm version.
