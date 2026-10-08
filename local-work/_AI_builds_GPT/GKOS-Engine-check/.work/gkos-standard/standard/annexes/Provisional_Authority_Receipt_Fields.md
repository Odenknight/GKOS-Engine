# Annex — Provisional authority-receipt field list

**Status:** Informative and not yet normative

This annex does not amend the Authority requirements or bind a conformance claim. It narrows the design space for a future normative authority-receipt schema while GKOS remains in pre-v1.0 development.

A future authority receipt is expected, at minimum, to carry:

`receipt_id`, `issuer`, `subject`, `actor_identity`, `authority_source`, `permitted_actions`, `resource_scope`, `purpose_scope`, `tenant_scope`, `sensitivity_ceiling`, `delegation_allowed`, `issued_at`, `not_before`, `expires_at`, `policy_version`, `revocation_locator`, `nonce_or_replay_binding`, `signature_or_attestation`.

A future normative mechanism is expected to define:

- **Attenuation:** delegated or derived receipts cannot grant broader actions, scope, duration, or sensitivity access than their source.
- **Non-transferability:** the receipt is bound to its named subject and actor identity.
- **Delegation-chain integrity:** the chain from originating grant to current receipt is reconstructable and narrows monotonically.
- **Revocation:** the issuer or a higher-precedence authority can revoke the receipt before expiry.
- **Proof of possession:** a verifier can confirm that the presenter is the legitimate holder rather than merely possessing a copied value.
- **Single use:** a one-time consequential authorization cannot be replayed.
- **Hash binding:** authorization against a proposal or target state fails if the bound content hash changes.
- **Audience and tenant binding:** a receipt cannot be replayed across an unintended service, deployment, tenant, or corpus.
- **Verification procedure:** required algorithms, trust roots, clock handling, revocation checks, and failure behavior are specified.

Candidate existing foundations include attenuated capability-token systems and grant protocols. GKOS should reuse established security mechanisms rather than inventing an unreviewed token format.

No implementation may claim conformance to this annex.
