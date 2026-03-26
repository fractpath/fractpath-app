-- APP-072: COUNTERPARTY role + deal_versions INSERT for COUNTER versions
-- Expands deal_versions INSERT RLS to allow COUNTERPARTY role for COUNTER type only.
-- OWNER retains full INSERT rights (any version_type).
-- VIEWER remains read-only (no changes needed).

BEGIN;

-- ============================================================
-- 1. Replace deal_versions INSERT policy
--    Old: OWNER only
--    New: OWNER (any type) OR COUNTERPARTY (COUNTER only)
-- ============================================================
DROP POLICY IF EXISTS deal_versions_insert_owner_only ON public.deal_versions;

CREATE POLICY deal_versions_insert_owner_or_counterparty
  ON public.deal_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.deal_access_grants g
      WHERE g.deal_id = deal_id
        AND g.user_id = auth.uid()
        AND (
          g.role = 'OWNER'
          OR (g.role = 'COUNTERPARTY' AND version_type = 'COUNTER')
        )
    )
  );

COMMIT;
