-- Add pending_buyer to the deal_threads status check constraint.
-- The owner-originated deal flow (owner_to_buyer mode) writes status = 'pending_buyer'
-- to indicate the thread is awaiting the buyer's response. This status was implemented
-- in application code but was missing from the DB constraint, causing a check violation.

ALTER TABLE deal_threads
  DROP CONSTRAINT deal_threads_status_check;

ALTER TABLE deal_threads
  ADD CONSTRAINT deal_threads_status_check CHECK (
    status IN (
      'draft',
      'pending_owner',
      'pending_buyer',
      'negotiating',
      'decision_pending',
      'accepted',
      'closed',
      'closed_due_to_claim_release',
      'voided_by_admin'
    )
  );
