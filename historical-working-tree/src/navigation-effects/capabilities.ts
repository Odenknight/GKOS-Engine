import {
  NAVIGATION_EFFECTS_CONTRACT_VERSION,
  type NavigationEffectsCapabilities,
} from "./types";

export interface NavigationEffectsCapabilityOptions {
  adapterConfigured?: boolean;
  authorityProviderConfigured?: boolean;
  durableJournalConfigured?: boolean;
  policyConfigured?: boolean;
}

/**
 * Reports configured effect capability, never package-code reachability alone.
 * This function performs no effect and imports no host filesystem adapter.
 */
export function getNavigationEffectsCapabilities(
  options: NavigationEffectsCapabilityOptions = {},
): NavigationEffectsCapabilities {
  const adapter = options.adapterConfigured === true;
  const authorityProvider = options.authorityProviderConfigured === true;
  const durableJournal = options.durableJournalConfigured === true;
  const policy = options.policyConfigured === true;
  const authorizedDurableAdapter = adapter && authorityProvider && durableJournal && policy;

  return Object.freeze({
    navigation_effects_contract: NAVIGATION_EFFECTS_CONTRACT_VERSION,
    configured: Object.freeze({
      adapter,
      authority_provider: authorityProvider,
      durable_journal: durableJournal,
      policy,
    }),
    navigation_effects: Object.freeze({
      plan_moc_apply: true,
      apply_managed_moc: authorizedDurableAdapter,
      archive_previous_moc: adapter && durableJournal && policy,
      atomic_replace: adapter,
      startup_recovery: adapter && durableJournal && policy,
      rollback_execution: authorizedDurableAdapter,
      agent_note_create: authorizedDurableAdapter,
      agent_note_update: authorizedDurableAdapter,
      agent_note_archive: authorizedDurableAdapter,
      arbitrary_source_write: false,
      agent_note_delete: false,
    }),
  });
}

export const NAVIGATION_EFFECTS_CAPABILITIES = getNavigationEffectsCapabilities();
