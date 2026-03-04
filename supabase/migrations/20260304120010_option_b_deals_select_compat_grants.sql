-- Option B Phase 1: Deals SELECT compatibility policy
-- Preserves legacy owner_user_id access while adding grants-based access.
-- This is a transitional policy: once all deals have proper grants minted,
-- the owner_user_id fallback can be removed in a future phase.

BEGIN;

-- ============================================================
-- Replace the single existing deals SELECT policy with a compat
-- version that allows access via:
--   (a) active deal_access_grant (current Sprint 12 behavior), OR
--   (b) deals.owner_user_id = auth.uid() (legacy fallback)
-- ============================================================
DROP POLICY IF EXISTS "deals_select_owner_or_viewer" ON public.deals;

CREATE POLICY "deals_select_owner_or_viewer"
  ON public.deals
  FOR SELECT
  TO authenticated
  USING (
    public.has_active_deal_grant(id, auth.uid())
    OR owner_user_id = auth.uid()
  );

COMMIT;
