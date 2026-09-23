# Assessment: Disposition Sidecar as a GKOS Engine upgrade

21 September 2026. Assessment of the user-supplied draft, identified there as `7496276d-425c-4099-9c41-bee58ae3d268`. Recommendation: retain the architecture and incorporate the revised requirements below into the Engine upgrade plan. This assessment is not the acceptance of that proposal, a new grant, or a claim that its frontmatter validates as GKX.

This is the preserved 21 September design assessment. Model-card and fleet
claims below are historical review inputs, not fresh verification in this
repository handoff. Follow the [context summary](README.md) for the subsequent
Standard draft, unresolved policy decisions and implementation entry points.

## 1. Assessment outcome

**Proceed with the optional sidecar, captured evaluations, Engine-recomputed preset rules, assessment reuse, and scoped metadata proposals. Revise the authority, record, mutation, and qualification semantics before enabling automated disposition.**

The strongest part of the draft is the separation between model inference and deterministic enforcement. A read-only sidecar can evaluate the exact authorized snapshot while Rust and TypeScript remain testable against the same captured proposals. The new module should fit beside the existing proposal-only intelligence boundary rather than bypass it.

However, “the preset is the human disposition” collapses two different decisions. The Human Operator approves a policy and bounded delegation. Each use of that policy must still bind the particular record, evidence, actor, valid authority, and actual outcome. A future result is not automatically a personally reviewed decision of the preset author.

## 2. Standard verification resolves part of the draft's open questions

