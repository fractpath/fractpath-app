-- ============================================================
-- property_photos — owner-uploaded property media
-- property_fact_corrections — owner-submitted fact correction requests
-- property_edit_audit — immutable audit trail for owner/admin property changes
-- ============================================================

BEGIN;

-- ============================================================
-- 1. property_photos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.property_photos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  uploaded_by   uuid NOT NULL REFERENCES auth.users(id),
  storage_path  text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'property-photos',
  public_url    text NOT NULL,
  sort_order    integer NOT NULL DEFAULT 0,
  is_hero       boolean NOT NULL DEFAULT false,
  caption       text,
  removed_at    timestamptz,
  removed_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_photos_property
  ON public.property_photos (property_id)
  WHERE removed_at IS NULL;

-- ============================================================
-- 2. property_fact_corrections
-- ============================================================
CREATE TABLE IF NOT EXISTS public.property_fact_corrections (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id           uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  submitted_by          uuid NOT NULL REFERENCES auth.users(id),
  field_key             text NOT NULL,
  display_label         text NOT NULL,
  canonical_value       text,
  owner_submitted_value text NOT NULL,
  review_status         text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected')),
  reviewed_by           uuid REFERENCES auth.users(id),
  reviewed_at           timestamptz,
  reviewer_note         text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Only one active (pending or approved) correction per field per property
CREATE UNIQUE INDEX IF NOT EXISTS idx_property_fact_corrections_active_field
  ON public.property_fact_corrections (property_id, field_key)
  WHERE review_status IN ('pending', 'approved');

CREATE INDEX IF NOT EXISTS idx_property_fact_corrections_property
  ON public.property_fact_corrections (property_id);

-- ============================================================
-- 3. property_edit_audit — append-only immutable log
-- ============================================================
CREATE TABLE IF NOT EXISTS public.property_edit_audit (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES public.properties(id),
  actor         uuid NOT NULL REFERENCES auth.users(id),
  action_type   text NOT NULL,
  field_key     text,
  before_value  text,
  after_value   text,
  correction_id uuid REFERENCES public.property_fact_corrections(id),
  photo_id      uuid REFERENCES public.property_photos(id),
  metadata      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_edit_audit_property
  ON public.property_edit_audit (property_id, created_at DESC);

-- Prevent updates and deletes on audit rows
CREATE OR REPLACE FUNCTION public.deny_edit_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'property_edit_audit rows are immutable';
END;
$$;

DROP TRIGGER IF EXISTS tg_deny_edit_audit_update ON public.property_edit_audit;
CREATE TRIGGER tg_deny_edit_audit_update
  BEFORE UPDATE ON public.property_edit_audit
  FOR EACH ROW EXECUTE FUNCTION public.deny_edit_audit_mutation();

DROP TRIGGER IF EXISTS tg_deny_edit_audit_delete ON public.property_edit_audit;
CREATE TRIGGER tg_deny_edit_audit_delete
  BEFORE DELETE ON public.property_edit_audit
  FOR EACH ROW EXECUTE FUNCTION public.deny_edit_audit_mutation();

-- ============================================================
-- 4. RLS — property_photos
-- ============================================================
ALTER TABLE public.property_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "photos_select_owner" ON public.property_photos;
CREATE POLICY "photos_select_owner"
  ON public.property_photos FOR SELECT
  TO authenticated
  USING (
    property_id IN (
      SELECT id FROM public.properties
      WHERE owner_user_id = auth.uid()
         OR created_by_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "photos_insert_owner" ON public.property_photos;
CREATE POLICY "photos_insert_owner"
  ON public.property_photos FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND property_id IN (
      SELECT id FROM public.properties
      WHERE (owner_user_id = auth.uid() OR created_by_user_id = auth.uid())
        AND status != 'archived'
    )
  );

DROP POLICY IF EXISTS "photos_update_owner" ON public.property_photos;
CREATE POLICY "photos_update_owner"
  ON public.property_photos FOR UPDATE
  TO authenticated
  USING (
    property_id IN (
      SELECT id FROM public.properties
      WHERE (owner_user_id = auth.uid() OR created_by_user_id = auth.uid())
        AND status != 'archived'
    )
  );

-- No hard deletes — use removed_at soft delete
DROP POLICY IF EXISTS "photos_deny_delete" ON public.property_photos;
CREATE POLICY "photos_deny_delete"
  ON public.property_photos FOR DELETE
  TO authenticated
  USING (false);

-- ============================================================
-- 5. RLS — property_fact_corrections
-- ============================================================
ALTER TABLE public.property_fact_corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "corrections_select_owner" ON public.property_fact_corrections;
CREATE POLICY "corrections_select_owner"
  ON public.property_fact_corrections FOR SELECT
  TO authenticated
  USING (
    submitted_by = auth.uid()
    OR property_id IN (
      SELECT id FROM public.properties WHERE owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "corrections_insert_owner" ON public.property_fact_corrections;
CREATE POLICY "corrections_insert_owner"
  ON public.property_fact_corrections FOR INSERT
  TO authenticated
  WITH CHECK (
    submitted_by = auth.uid()
    AND property_id IN (
      SELECT id FROM public.properties
      WHERE (owner_user_id = auth.uid() OR created_by_user_id = auth.uid())
        AND status != 'archived'
    )
  );

DROP POLICY IF EXISTS "corrections_update_owner" ON public.property_fact_corrections;
CREATE POLICY "corrections_update_owner"
  ON public.property_fact_corrections FOR UPDATE
  TO authenticated
  USING (
    submitted_by = auth.uid()
    AND review_status = 'pending'
  );

-- ============================================================
-- 6. RLS — property_edit_audit (append-only for owners, service-role for admins)
-- ============================================================
ALTER TABLE public.property_edit_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "edit_audit_select_own" ON public.property_edit_audit;
CREATE POLICY "edit_audit_select_own"
  ON public.property_edit_audit FOR SELECT
  TO authenticated
  USING (
    property_id IN (
      SELECT id FROM public.properties WHERE owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "edit_audit_insert_own" ON public.property_edit_audit;
CREATE POLICY "edit_audit_insert_own"
  ON public.property_edit_audit FOR INSERT
  TO authenticated
  WITH CHECK (actor = auth.uid());

COMMIT;
