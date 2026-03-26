-- T9: Property Verification Pipeline
-- Adds under_review status, verification metadata, audit table

BEGIN;

-- ============================================================
-- 1. Expand status CHECK to include 'under_review'
-- ============================================================
-- Drop existing constraint and re-add with new status
ALTER TABLE public.properties
  DROP CONSTRAINT IF EXISTS properties_status_check;

ALTER TABLE public.properties
  ADD CONSTRAINT properties_status_check
  CHECK (status IN ('unverified', 'under_review', 'verified', 'archived'));

-- Normalize any unknown statuses to 'unverified' (safety net)
UPDATE public.properties
  SET status = 'unverified'
  WHERE status NOT IN ('unverified', 'under_review', 'verified', 'archived');

-- ============================================================
-- 2. Add verification/review metadata columns
-- ============================================================
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS review_notes text;

-- ============================================================
-- 3. Audit table: property_status_audit
-- ============================================================
CREATE TABLE IF NOT EXISTS public.property_status_audit (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  from_status text NOT NULL,
  to_status   text NOT NULL,
  changed_by  uuid NOT NULL REFERENCES auth.users(id),
  changed_at  timestamptz NOT NULL DEFAULT now(),
  notes       text,
  actor_type  text NOT NULL DEFAULT 'human'
);

CREATE INDEX IF NOT EXISTS idx_property_status_audit_property_changed
  ON public.property_status_audit (property_id, changed_at DESC);

-- ============================================================
-- 4. RLS on audit table
-- ============================================================
ALTER TABLE public.property_status_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_select_own_properties" ON public.property_status_audit;
CREATE POLICY "audit_select_own_properties"
  ON public.property_status_audit FOR SELECT
  TO authenticated
  USING (
    property_id IN (
      SELECT id FROM public.properties WHERE owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "audit_deny_insert" ON public.property_status_audit;
CREATE POLICY "audit_deny_insert"
  ON public.property_status_audit FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "audit_deny_update" ON public.property_status_audit;
CREATE POLICY "audit_deny_update"
  ON public.property_status_audit FOR UPDATE
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS "audit_deny_delete" ON public.property_status_audit;
CREATE POLICY "audit_deny_delete"
  ON public.property_status_audit FOR DELETE
  TO authenticated
  USING (false);

-- ============================================================
-- 5. Tighten owner UPDATE policy to block under_review→archived
-- ============================================================
DROP POLICY IF EXISTS "properties_update_own" ON public.properties;
CREATE POLICY "properties_update_own"
  ON public.properties FOR UPDATE
  TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (
    owner_user_id = auth.uid()
    AND status IN ('unverified', 'archived')
  );

COMMIT;

-- ============================================================
-- VERIFICATION QUERIES (run after applying)
-- ============================================================
-- SELECT status, count(*) FROM properties GROUP BY 1;
-- SELECT * FROM property_status_audit WHERE property_id = '...' ORDER BY changed_at DESC;
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.properties'::regclass AND contype = 'c';
