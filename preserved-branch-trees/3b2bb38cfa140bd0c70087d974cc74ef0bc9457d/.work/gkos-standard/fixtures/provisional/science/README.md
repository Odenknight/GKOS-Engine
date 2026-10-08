# SRTP draft graph fixtures

**Status:** provisional, informative, non-qualifying

`srtp-p01-complete.json` is a complete materialized graph. Other fixtures use a
small `extends` plus JSON-pointer mutation format; the SRTP draft runner
materializes each graph before schema and semantic evaluation. This keeps the
authorization, context, event, artifact, result, and re-entry bindings visible
without duplicating a large base graph.

Catalog `SRTP-DRAFT-FIXTURES-0.1.1` deliberately declares
`qualifying_profiles: []`. Fixture PASS means
the draft runner observed the expected positive behavior or caught the expected
negative condition. It does not mean the scientific claim is true, reproducible,
or conformant to a ratified GKOS profile.
