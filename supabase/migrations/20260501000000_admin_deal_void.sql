BEGIN;

-- ============================================================
-- Admin deal void tracking
-- Adds three nullable columns to deals so an admin can mark a
-- deal as voided for testing / cleanup without releasing the
-- property owner claim or altering any property state.
-- ============================================================

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS admin_voided_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_voided_by   UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS admin_void_reason TEXT;

-- Sparse index for fast "is this deal voided?" lookups
CREATE INDEX IF NOT EXISTS idx_deals_admin_voided_at
  ON public.deals (admin_voided_at)
  WHERE admin_voided_at IS NOT NULL;

COMMIT;
