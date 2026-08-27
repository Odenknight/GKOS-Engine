# Phase 6 F1 contract-pack evidence plan

This committed evidence-contract record is an input to qualification, not a qualification result. It deliberately contains no future result commit, workflow run ID, hosted artifact digest, acceptance verdict, or secret material.

Frozen input:

- Full entry: `808d875b557f4cfd2bb0addccba44d70c9748f35`
- contract: `GKOS-AGENT-IDENTITY-MCP-CONTRACT-1.0.0-draft.1`
- owner-ratification SHA-256: `3fb6b1faa26856a64564342cdfe6f231df7eddc735132949281cc4bebaf94929`
- independent D0 acceptance SHA-256: `ac8d4ab2ee960b4a6b8af50da85c0b24f271b97cb9ef977bd7ed031ea87099fb`
- governance SHA-256: `6bbbe8c4c20df32598777909619ddd003af46cdcda7c732060df0f0a9e8dda4f`

Qualification must prove deterministic two-root generation, 34/33 leaf counts, strict schemas and negatives, exact operation/tool/error/vector inventories, byte-valid canonical fixtures, secret absence, deterministic inner tar, all-and-only allowed changes, and byte-identical protected paths. Hosted receipts are downstream attestations and may not rewrite generated pack bytes.

Implementation handoff state is `F1_IMPLEMENTATION_HANDOFF_READY` only after local gates and any required hosted workflow pass. Independent review alone may issue an acceptance verdict.
