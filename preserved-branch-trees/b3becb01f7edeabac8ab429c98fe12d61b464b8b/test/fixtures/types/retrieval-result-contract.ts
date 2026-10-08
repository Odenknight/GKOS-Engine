import type {
  GkxRetrievalHit,
  GkxRetrievalSearchResult,
  RetrievalDraft1SearchResult,
  RetrievalHit,
  RetrievalSearchResult,
} from "../../../dist/retrieval/index.js";

declare const phase1: RetrievalDraft1SearchResult;
declare const phase1Hit: RetrievalHit;
declare const phase2Hit: GkxRetrievalHit;
declare const phase2Common: Omit<GkxRetrievalSearchResult, "hits" | "temporal">;

const result: RetrievalSearchResult = phase1;
void result;

// @ts-expect-error Draft.1 hit types do not expose Phase-2 provenance.
phase1Hit.provenance;

// @ts-expect-error Draft.2 requires temporal and provenance-bearing hits.
const incompletePhase2: GkxRetrievalSearchResult = { ...phase2Common, hits: [phase1Hit] };
void incompletePhase2;

// @ts-expect-error The pinned profile permits no synthesized lineage ID.
phase2Hit.chunk.lineage_id = "derived:forged";

// @ts-expect-error No verified ledger adapter exists in Phase 2.
phase2Hit.provenance.ledger_entry_sha256;
