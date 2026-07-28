/**
 * Single source of truth for the GKOS Engine's own version identity.
 * Tracks package.json's "version" field — bump both together. See VERSIONING.md.
 * Kosmos-Oden carries its own product version. GKOS-Engine-Lite's CLI adopts
 * this engine version verbatim (its desktop app versions separately as
 * desktop-vA.B.C), so a bump here is followed by a Lite pin bump.
 */
export const ENGINE_VERSION = "1.2.0";
export const ENGINE_NAME = "gkos-engine";
