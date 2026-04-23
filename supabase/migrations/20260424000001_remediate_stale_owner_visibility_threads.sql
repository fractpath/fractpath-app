-- Remediation: remove stale owner-created pending_buyer threads with no real buyer.
--
-- These were created by the legacy "make property visible" owner flow before it was
-- fixed to update property visibility fields only (without creating a thread).
--
-- A thread is a stale visibility artifact if ALL hold:
--   status = 'pending_buyer'       → still awaiting a buyer response
--   buyer_user_id IS NULL           → no real buyer was ever linked
--   created_by_user_id IS NOT NULL  → has a creator
--   created_by_user_id = owner_user_id  → the owner created their own thread
--
-- Safe to hard-delete: no real buyer negotiation, no real buyer user_id.

DO $$
DECLARE
  stale_ids UUID[];
BEGIN
  SELECT ARRAY(
    SELECT id
    FROM deal_threads
    WHERE status = 'pending_buyer'
      AND buyer_user_id IS NULL
      AND created_by_user_id IS NOT NULL
      AND created_by_user_id = owner_user_id
  ) INTO stale_ids;

  IF stale_ids IS NULL OR array_length(stale_ids, 1) IS NULL THEN
    RAISE NOTICE 'No stale owner-created pending_buyer threads found.';
    RETURN;
  END IF;

  RAISE NOTICE 'Removing % stale pending_buyer thread(s): %', array_length(stale_ids, 1), stale_ids;

  DELETE FROM deal_proposals         WHERE thread_id = ANY(stale_ids);
  DELETE FROM deal_thread_participants WHERE thread_id = ANY(stale_ids);
  DELETE FROM thread_invites          WHERE thread_id = ANY(stale_ids);
  DELETE FROM thread_claim_dismissals WHERE thread_id = ANY(stale_ids);
  DELETE FROM deal_threads            WHERE id = ANY(stale_ids);

  RAISE NOTICE 'Stale thread remediation complete.';
END $$;
