/**
 * Single source of truth for the GKOS Engine's own version identity.
 * Tracks package.json's "version" field — bump both together. Consumers
 * (Kosmos-Oden, GKOS-Engine-Lite) have their own separate version constants
 * for their own product identity; this one is the engine's alone.
 */
export const ENGINE_VERSION = "1.0.5";
export const ENGINE_NAME = "gkos-engine";
