# SRTP draft field and fixture traceability

**Status:** proposal handles only; no requirement identifier below is allocated
in `requirements/REGISTRY.md`.

| Proposal handle | Draft fields / graph rule | Positive fixture | Negative fixture(s) |
| --- | --- | --- | --- |
| `SRTP-PRESERVE` | snapshot digests, source revision, custody, retrieval, raw artifact/source digests | `SRTP-P01` | `SRTP-N01` |
| `SRTP-EXECUTION` | separate request/manifest; code, data, environment, parameters, seed; event chain; explicit run state | `SRTP-P01`, `SRTP-P03` | `SRTP-N01`, `SRTP-N02`, `SRTP-N03` |
| `SRTP-ARTIFACT` | producing event plus code/data/environment and displayed/registered digest equality | `SRTP-P01` | `SRTP-N04` |
| `SRTP-REVIEW` | deterministic evaluation, reviewer independence, separate approval, numeric evidence | `SRTP-P01` | `SRTP-N05`, `SRTP-N06`, `SRTP-N07` |
| `SRTP-RESULT` | explicit success/failure/partial/null/inconclusive/terminated and queryable `NegativeResult` details | `SRTP-P02` | — |
| `SRTP-RERUN` | intended-equivalent inputs, byte/tolerance mode, difference digest, explicit evaluation | `SRTP-P05`, `SRTP-P06` | — |
| `SRTP-REENTRY` | authorized-use, context, exact manifest/event source set, exact run-artifact set; complete/partial/unavailable state | `SRTP-P01` | `SRTP-N08`, `SRTP-N11`, `SRTP-N13`–`SRTP-N16` |
| raise-only sensitivity invariant | `sensitivity`, `derived_sensitivity`, context/use/receipt propagation | `SRTP-P01` | `SRTP-N09` |
| purpose-bound context invariant | context ID/digest, purpose, recipient, versions, warnings, omissions, expiry | `SRTP-P01` | `SRTP-N10` |
| branch-preserving lineage | branch IDs, predecessor arrays, typed contradiction/support edges | `SRTP-P04` | — |
| `SRTP-VERSION-MATRIX` | distinct publication, namespace, projection, package, and API-symbol coordinates | `SRTP-P01` | `SRTP-N12` |

Schema mapping:

| Scientific object | Draft schema | Primary GKOS responsibility |
| --- | --- | --- |
| Research question, hypothesis, method, protocol, observation | `research-object.draft.schema.json` | L2/L3 |
| Dataset snapshot | `dataset-snapshot.draft.schema.json` | L1/L2 |
| Environment snapshot | `environment-snapshot.draft.schema.json` | L1/L2 |
| Execution request | `execution-request.draft.schema.json` | L5/L7 |
| Execution manifest and event | `execution-manifest.draft.schema.json`, `execution-event.draft.schema.json` | L7 then new L1 evidence |
| Artifact | `artifact-record.draft.schema.json` | L1/L2 |
| Reviewer finding and rerun comparison | `reviewer-finding.draft.schema.json`, `rerun-comparison.draft.schema.json` | L4 |
| Result / negative result | `result.draft.schema.json` | L2/L3 |
| Re-entry receipt | `reentry-receipt.draft.schema.json` | L7-to-L1 binding experiment |
| Complete graph | `scientific-trace-manifest.draft.schema.json` | Cross-layer trace |
