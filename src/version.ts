/**
 * Single source of truth for GKOS-Engine's own version identity.
 * Tracks package.json's "version" field — bump both together. See VERSIONING.md.
 * Downstream products own their release cadence and pin policy independently.
 * In particular, a GKOS-Engine release must not imply a change to a frozen
 * consumer's exact Engine pin.
 */
export const ENGINE_VERSION = "2.1.0";
export const ENGINE_NAME = "gkos-engine";

/** Public GKX naming generation used by the Engine 2.x breaking namespace. */
export const GKX_PUBLIC_NAMESPACE = "2.0" as const;

/**
 * Machine-readable companion to docs/VERSION-PROFILE-COMPATIBILITY.md.
 * These identifiers describe different layers and must never be substituted
 * for one another or used to rewrite stored records.
 */
export const VERSION_PROFILE_COMPATIBILITY = Object.freeze({
  enginePackageVersion: ENGINE_VERSION,
  publicExchangeNamespace: GKX_PUBLIC_NAMESPACE,
  validatingProjectionProfile: "gkx-2.3-validating-projection",
  validatingProjectionApi: "buildGkx23Projection",
  srtpDraftProjectionCoordinate: "gkx-2.0-validating-projection",
  legacyFlatRecordVersion: "2.2",
  experimentalScienceProfile: "SRTP-DRAFT-0.1",
});
