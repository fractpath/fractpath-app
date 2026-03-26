-- Property documents table for verification uploads
-- Stores references to selfie, drivers_license, utility_bill photos in Supabase Storage

BEGIN;

-- ============================================================
-- 1. property_documents table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.property_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  doc_type      text NOT NULL CHECK (doc_type IN ('selfie', 'drivers_license', 'utility_bill')),
  storage_path  text NOT NULL,
  content_type  text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_property_documents_unique_type
  ON public.property_documents (property_id, doc_type);

CREATE INDEX IF NOT EXISTS idx_property_documents_property
  ON public.property_documents (property_id);

-- ============================================================
-- 2. RLS on property_documents
-- ============================================================
ALTER TABLE public.property_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "docs_select_own" ON public.property_documents;
CREATE POLICY "docs_select_own"
  ON public.property_documents FOR SELECT
  TO authenticated
  USING (
    property_id IN (
      SELECT id FROM public.properties WHERE owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "docs_insert_own_unverified" ON public.property_documents;
CREATE POLICY "docs_insert_own_unverified"
  ON public.property_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    property_id IN (
      SELECT id FROM public.properties
      WHERE owner_user_id = auth.uid() AND status = 'unverified'
    )
  );

DROP POLICY IF EXISTS "docs_update_own_unverified" ON public.property_documents;
CREATE POLICY "docs_update_own_unverified"
  ON public.property_documents FOR UPDATE
  TO authenticated
  USING (
    property_id IN (
      SELECT id FROM public.properties
      WHERE owner_user_id = auth.uid() AND status = 'unverified'
    )
  );

DROP POLICY IF EXISTS "docs_deny_delete" ON public.property_documents;
CREATE POLICY "docs_deny_delete"
  ON public.property_documents FOR DELETE
  TO authenticated
  USING (false);

COMMIT;
