-- Option B Phase 1: deal_access_grants foundations
-- Additive migration — does not drop or recreate table.
-- Ensures id column, partial unique index, and helper function exist.

BEGIN;

-- ============================================================
-- 1. Add id column if missing (original migration created it,
--    but live table may lack it due to migration ordering)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'deal_access_grants'
      AND column_name = 'id'
  ) THEN
    ALTER TABLE public.deal_access_grants
      ADD COLUMN id uuid DEFAULT gen_random_uuid();

    UPDATE public.deal_access_grants SET id = gen_random_uuid() WHERE id IS NULL;

    ALTER TABLE public.deal_access_grants
      ALTER COLUMN id SET NOT NULL;
  END IF;
END $$;

-- ============================================================
-- 2. Partial unique index on (deal_id, user_id) for active grants
--    Replaces non-partial index if present.
-- ============================================================
DROP INDEX IF EXISTS public.idx_dag_active_deal_user;
CREATE UNIQUE INDEX idx_dag_active_deal_user
  ON public.deal_access_grants (deal_id, user_id)
  WHERE revoked_at IS NULL;

DROP INDEX IF EXISTS public.idx_dag_active_user_deal;
CREATE INDEX idx_dag_active_user_deal
  ON public.deal_access_grants (user_id, deal_id)
  WHERE revoked_at IS NULL;

DROP INDEX IF EXISTS public.idx_dag_active_deal;
CREATE INDEX idx_dag_active_deal
  ON public.deal_access_grants (deal_id)
  WHERE revoked_at IS NULL;

-- ============================================================
-- 3. RLS policies (idempotent — drop + recreate)
--    Table-level RLS should already be enabled; ensure it.
-- ============================================================
ALTER TABLE public.deal_access_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dag_select_own" ON public.deal_access_grants;
CREATE POLICY "dag_select_own"
  ON public.deal_access_grants FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now())
  );

DROP POLICY IF EXISTS "dag_deny_anon_insert" ON public.deal_access_grants;
CREATE POLICY "dag_deny_anon_insert"
  ON public.deal_access_grants FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "dag_deny_anon_update" ON public.deal_access_grants;
CREATE POLICY "dag_deny_anon_update"
  ON public.deal_access_grants FOR UPDATE
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS "dag_deny_anon_delete" ON public.deal_access_grants;
CREATE POLICY "dag_deny_anon_delete"
  ON public.deal_access_grants FOR DELETE
  TO authenticated
  USING (false);

-- ============================================================
-- 4. Helper predicate function
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_active_deal_grant(
  p_deal_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.deal_access_grants g
    WHERE g.deal_id = p_deal_id
      AND g.user_id = p_user_id
      AND g.revoked_at IS NULL
      AND (g.expires_at IS NULL OR g.expires_at > now())
  );
$$;

REVOKE ALL ON FUNCTION public.has_active_deal_grant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_active_deal_grant(uuid, uuid) TO authenticated;

COMMIT;
