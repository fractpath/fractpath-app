BEGIN;

-- ============================================================
-- Sprint 12 / Phase 2 — Deal Thread Core FIXES
-- - Remove RLS recursion
-- - Tighten privileges (no anon/public)
-- - Preserve Phase 2 behavior (buyer-only participant reads)
-- ============================================================

-- deal_thread_participants: SELECT only self active rows (prevents recursion)
DROP POLICY IF EXISTS "thread_participants_select" ON public.deal_thread_participants;
CREATE POLICY "thread_participants_select"
  ON public.deal_thread_participants FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND status = 'active'
  );

-- deal_threads: SELECT based on thread columns only (no cross-table)
DROP POLICY IF EXISTS "deal_threads_select_participant" ON public.deal_threads;
CREATE POLICY "deal_threads_select_participant"
  ON public.deal_threads FOR SELECT
  TO authenticated
  USING (
    created_by_user_id = auth.uid()
    OR buyer_user_id = auth.uid()
    OR owner_user_id = auth.uid()
  );

-- Privileges: no anon/public on these two new tables
REVOKE ALL ON TABLE public.deal_threads FROM anon;
REVOKE ALL ON TABLE public.deal_threads FROM public;
GRANT SELECT, INSERT ON TABLE public.deal_threads TO authenticated;
REVOKE UPDATE ON TABLE public.deal_threads FROM authenticated;
GRANT UPDATE (status) ON TABLE public.deal_threads TO authenticated;

REVOKE ALL ON TABLE public.deal_thread_participants FROM anon;
REVOKE ALL ON TABLE public.deal_thread_participants FROM public;
GRANT SELECT, INSERT ON TABLE public.deal_thread_participants TO authenticated;
REVOKE UPDATE, DELETE ON TABLE public.deal_thread_participants FROM authenticated;

COMMIT;