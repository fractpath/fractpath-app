-- Sprint 15: Secured-debt-aware property verification + private underwriting data

BEGIN;

-- ============================================================
-- 1. Private underwriting columns on properties
--    All are service-client-only; RLS select policy on properties
--    allows owners to read their own rows, but the API layer
--    projects these out of buyer-facing responses explicitly.
-- ============================================================
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS has_secured_property_debt         boolean,
  ADD COLUMN IF NOT EXISTS secured_property_debt_amount      numeric(14,2),
  ADD COLUMN IF NOT EXISTS secured_debt_certified_at         timestamptz,
  ADD COLUMN IF NOT EXISTS secured_debt_last_verified_at     timestamptz,
  ADD COLUMN IF NOT EXISTS secured_debt_fresh_until          timestamptz,
  ADD COLUMN IF NOT EXISTS secured_debt_verification_status  text,
  ADD COLUMN IF NOT EXISTS latest_verified_fmv               numeric(14,2),
  ADD COLUMN IF NOT EXISTS fmv_verified_at                   timestamptz,
  ADD COLUMN IF NOT EXISTS fmv_verification_source           text,
  ADD COLUMN IF NOT EXISTS ltv_policy_ratio                  numeric(6,4) NOT NULL DEFAULT 0.7500,
  ADD COLUMN IF NOT EXISTS max_accessible_cash_current       numeric(14,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_secured_debt_verification_status'
      AND conrelid = 'public.properties'::regclass
  ) THEN
    ALTER TABLE public.properties
      ADD CONSTRAINT chk_secured_debt_verification_status
      CHECK (
        secured_debt_verification_status IS NULL OR
        secured_debt_verification_status IN ('pending', 'verified', 'stale', 'not_applicable')
      );
  END IF;
END$$;

-- ============================================================
-- 2. Expand property_documents.doc_type to include debt statements
--    Find and drop the existing CHECK by content, then re-add.
-- ============================================================
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.property_documents'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%selfie%'
    AND pg_get_constraintdef(oid) LIKE '%utility_bill%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.property_documents DROP CONSTRAINT %I', cname);
  END IF;
END$$;

ALTER TABLE public.property_documents
  ADD CONSTRAINT property_documents_doc_type_check
  CHECK (doc_type IN ('selfie', 'drivers_license', 'utility_bill', 'secured_debt_statement'));

-- ============================================================
-- 3. Allow multiple secured_debt_statement uploads per property.
--    Drop the blanket unique index (property_id, doc_type) and
--    replace with a partial unique that only covers the one-per-type
--    docs (selfie / drivers_license / utility_bill).
-- ============================================================
DROP INDEX IF EXISTS idx_property_documents_unique_type;

CREATE UNIQUE INDEX IF NOT EXISTS idx_property_documents_unique_non_debt
  ON public.property_documents (property_id, doc_type)
  WHERE doc_type != 'secured_debt_statement';

-- ============================================================
-- 4. Loosen INSERT policy so debt statements can be added during
--    under_review status (admin may request additional docs).
-- ============================================================
DROP POLICY IF EXISTS "docs_insert_own_unverified" ON public.property_documents;
CREATE POLICY "docs_insert_own_unverified"
  ON public.property_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    property_id IN (
      SELECT id FROM public.properties
      WHERE owner_user_id = auth.uid()
        AND status IN ('unverified', 'under_review')
    )
  );

-- ============================================================
-- 5. Historical underwriting snapshots table
--    Append-only, captures financially material inputs at key
--    lifecycle points (owner declaration, admin verification, etc.).
--    Access is service-client only; all authenticated RLS denied.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.property_underwriting_snapshots (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id                   uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  captured_at                   timestamptz NOT NULL DEFAULT now(),
  captured_by                   uuid REFERENCES auth.users(id),
  actor_type                    text NOT NULL DEFAULT 'system',
  snapshot_source               text NOT NULL DEFAULT 'owner_declaration',
  has_secured_property_debt     boolean,
  secured_property_debt_amount  numeric(14,2),
  latest_verified_fmv           numeric(14,2),
  ltv_policy_ratio              numeric(6,4),
  max_accessible_cash_current   numeric(14,2),
  notes                         text
);

CREATE INDEX IF NOT EXISTS idx_prop_underwriting_snaps_property
  ON public.property_underwriting_snapshots (property_id, captured_at DESC);

ALTER TABLE public.property_underwriting_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "underwriting_snaps_deny_select" ON public.property_underwriting_snapshots;
CREATE POLICY "underwriting_snaps_deny_select"
  ON public.property_underwriting_snapshots FOR SELECT
  TO authenticated USING (false);

DROP POLICY IF EXISTS "underwriting_snaps_deny_insert" ON public.property_underwriting_snapshots;
CREATE POLICY "underwriting_snaps_deny_insert"
  ON public.property_underwriting_snapshots FOR INSERT
  TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "underwriting_snaps_deny_update" ON public.property_underwriting_snapshots;
CREATE POLICY "underwriting_snaps_deny_update"
  ON public.property_underwriting_snapshots FOR UPDATE
  TO authenticated USING (false);

DROP POLICY IF EXISTS "underwriting_snaps_deny_delete" ON public.property_underwriting_snapshots;
CREATE POLICY "underwriting_snaps_deny_delete"
  ON public.property_underwriting_snapshots FOR DELETE
  TO authenticated USING (false);

COMMIT;
