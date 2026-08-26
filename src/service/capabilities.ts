import {
  GKOS_LOCAL_SERVICE_PROTOCOL,
  type ServiceCapabilitiesDocument,
  type ServiceFeatureStatus,
} from "./types";

export interface ServiceCapabilityConfiguration {
  graphConfigured?: boolean;
  identityRuntimeConfigured?: boolean;
  mcpConfigured?: boolean;
  eventStreamConfigured?: boolean;
  proposalIngressConfigured?: boolean;
  proposalIngressAuthorized?: boolean;
  proposalIngressEnabled?: boolean;
  navigationAvailable?: boolean;
  navigationEffectsPlannerAvailable?: boolean;
  navigationEffectsAdapterConfigured?: boolean;
  navigationEffectsAuthorityConfigured?: boolean;
  navigationEffectsJournalConfigured?: boolean;
  navigationEffectsPolicyConfigured?: boolean;
  navigationEffectsRecoverySafe?: boolean;
  navigationEffectsReconciliationSafe?: boolean;
  navigationEffectsEnabled?: boolean;
}
const status = (
  available: boolean,
  configured: boolean,
  authorized: boolean,
  enabled: boolean,
  reasons: readonly string[],
): ServiceFeatureStatus => ({
  available,
  configured,
  authorized,
  enabled,
  reason_codes: [...reasons].sort(),
});

/** Deterministic capability truth. Code reachability never implies authority. */
export function buildServiceCapabilities(
  input: ServiceCapabilityConfiguration = {},
): ServiceCapabilitiesDocument {
  const graphConfigured = input.graphConfigured === true;
  const identityConfigured = input.identityRuntimeConfigured === true;
  const readEnabled = graphConfigured && identityConfigured;
  const mcpConfigured = readEnabled && input.mcpConfigured === true;
  const eventsConfigured = readEnabled && input.eventStreamConfigured === true;
  const proposalConfigured = identityConfigured && input.proposalIngressConfigured === true;
  const proposalAuthorized = proposalConfigured && input.proposalIngressAuthorized === true;
  const proposalEnabled = proposalAuthorized && input.proposalIngressEnabled === true;
  const effectsAvailable = input.navigationEffectsPlannerAvailable === true;
  const effectsConfigured = effectsAvailable &&
    input.navigationEffectsAdapterConfigured === true &&
    input.navigationEffectsAuthorityConfigured === true &&
    input.navigationEffectsJournalConfigured === true &&
    input.navigationEffectsPolicyConfigured === true;
  const effectsSafe = effectsConfigured &&
    input.navigationEffectsRecoverySafe === true &&
    input.navigationEffectsReconciliationSafe === true;
  const effectsEnabled = effectsSafe && input.navigationEffectsEnabled === true;

  return {
    schema_version: 1,
    protocol: GKOS_LOCAL_SERVICE_PROTOCOL,
    features: {
      graph: status(true, graphConfigured, identityConfigured, readEnabled,
        readEnabled ? [] : [graphConfigured ? "IDENTITY_RUNTIME_NOT_CONFIGURED" : "CORPUS_NOT_CONFIGURED"]),
      notes: status(true, graphConfigured, identityConfigured, readEnabled,
        readEnabled ? [] : [graphConfigured ? "IDENTITY_RUNTIME_NOT_CONFIGURED" : "CORPUS_NOT_CONFIGURED"]),
      graphiti_episodes: status(true, graphConfigured, identityConfigured, readEnabled,
        readEnabled ? [] : [graphConfigured ? "IDENTITY_RUNTIME_NOT_CONFIGURED" : "CORPUS_NOT_CONFIGURED"]),
      mcp: status(true, mcpConfigured, identityConfigured, mcpConfigured,
        mcpConfigured ? [] : [identityConfigured ? "MCP_RUNTIME_NOT_CONFIGURED" : "IDENTITY_RUNTIME_NOT_CONFIGURED"]),
      events: status(true, eventsConfigured, identityConfigured, eventsConfigured,
        eventsConfigured ? [] : [identityConfigured ? "EVENT_STREAM_NOT_CONFIGURED" : "IDENTITY_RUNTIME_NOT_CONFIGURED"]),
      proposal_ingress: status(true, proposalConfigured, proposalAuthorized, proposalEnabled,
        proposalEnabled ? [] : [
          !proposalConfigured ? "PROPOSAL_INGRESS_NOT_CONFIGURED" :
            !proposalAuthorized ? "PROPOSAL_INGRESS_NOT_AUTHORIZED" : "PROPOSAL_INGRESS_DISABLED",
        ]),
      navigation: status(input.navigationAvailable === true, input.navigationAvailable === true,
        identityConfigured, input.navigationAvailable === true && identityConfigured,
        input.navigationAvailable === true ? (identityConfigured ? [] : ["IDENTITY_RUNTIME_NOT_CONFIGURED"]) : ["NAVIGATION_UNAVAILABLE"]),
      navigation_effects: status(effectsAvailable, effectsConfigured,
        effectsConfigured && input.navigationEffectsAuthorityConfigured === true, effectsEnabled,
        effectsEnabled ? [] : [
          !effectsAvailable ? "NAVIGATION_EFFECTS_PLANNER_UNAVAILABLE" :
            !effectsConfigured ? "NAVIGATION_EFFECTS_NOT_CONFIGURED" :
              !effectsSafe ? "NAVIGATION_EFFECTS_NOT_SAFE" : "NAVIGATION_EFFECTS_DISABLED",
        ]),
    },
  };
}