The inspected master document states **GKOS-2026-09-03 v0.81** and **GKX 2.0**, and incorporates the normative annexes and requirement registry. It does not itself contain the asserted blanket clause that a model may dispose of any record simply because a human approved the menu. [Master Standard](https://github.com/Odenknight/GKOS-standard/blob/2d62b1d3b6d19aeb45477045c1fb5e2be842e76b/standard/00_GKOS_Master_Standard.md)

The governed-state-change annex supplies two especially relevant rules: deployment policy must be explicit and versioned without redefining Standard vocabulary; and bounded supersession requires a deterministic human-governed routine predicate, with a nondeterministic checker permitted only to increase restrictiveness. That delegation is not general write authority. A model-driven threshold cannot silently replace the required predicate. [State-change and delegation annex, §§2, 5–6](https://github.com/Odenknight/GKOS-standard/blob/2d62b1d3b6d19aeb45477045c1fb5e2be842e76b/standard/annexes/Governed_State_Change_Reentry_and_Bounded_Delegation.md)

R18 separately permits qualified independent-agent review, subject to explicit grants and mandatory escalation, while excluding activation of general knowledge disposition, protected source writing, and L7 execution. The draft therefore needs to name its applicable capability and activation route rather than infer one from a preset. [R18, §§3 and 7](https://github.com/Odenknight/GKOS-standard/blob/2d62b1d3b6d19aeb45477045c1fb5e2be842e76b/decisions/R18_Track_A_GCP45_and_Authorized_Independent_Review_Development_Decision_Record.md)

The vault's `gkx_version: "2.3"` (and its legacy-prefixed twin key) remains a local compatibility question. Do not rename it to 2.0 and assume compatibility; identify its actual schema and migration rules. Likewise, `phi`, `kind: disposition_preset`, the sample edge syntax, and proposed fields must be validated against the intended contract. Use an experimental extension for new concepts. This assessment is plain Markdown and does not copy the draft's unverified GKX header or impersonate its original author.

## 3. Section-by-section disposition of the proposal

| Draft element | Assessment | Required revision |
| --- | --- | --- |
| Model-free Engine core; independent inference process | Retain | Allow an outer orchestrator/adapter to call the worker; core parsing, policy and replay remain model-free. |
| Sidecar has no graph/note write credentials | Retain | Enforce filesystem/network permissions; an architectural diagram alone does not remove a write path. |
| Sidecar reads through the Engine | Retain | Authenticate and authorize before protected content reaches the process. Supply the exact allowed projection and hashes. |
| Agent submits record plus preset | Revise | Server resolves eligible presets from authenticated actor, task and scope. Agent-supplied IDs are requests, not trusted policy selection. |
| Typed question sets | Retain | Add explicit abstention, input limits, evidence completeness and task-specific score semantics. |
| Preset is the human disposition | Replace | Preset approval authorizes a bounded policy; retain per-record disposition and actor attribution. |
| Human accepted preset is sufficient authority | Replace | Validate issuer authority, current grant/lease, scope, revocation, dependencies and activated capability. A reference resolving to any Decision Record is insufficient. |
| Engine recomputes table outcome | Retain | Make intervals disjoint, specify hit policy, reject ambiguity and compare all derived outputs. |
| Every allowed addition is restriction-tightening | Replace | Separate restriction changes, ordinary metadata, assertion creation and semantic supersession. Adding an edge can change meaning or disclose information. |
| Signature proves proposal trustworthiness | Narrow | It authenticates a message/key binding; it does not establish honest inference or a correct score. |
| Pass immediately writes frontmatter | Replace | Resolve required L5 review/disposition and then admit a separately scoped writer. A control receipt does not automatically satisfy every decision/effect role. |
| `actor=sidecar`, disposition attributed to human author | Revise | Record proposer, evaluator, reviewer/decider, authorizer and executor distinctly; preserve the human's policy-approval role. |
| L7 has no role | Replace | Sidecar itself has no execution authority, but committed metadata mutations need the applicable governed-effect and receipt path. |
| Frozen calibration receipt | Retain with conditions | Verify task/configuration binding and required performance, not merely presence of an ECE field or resolvable hash. |
| Fixed epsilon and universal Q8-only policy | Replace | Qualify each exact task/configuration; distinguish precision agreement, repeated-run stability, and correctness. |
| Re-entry before training | Retain | Govern a reproducible dataset snapshot; do not invent an absolute ban on graph transport. |
| All model outputs feed the graph directly | Reject | Outputs enter via validated assertions/proposals and authorized mutation boundaries. |

## 4. Why deterministic revalidation is necessary but insufficient

The draft says a wrong or compromised sidecar can do no worse than propose an allowed table outcome. That bounds the **menu of effects**, not their factual correctness or aggregate impact. A compromised worker could report 0.99 for every note and trigger mass restriction, false relationships, queue exhaustion or authorized-looking but incorrect classifications. A valid signature and matching model-pin string would not detect fabricated probabilities.

Therefore retain trusted deployment/configuration control, authenticated processing, task qualification, scope limits, per-batch/effect budgets, anomaly monitoring and an immediate suspension route. These do not prove every answer correct; they limit exposure and make errors reviewable. Stronger evidence such as isolated execution or attestation may be chosen for a deployment, but should not be implied by a signature.

The reverse failure matters too: a compromised or weak model returning low PHI probability must never create permission to disclose. Preserve existing restrictions and require independently valid access authority. Even authorized restriction-tightening can disrupt availability, so scope and batch limits remain meaningful.

## 5. Corrected preset and rule semantics

A preset should bind: identity/version/digest; owner and approval record; eligible actor roles; grant/lease references; supported object/task/lane scope; explicit allowed field operations; qualified model/runtime/template/tokenizer configuration; evidence and calibration requirements; validity/revocation; deterministic hit policy; abstention/escalation; effect budget; and reuse/invalidation rules.

For the illustrative probability bands, define exact boundaries:

- `0.85 <= p <= 1`: propose the explicitly permitted restriction increase.
- `0.15 <= p < 0.85`: HOLD and review.
- `0 <= p < 0.15`: no new restriction from this detector; preserve existing state.
- Nonfinite, missing, invalid or unsupported score: HOLD/refusal as the contract specifies.

The numbers remain illustrative, not qualified production thresholds. The draft's closed intervals overlap at 0.15 and 0.85. Its `argmax_p_min` rows also overlap without a hit policy. These ambiguities must be removed before deterministic replay.

Represent assertion insertion separately from restriction tightening. A `supersedes` candidate remains a claim and must not change effective semantic supersession merely because its score exceeds a threshold. `fact-candidate` is a proposal label, not promotion to fact.

## 6. Corrected round trip

1. Authenticate the request and resolve an eligible preset under the current actor/task/scope. Authorize protected processing before disclosure.
2. Engine supplies an exact versioned projection and evidence packet; worker records template and full qualified configuration bindings.
3. Worker returns an authenticated typed evaluation/proposal, including status and score semantics. Any proposed table result is advisory.
4. Engine validates the envelope, signature/key status, request binding, anti-replay policy, scope, source/evidence hashes, model qualification, and current preset/grant validity.
5. Engine runs mandatory controls and recomputes the matrix outcome. Missing or conflicting conditions produce a registered non-accepting receipt.
6. Required review produces a per-record append-only Decision Record, with the correct reviewer/authorizer attribution and independence checks.
7. If a write is permitted, the managed writer rechecks current authority and file revision, applies only the admitted patch, and durably binds before/after state and outcome. Receipt-binding failure must not be reported as successful commit.
8. Update the dependency index and presentation projection. Reuse eligible evidence on the next request, but recheck authority for each new effect.

The State-Change Receipt is a role: an existing artifact can satisfy it only if it carries all required bindings. The design should avoid both missing evidence and redundant records that merely duplicate the same role. [State-change annex, §1](https://github.com/Odenknight/GKOS-standard/blob/2d62b1d3b6d19aeb45477045c1fb5e2be842e76b/standard/annexes/Governed_State_Change_Reentry_and_Bounded_Delegation.md)

## 7. Model and deployment verification updates

The GGUF card now identifies **v10**, while its reported quantization comparisons are **historical v8**. Q8_0 matched BF16 on **70/71** choices, not every choice; IQ4_NL matched **59/71**. These measure agreement, not human-labeled correctness or repeated-run determinism. The v10 files have structural/conversion validation but not runtime/accuracy validation in that card. It also states that plain llama-server text generation is insufficient: option scoring uses answer-slot logits and a custom shim/server. The roughly 2 GB Q8 file size does not establish resident GPU memory or fit in 2.8 GB headroom. [GGUF model card](https://huggingface.co/cosetoenor/decider-2b-GGUF)

The cited cache issue exists and reports cross-conversation restoration under concurrent load. It is evidence for an isolation regression test, not proof that the two proposed flags solve every runtime or the custom shim's state restoration. Check the exact binary/configuration and verify request isolation. [llama.cpp issue #27148](https://github.com/ggml-org/llama.cpp/issues/27148)

GPU1 placement, co-resident services, NUMA flags, current headroom, API flags and fleet-specific kernel support remain unmeasured here. Treat the proposed systemd configuration as a deployment candidate. Reserve memory for context/state, work buffers, concurrency and other services; measure peaks under representative notes before accepting placement.

## 8. Revised fixture and gate plan

Retain separate classes for deterministic Engine replay and live sidecar qualification. Engine replay uses captured proposals and fixed time/identity inputs. Live qualification separately tests repeated-run stability, precision/backend agreement, actual labeled task accuracy, score calibration where applicable, truncation, abstention and request isolation. A 500-case failure of one Q8 configuration does not prove every bounded model is unsuitable; it disqualifies the tested configuration for the declared criterion.

Keep the draft's six gate categories as traceable proposals, but add explicit coverage for signature/key validity, unauthorized processing, malformed output, expired/revoked grants, unqualified configuration, missing evidence, ambiguous matrix rules, reviewer independence, duplicate/stale requests, write conflicts, receipt failure and resource/effect limits. Use local names until the Standard registry allocates stable codes. Do not ship `GKOS-DS-001` as if it were registered.

## 9. Engine upgrade work items

| Priority | Work item | Completion evidence |
| --- | --- | --- |
| P0 | Resolve exchange profile and experimental namespace | Schema validation and v1 compatibility fixtures. |
| P0 | Define preset, evaluation, per-record disposition and effect bindings | Owner-reviewed contracts with exact authority boundary. |
| P0 | Implement pure validation/matrix replay in TS and Rust | Same captured fixtures produce matching outcomes/refusals. |
| P1 | Add read-only scoped worker adapter | Processing authorization, outage and malformed-output tests. |
| P1 | Add reuse/dependency index | Correct invalidation and measured repeated-check reduction. |
| P1 | Qualify one model for low-impact metadata | Held-out operator labels and task-specific error budget. |
| P2 | Add bounded frontmatter writer | Ownership, CAS, receipt durability and recovery tests. |
| P2 | Activate the narrow disposition capability | Prospective authority, grants, review and portable evidence. |
| P3 | Add legal/scientific/business connectors | Separate read, review and external-effect admission evidence. |

This assessment is incorporated by reference into the Rust/TypeScript build plan and the overall design. The recommended first milestone is proposal-only classification plus reuse, followed by qualified managed tags; it is not blanket autonomous disposition.
