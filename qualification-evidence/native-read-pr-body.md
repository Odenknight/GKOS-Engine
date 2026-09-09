Native filesystem retrieval currently reads admitted sources serially. This change allows four concurrent reads only for Engine-created native readers, after source/chunk policy, filters and temporal admission. It preserves every filesystem and citation check, drains outstanding reads, and retains serial custom-callback and repeated-path behavior.

Two alternating serial/native trials on the same static128-source public fixture measured native p9594–97ms versus serial182–196ms, with all reads inside the timer and identical results across200queries. The earlier Windows soak p95534ms failure remains unexplained; this improvement does not invalidate that failed evidence.

Validation:87retrieval/security tests pass on each Windows Node22/24, including three new deterministic bound/order/drain/compatibility tests. Typecheck, build, package, license, nomenclature and governed-inventory checks pass. Exact-commit hosted checks are starting.

This PR targets the qualification branch behind #48, so its five-file delta can be reviewed independently. The live ea05531 candidate and Linux soak remain unchanged. Adoption requires qualification of f7d80e6fce1b905a42c54423ef8ec4b7fc18fc22 and its newly packed artifact, including new soak evidence; prior-source results cannot transfer. No tag or package publication is requested by this PR.

Refs #44 and #48. Details: docs/NATIVE-RETRIEVAL-READ-REMEDIATION.md.