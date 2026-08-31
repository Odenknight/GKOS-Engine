import type { RetrievalCoordinatorOptions } from "../retrieval/coordinator";
import type { RetrievalSearchRequest, RetrievalSearchResult } from "../retrieval/types";

/** Trusted in-process narrowing only; never populated from wire parameters. */
export type ServiceRetrievalGuards = Required<Pick<RetrievalCoordinatorOptions,
  "discoverability_policy" | "source_discoverability_policy" | "source_reader">>;
export type ServiceRetrievalSearch = (request: RetrievalSearchRequest, guards: ServiceRetrievalGuards) => Promise<RetrievalSearchResult>;
