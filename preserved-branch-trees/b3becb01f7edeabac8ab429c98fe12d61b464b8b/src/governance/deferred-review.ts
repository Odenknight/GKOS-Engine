import type { ActorRef } from "./types";

export type DeferredReviewStatus = "pending" | "accepted" | "rejected" | "corrected" | "overdue";

export interface DeferredReviewItem {
  reviewId: string;
  delegationId: string;
  actionOperationId: string;
  actionReceiptId: string;
  newSourceRef: { id: string; digest: string };
  predecessorRef: { id: string; digest: string };
  predicate: { id: string; version: string; decision: "routine" };
  checkerEscalated: false;
  queuedAt: string;
  dueAt: string;
  reviewPolicy: { id: string; version: string };
  status: DeferredReviewStatus;
  decisionRecordRef?: string;
  queuedBy: ActorRef;
}

export function isDeferredReviewOverdue(item: DeferredReviewItem, at: string): boolean {
  const due = Date.parse(item.dueAt), now = Date.parse(at);
  return item.status === "pending" && Number.isFinite(due) && Number.isFinite(now) && now >= due;
}

export function isDelegationFrozenByReview(delegationId: string, items: readonly DeferredReviewItem[], at: string): boolean {
  return items.some((item) => item.delegationId === delegationId && (item.status === "overdue" || isDeferredReviewOverdue(item, at)));
}
