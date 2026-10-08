import { NAVIGATION_CONTRACT_VERSION, type NavigationCapabilities } from "./types";

export function getNavigationCapabilities(options: { governanceStoreConfigured?: boolean; validAuthorityPathActive?: boolean } = {}): NavigationCapabilities {
  const reentryRecord = options.governanceStoreConfigured === true && options.validAuthorityPathActive === true;
  return Object.freeze({
    navigation_contract: NAVIGATION_CONTRACT_VERSION,
    navigation: Object.freeze({
      discover: true,
      classify: true,
      candidate: true,
      diff: true,
      audit: true,
      context: true,
      reentry_plan: true,
      bounded_supersession_evaluation: true,
      governance_store_adapter: true,
      apply_moc: false,
      source_content_write: false,
      archive_delete: false,
      reentry_write: false,
      rollback_execution: false,
      reentry_record: reentryRecord,
    }),
  });
}

export const NAVIGATION_CAPABILITIES = getNavigationCapabilities();
