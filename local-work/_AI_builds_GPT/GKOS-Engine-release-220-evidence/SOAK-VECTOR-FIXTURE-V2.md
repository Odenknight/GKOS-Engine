# Separately versioned soak vector fixture

Both original24h runs failed at cycle14 after28minutes. Their data, plans,
receipts, logs and exact v1harness are preserved. The fixture mapped text to
[length, first character], which encoded no topic relevance. When the changed
note reached revision10, its vector ranking shifted and another valid semantic
hit won rank1; the literal query match was still present at rank2. The bounded
read-only diagnostic is soak-failure-ranking-diagnostic.json. This did not
establish missing data or failed citation verification in production.

The new gkos-native-soak-onehot128/2 fixture encodes each of128 synthetic topics
as a separate orthogonal axis. The query and intended document have dot product1;
other topics have dot product0. Independent dot-product checks cover revisions
0,9,10,99,100,999 and1000. Both pilot and long run start at revision8 so the old
9-to-10 failure boundary occurs within the short pilot. Model identity and
dimensions change explicitly, producing a separately bound fixture generation.

The exact first-hit literal citation assertion, complete hit-digest equality,
ordered graph convergence, incremental work checks,500ms coordinator p95,
resource caps and full24h duration remain. No production source, package,
frozen2.1.2 evidence or2.2 observation fixture is modified. A successful new
pilot is required before entirely new24h runs; elapsed time from the failed
runs cannot count toward qualification. No actual ONNX inference claim is made.
