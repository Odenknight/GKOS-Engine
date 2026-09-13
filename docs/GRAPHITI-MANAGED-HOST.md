# Managed Graphiti implementation checkpoint

September 13, 2026. Experimental private host integration; not a completed
production service or full Graphiti roadmap qualification.

The [managed components](../services/gkos-graphiti/README.md) add transactional
job identity, bounded admission, expiring secret worker leases, per-job isolated
projections, full mapping checks, scoped publication, fresh-binding denial and
revocation/purge coordination. The private TypeScript broker reuses the existing
query contract and service scheduler. No new public package export or remote
mutation endpoint is introduced.

Local checks: 18 standard-library Python tests passed, covering ledger reopen,
competing workers, expiry, stale authority, incomplete mappings, cancellation,
cleanup, pre-copy input bounds and read-only readback API use. Eighteen broker, contract and scheduler
tests passed, including late revocation and cancelled providers retaining their
physical capacity. Typecheck, build and package checks passed.

The original cc3da85 candidate passed all 1,122 local Windows runtime tests with
no failures or skips. Subsequent Python-only resource hardening bounds metadata
and episodes before copying and caps SQLite pages at 256 MiB; its focused Python
suite passed. Full hosted checks bind the final candidate separately.

An actual synthetic managed ingestion was attempted in the existing Hive lab.
Graphiti reached extraction but the configured model request timed out. The
Windows util4 endpoint had no listener on 8080; the embedding endpoint remained
healthy. FAC chose to keep existing GPU workloads running and defer live model
qualification. This attempt is not recorded as a successful live qualification.
The reproducible qualification script preserves failures and checks exact fixture
cleanup. Existing earlier successful runner/read-only recovery receipts do not
qualify this new managed implementation.

Remaining gates include live managed ingestion, process-stop recovery and purge,
configuration/model-artifact binding, benchmark budgets and native baseline,
production broker transport/read-only instrumentation, Kosmos UI integration,
native JEFFREY/Hermes acceptance and operational/release qualification. Automatic
retry remains refused after ambiguous work. Ledger expiry fences publication;
it does not prove that an external model request or worker has stopped.

FAC also selected this Engine as the common future-product knowledge engine;
see the [adoption policy](PRODUCT-ENGINE-POLICY.md). Existing product migrations
and their qualification receipts must be completed individually.
