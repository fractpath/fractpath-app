-- APP-060: Persist FullDealSnapshotV1 (append-only)
-- Stores opaque, immutable deal snapshots from fractpath-calculator-widget.
-- No recomputation. No derived fields. Store-and-forward only.

BEGIN;

-- ============================================================
-- 1. deal_snapshots table (append-only, immutable)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.deal_snapshots (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id          uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  created_by       uuid NOT NULL REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  contract_version text NOT NULL,
  schema_version   text NOT NULL,
  input_hash       text,
  output_hash      text,
  snapshot_json    jsonb NOT NULL
);

-- Index: latest snapshot per deal (deal_id, created_at DESC)
CREATE INDEX IF NOT EXISTS idx_deal_snapshots_deal_created
  ON public.deal_snapshots (deal_id, created_at DESC);

-- Optional indexes on hashes for lookup
CREATE INDEX IF NOT EXISTS idx_deal_snapshots_input_hash
  ON public.deal_snapshots (input_hash) WHERE input_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deal_snapshots_output_hash
  ON public.deal_snapshots (output_hash) WHERE output_hash IS NOT NULL;

-- ============================================================
-- 2. Enable RLS
-- ============================================================
ALTER TABLE public.deal_snapshots ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. RLS Policies
-- ============================================================

-- SELECT: allowed if user has any grant (OWNER or VIEWER) on the deal
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'deal_snapshots'
      AND policyname = 'deal_snapshots_select_via_grant'
  ) THEN
    CREATE POLICY deal_snapshots_select_via_grant
      ON public.deal_snapshots
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.deal_access_grants g
          WHERE g.deal_id = public.deal_snapshots.deal_id
            AND g.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- INSERT: only OWNER grant holders can insert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'deal_snapshots'
      AND policyname = 'deal_snapshots_insert_owner_only'
  ) THEN
    CREATE POLICY deal_snapshots_insert_owner_only
      ON public.deal_snapshots
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
-- 4. Hard immutability: block UPDATE/DELETE at the DB trigger level
-- ============================================================
-- Reuses public.no_update_delete() from APP-INT-001 migration.

DROP TRIGGER IF EXISTS trg_deal_snapshots_no_update ON public.deal_snapshots;
CREATE TRIGGER trg_deal_snapshots_no_update
  BEFORE UPDATE ON public.deal_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.no_update_delete();

DROP TRIGGER IF EXISTS trg_deal_snapshots_no_delete ON public.deal_snapshots;
CREATE TRIGGER trg_deal_snapshots_no_delete
  BEFORE DELETE ON public.deal_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.no_update_delete();

COMMIT;
