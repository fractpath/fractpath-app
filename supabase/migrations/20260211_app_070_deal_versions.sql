-- APP-070: Deal versions (negotiation layer, append-only)
-- Represents offer/counter/decision states referencing deal_snapshots.
-- No recomputation. Append-only. RLS-first.

BEGIN;

-- ============================================================
-- 1. deal_versions table (append-only, immutable)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.deal_versions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id              uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  created_by           uuid NOT NULL REFERENCES auth.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  version_number       int NOT NULL,
  version_type         text NOT NULL,
  base_snapshot_id     uuid REFERENCES public.deal_snapshots(id),
  proposed_snapshot_id uuid REFERENCES public.deal_snapshots(id),
  note                 text,
  meta                 jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- ============================================================
-- 2. Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_deal_versions_deal_created
  ON public.deal_versions (deal_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deal_versions_deal_version
  ON public.deal_versions (deal_id, version_number DESC);

-- ============================================================
-- 3. Enable RLS
-- ============================================================
ALTER TABLE public.deal_versions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. RLS Policies
-- ============================================================

-- SELECT: allowed if user has any grant (OWNER or VIEWER) on the deal
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'deal_versions'
      AND policyname = 'deal_versions_select_via_grant'
  ) THEN
    CREATE POLICY deal_versions_select_via_grant
      ON public.deal_versions
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.deal_access_grants g
          WHERE g.deal_id = public.deal_versions.deal_id
            AND g.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- INSERT: OWNER only (will expand for COUNTERPARTY later)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'deal_versions'
      AND policyname = 'deal_versions_insert_owner_only'
  ) THEN
    CREATE POLICY deal_versions_insert_owner_only
      ON public.deal_versions
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.deal_access_grants g
          WHERE g.deal_id = deal_id
            AND g.user_id = auth.uid()
            AND g.role = 'OWNER'
        )
      );
  END IF;
END $$;

-- No UPDATE or DELETE policies: deny all by default with RLS enabled.

-- ============================================================
-- 5. Hard immutability: block UPDATE/DELETE at the DB trigger level
-- ============================================================
-- Reuses public.no_update_delete() from APP-INT-001 migration.

DROP TRIGGER IF EXISTS trg_deal_versions_no_update ON public.deal_versions;
CREATE TRIGGER trg_deal_versions_no_update
  BEFORE UPDATE ON public.deal_versions
  FOR EACH ROW EXECUTE FUNCTION public.no_update_delete();

DROP TRIGGER IF EXISTS trg_deal_versions_no_delete ON public.deal_versions;
CREATE TRIGGER trg_deal_versions_no_delete
  BEFORE DELETE ON public.deal_versions
  FOR EACH ROW EXECUTE FUNCTION public.no_update_delete();

COMMIT;
