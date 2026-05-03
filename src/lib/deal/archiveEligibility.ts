/**
 * Deal archive eligibility.
 *
 * Archive is permitted only when the deal has no active negotiation thread.
 * "Active" means the thread is live and awaiting action from either party.
 *
 * Blocked thread statuses (archive NOT allowed):
 *   pending_owner     — offer submitted, waiting for owner decision
 *   pending_buyer     — owner sent proposal to buyer, waiting for buyer
 *   negotiating       — counter-offer in flight
 *   decision_pending  — proposal under final review
 *   accepted          — agreement reached, deal is live
 *
 * Archive IS allowed when:
 *   - There is no thread at all (pure draft deal)
 *   - Thread is in a terminal state: draft (not yet submitted), closed,
 *     closed_due_to_claim_release, voided_by_admin
 */
export const ARCHIVE_BLOCKED_THREAD_STATUSES: string[] = [
  "pending_owner",
  "pending_buyer",
  "negotiating",
  "decision_pending",
  "accepted",
];

/**
 * Returns true when the deal is eligible for archiving.
 * Pass the current active thread status, or null/undefined if no thread exists.
 */
export function isDealArchiveEligible(
  threadStatus: string | null | undefined,
): boolean {
  if (!threadStatus) return true;
  return !ARCHIVE_BLOCKED_THREAD_STATUSES.includes(threadStatus);
}
