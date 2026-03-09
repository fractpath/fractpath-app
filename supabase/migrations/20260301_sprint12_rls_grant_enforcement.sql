BEGIN;

-- ============================================================
-- Sprint 12 Phase 1.1 — Enforce deal read access via active grants
-- ============================================================
-- Adds revoked_at / expires_at to deal_access_grants and tightens
-- all RLS policies across deals, deal_snapshots, deal_events, and
-- deal_versions to exclude revoked or expired grants.
--
-- Service-role bypasses RLS by default — no changes needed for admin.
-- ============================================================

-- 1. Add revocation + expiry columns to deal_access_grants
ALTER TABLE public.deal_access_grants
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NULL;

-- 2. Helper: reusable active-grant check predicate
--    g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > now())

-- ============================================================
-- 3. deal_access_grants — own SELECT should hide revoked rows
-- ============================================================
DROP POLICY IF EXISTS "dag_select_own" ON public.deal_access_grants;
CREATE POLICY "dag_select_own"
  ON public.deal_access_grants FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now())
  );

-- ============================================================
-- 4. deals — SELECT via active grant
-- ============================================================
DROP POLICY IF EXISTS "deals_select_owner_or_viewer" ON public.deals;
CREATE POLICY "deals_select_owner_or_viewer"
  ON public.deals
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.deal_access_grants g
      WHERE g.deal_id = public.deals.id
        AND g.user_id = auth.uid()
        AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at > now())
    )
  );

-- deals — UPDATE via active OWNER grant
DROP POLICY IF EXISTS "deals_update_owner_only" ON public.deals;
CREATE POLICY "deals_update_owner_only"
  ON public.deals
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.deal_access_grants g
      WHERE g.deal_id = public.deals.id
        AND g.user_id = auth.uid()
        AND g.role = 'OWNER'
        AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at > now())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.deal_access_grants g
      WHERE g.deal_id = public.deals.id
        AND g.user_id = auth.uid()
        AND g.role = 'OWNER'
        AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at > now())
    )
  );

-- deals — DELETE via active OWNER grant
DROP POLICY IF EXISTS "deals_delete_owner_only" ON public.deals;
CREATE POLICY "deals_delete_owner_only"
  ON public.deals
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.deal_access_grants g
      WHERE g.deal_id = public.deals.id
        AND g.user_id = auth.uid()
        AND g.role = 'OWNER'
        AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at > now())
    )
  );

-- ============================================================
-- 5. deal_snapshots — SELECT via active grant
-- ============================================================
-- There may be two policies from different migrations; drop both names
DROP POLICY IF EXISTS "deal_snapshots_select_via_grant" ON public.deal_snapshots;
DROP POLICY IF EXISTS "snapshots_select_via_grant" ON public.deal_snapshots;
CREATE POLICY "snapshots_select_via_grant"
  ON public.deal_snapshots
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.deal_access_grants g
      WHERE g.deal_id = public.deal_snapshots.deal_id
        AND g.user_id = auth.uid()
        AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at > now())
    )
  );

-- deal_snapshots — INSERT via active OWNER grant
DROP POLICY IF EXISTS "deal_snapshots_insert_owner_only" ON public.deal_snapshots;
CREATE POLICY "deal_snapshots_insert_owner_only"
  ON public.deal_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.deal_access_grants g
      WHERE g.deal_id = public.deal_snapshots.deal_id
        AND g.user_id = auth.uid()
        AND g.role = 'OWNER'
        AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at > now())
    )
  );

-- ============================================================
-- 6. deal_events — SELECT via active grant
-- ============================================================
DROP POLICY IF EXISTS "events_select_via_grant" ON public.deal_events;
CREATE POLICY "events_select_via_grant"
  ON public.deal_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.deal_access_grants g
      WHERE g.deal_id = public.deal_events.deal_id
        AND g.user_id = auth.uid()
        AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at > now())
    )
  );

-- ============================================================
-- 7. deal_versions — SELECT via active grant
-- ============================================================
DROP POLICY IF EXISTS "deal_versions_select_via_grant" ON public.deal_versions;
CREATE POLICY "deal_versions_select_via_grant"
  ON public.deal_versions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.deal_access_grants g
      WHERE g.deal_id = public.deal_versions.deal_id
        AND g.user_id = auth.uid()
        AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at > now())
    )
  );

-- deal_versions — INSERT via active OWNER grant
DROP POLICY IF EXISTS "deal_versions_insert_owner_only" ON public.deal_versions;
DROP POLICY IF EXISTS "deal_versions_insert_owner_or_counterparty" ON public.deal_versions;
CREATE POLICY "deal_versions_insert_owner_or_counterparty"
  ON public.deal_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.deal_access_grants g
      WHERE g.deal_id = public.deal_versions.deal_id
        AND g.user_id = auth.uid()
        AND g.role IN ('OWNER', 'COUNTERPARTY')
        AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at > now())
    )
  );

COMMIT;
