BEGIN;

-- Sprint 12 / Phase 1 — Property Identity Without Public Registry
-- Additive schema changes only. No existing columns/constraints modified.

-- 1. Add normalized_address for convergence lookups
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS normalized_address text;

-- 2. Add ownership lifecycle columns
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS ownership_status text NOT NULL DEFAULT 'unclaimed'
    CHECK (ownership_status IN ('unclaimed', 'claimed', 'verified'));

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES auth.users(id);

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS claimed_by_user_id uuid REFERENCES auth.users(id);

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now();

-- 3. Partial unique index: two users entering the same address converge
--    to the same record. Only applies when normalized_address is populated.
CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_normalized_address
  ON public.properties (normalized_address)
  WHERE normalized_address IS NOT NULL;

COMMIT;
