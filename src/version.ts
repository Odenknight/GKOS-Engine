/**
 * Single source of truth for GKOS-Engine's own version identity.
 * Tracks package.json's "version" field — bump both together. See VERSIONING.md.
 * Downstream products own their release cadence and pin policy independently.
 * In particular, a GKOS-Engine release must not imply a change to a frozen
 * consumer's exact Engine pin.
 */
export const ENGINE_VERSION = "2.0.0";
export const ENGINE_NAME = "gkos-engine";
