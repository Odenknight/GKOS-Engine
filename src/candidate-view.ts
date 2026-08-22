import type { GkxCanonicalCandidateDeclarationReceipt } from "./lineage-receipts";

type GkxScopedCandidateReceipt = Pick<
  GkxCanonicalCandidateDeclarationReceipt,
  "source_record_key" | "resolution_tiers"
>;

export interface GkxCandidateAvailability {
  known_created: ReadonlySet<string>;
  future: ReadonlySet<string>;
  unknown: ReadonlySet<string>;
}

export type GkxScopedDeclarationResolution =
  | { status: "resolved" | "self"; record_key: string; basis: string }
  | { status: "ambiguous"; basis: string }
  | { status: "suppressed_future" | "suppressed_unknown" | "unresolved" };

/**
 * Package-private scoped selection over parser-owned tiers. It never reparses
 * a reference. The first nonempty known-created tier wins; ambiguity stops at
 * that tier. Hidden candidates act absent, while future/unknown removal causes
 * remain separately classified for the temporal coordinator.
 */
export function resolveGkxScopedCandidateDeclaration(
  receipt: Readonly<GkxScopedCandidateReceipt>,
  availability: Readonly<GkxCandidateAvailability>,
): GkxScopedDeclarationResolution {
  let sawFuture = false;
  let sawUnknown = false;
  for (const tier of receipt.resolution_tiers) {
    const known = tier.candidate_record_keys.filter((key) => availability.known_created.has(key));
    if (known.length > 1) return { status: "ambiguous", basis: tier.basis };
    if (known.length === 1) {
      return {
        status: known[0] === receipt.source_record_key ? "self" : "resolved",
        record_key: known[0],
        basis: tier.basis,
      };
    }
    for (const key of tier.candidate_record_keys) {
      if (availability.future.has(key)) sawFuture = true;
      else if (availability.unknown.has(key)) sawUnknown = true;
      // Policy/filter/chunk-hidden candidates are intentionally ignored: they
      // must behave exactly like physical absence and never become a cause bit.
    }
  }
  if (!sawFuture && !sawUnknown) return { status: "unresolved" };
  if (sawUnknown) return { status: "suppressed_unknown" };
  return { status: "suppressed_future" };
}
