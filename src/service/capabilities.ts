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
  graphAuthorized?: boolean;
  notesAuthorized?: boolean;
  graphitiAuthorized?: boolean;
  mcpAuthorized?: boolean;
  eventsAuthorized?: boolean;
  navigationAuthorized?: boolean;
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
  const graphAuthorized = identityConfigured && input.graphAuthorized !== false;
  const notesAuthorized = identityConfigured && input.notesAuthorized !== false;
  const graphitiAuthorized = identityConfigured && input.graphitiAuthorized !== false;
  const mcpAuthorized = identityConfigured && input.mcpAuthorized !== false;
  const eventsAuthorized = identityConfigured && input.eventsAuthorized !== false;
  const navigationAuthorized = identityConfigured && input.navigationAuthorized !== false;
  const mcpConfigured = graphConfigured && identityConfigured && input.mcpConfigured === true;
  const eventsConfigured = graphConfigured && identityConfigured && input.eventStreamConfigured === true;
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
      graph: status(true, graphConfigured, graphAuthorized, graphConfigured && graphAuthorized,
        !graphConfigured ? ["CORPUS_NOT_CONFIGURED"] : graphAuthorized ? [] : ["CREDENTIAL_NOT_AUTHORIZED"]),
      notes: status(true, graphConfigured, notesAuthorized, graphConfigured && notesAuthorized,
        !graphConfigured ? ["CORPUS_NOT_CONFIGURED"] : notesAuthorized ? [] : ["CREDENTIAL_NOT_AUTHORIZED"]),
      graphiti_episodes: status(true, graphConfigured, graphitiAuthorized, graphConfigured && graphitiAuthorized,
        !graphConfigured ? ["CORPUS_NOT_CONFIGURED"] : graphitiAuthorized ? [] : ["CREDENTIAL_NOT_AUTHORIZED"]),
      mcp: status(true, mcpConfigured, mcpAuthorized, mcpConfigured && mcpAuthorized,
        !mcpConfigured ? [identityConfigured ? "MCP_RUNTIME_NOT_CONFIGURED" : "IDENTITY_RUNTIME_NOT_CONFIGURED"] : mcpAuthorized ? [] : ["CREDENTIAL_NOT_AUTHORIZED"]),
      events: status(true, eventsConfigured, eventsAuthorized, eventsConfigured && eventsAuthorized,
        !eventsConfigured ? [identityConfigured ? "EVENT_STREAM_NOT_CONFIGURED" : "IDENTITY_RUNTIME_NOT_CONFIGURED"] : eventsAuthorized ? [] : ["CREDENTIAL_NOT_AUTHORIZED"]),
      proposal_ingress: status(true, proposalConfigured, proposalAuthorized, proposalEnabled,
        proposalEnabled ? [] : [
          !proposalConfigured ? "PROPOSAL_INGRESS_NOT_CONFIGURED" :
            !proposalAuthorized ? "PROPOSAL_INGRESS_NOT_AUTHORIZED" : "PROPOSAL_INGRESS_DISABLED",
        ]),
      navigation: status(input.navigationAvailable === true, input.navigationAvailable === true,
        navigationAuthorized, input.navigationAvailable === true && navigationAuthorized,
        input.navigationAvailable !== true ? ["NAVIGATION_UNAVAILABLE"] : navigationAuthorized ? [] : ["CREDENTIAL_NOT_AUTHORIZED"]),
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
