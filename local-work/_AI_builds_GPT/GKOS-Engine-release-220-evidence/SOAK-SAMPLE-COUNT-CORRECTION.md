# Soak percentile sample count

The v2 Windows pilot reached862.47ms for its highest of5 queries at cycle8.
With nearest-rank estimation, p95 of5 is the maximum; this differed from the
established observation's50 samples and rank48. Its failed receipt is retained.
The Linux5-samplepilot passed. No production defect or hardware cause is inferred
from the single maximum value; the earlier5 raw values were not retained.

The corrected harness performs50 measured coordinator searches per cycle,
retains every latency even when the threshold fails, and computes p95 at index47
and p50 at index24, as in the existing2.2 observation. Strict p95<500ms is unchanged.
Maximum and p99 are also recorded. This increases measured query work tenfold.
All other assertions, the30second cycle bound and24hour requirement remain.
Fresh pilots must pass; no elapsed time or passing samples from failed runs carry
forward. Archived harness: native-soak-ea05531-onehot-v2-five-sample.mjs.
