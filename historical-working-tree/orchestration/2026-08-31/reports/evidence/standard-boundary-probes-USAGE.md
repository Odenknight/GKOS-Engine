# Portable Standard boundary probes

This helper reproduces the eight observations in the audit. It is not a conformance test or an implementation fix. It makes no network calls and writes no repository files.

## Prerequisites

- Node.js 24 and Git on PATH (the audit used Node24.18.0).
- Two separately prepared Standard repository checkouts, at main commit `71b899473473f47172b181973027f3eb7da25104` and R18 commit `aa9a05315a9a767bd672aa2bb5179c963d9d66ca`.
- In the main checkout's `conformance/runner` directory, run `npm ci --ignore-scripts` to install its lock-pinned dependencies. Use an explicit writable npm cache when your environment requires it.

The helper verifies both checkout HEADs and refuses changed probe-target modules before importing them. The script's location and working directory are unrestricted when both checkout arguments are supplied; paths are repository roots, not runner directories. Relative argument paths resolve from the working directory. Neither checkout is shipped inside this report bundle.

## Published-bundle invocation

```text
node /path/to/bundle/reports/evidence/standard-boundary-probes.mjs --main-checkout /path/to/standard-main --r18-checkout /path/to/standard-r18
```

Quote paths containing spaces. Both options are required if either is supplied. `--help` works without any checkouts or installed dependencies.

With **no arguments**, the script retains the original audit-only convenience layout, resolving `../../standard-audit/gkos-standard` and `../../standard-audit/gkos-standard-r18` relative to the script file. That layout is local to this audit and is not required or expected in a published bundle; published-bundle users should supply the explicit options above.

## Result interpretation

At the audited commits, all six `gate_probes` report `observed: null` (incorrectly open), and both `canonical_probes` report `observed: "ACCEPTED"` for invalid input. JSON output records the observed checkout commits and whether explicit or local-default paths were used.

Exit0 means the diagnostic executed, **not** that the behavior passed. Exit2 means setup failed (for example incomplete options, missing dependencies/checkouts, wrong commit, or changed source). This exact-baseline helper intentionally refuses other commits; testing fixes requires a separately identified test/reproduction revision rather than silently labeling changed code with the audit's source coordinates.
