-- Phase 1: Canonical verification_state machine + appraisal badge + derived underwriting fields
--
-- All columns added with IF NOT EXISTS so this migration is idempotent.
--
-- Field mapping — reused existing columns (NO new column added):
--   owner_verified_at               → properties.verified_at
--   current_controlling_fmv         → properties.latest_verified_fmv
--   current_raw_available_cash      → properties.max_accessible_cash_current
--   current_controlling_value_source→ properties.fmv_verification_source  (unconstrained; existing
--                                      code writes non-canonical value 'manual_appraisal_sim')
--   verified_appraisal_value_valid_until → properties.property_review_expires_at (or
--                                          property_review_summary.fmv_expires_at for full detail)
--
-- Fields added by this migration (no close existing equivalent):
--   verification_state                     — 7-state canonical verification machine
--   owner_verification_removed_at          — timestamp of Owner Verified badge revocation
--   owner_verification_removed_reason      — free-text reason for revocation
--   verified_appraisal_value_status        — public appraisal badge enum
--   verified_appraisal_value_context_owner_id — owner whose context the appraisal was verified in
--   current_fractpath_eligible_cash_cap    — policy-adjusted eligible cash (after LTV + policy overlays)
--   current_eligibility_posture            — coarse eligibility signal (eligible/ineligible/under_review/…)
--   current_limiting_factors_json          — structured limiting factors (for admin display)

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. verification_state
--    Seven canonical states.  Default is 'intake_pending' for all existing rows.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS verification_state text NOT NULL DEFAULT 'intake_pending';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_properties_verification_state'
      AND conrelid = 'public.properties'::regclass
  ) THEN
    ALTER TABLE public.properties
      ADD CONSTRAINT chk_properties_verification_state
      CHECK (verification_state IN (
        'intake_pending',
        'owner_verified',
        'screening_in_progress',
        'owner_clarification_required',
        'manual_review_required',
        'verified_for_deals',
        'ineligible'
      ));
  END IF;
END$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Owner Verified badge revocation audit fields
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS owner_verification_removed_at     timestamptz,
  ADD COLUMN IF NOT EXISTS owner_verification_removed_reason text;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. verified_appraisal_value_status
--    Drives the public "Verified Appraisal Value" badge.
--    'none' means no appraisal value has been verified yet.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS verified_appraisal_value_status text NOT NULL DEFAULT 'none';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_properties_verified_appraisal_value_status'
      AND conrelid = 'public.properties'::regclass
  ) THEN
    ALTER TABLE public.properties
      ADD CONSTRAINT chk_properties_verified_appraisal_value_status
      CHECK (verified_appraisal_value_status IN ('none', 'active', 'expired', 'under_review'));
  END IF;
END$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. verified_appraisal_value_context_owner_id
--    Which owner's property context the appraisal value was verified against.
--    Needed to detect stale appraisal values when ownership changes.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS verified_appraisal_value_context_owner_id uuid
    REFERENCES auth.users(id);

-- ────────────────────────────────────────────────────────────────────────────
-- 5. current_fractpath_eligible_cash_cap
--    The policy-adjusted eligible cash ceiling after LTV math, debt deduction,
--    and any policy overlays.  Distinct from max_accessible_cash_current which
--    is the raw LTV-minus-debt value.  NULL until first admin/system computation.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS current_fractpath_eligible_cash_cap numeric(14,2);

-- ────────────────────────────────────────────────────────────────────────────
-- 6. current_eligibility_posture
--    Coarse eligibility signal persisted alongside the deal triage signals.
--    Allows quick admin list filtering without re-running triage math.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS current_eligibility_posture text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_properties_current_eligibility_posture'
      AND conrelid = 'public.properties'::regclass
  ) THEN
    ALTER TABLE public.properties
      ADD CONSTRAINT chk_properties_current_eligibility_posture
      CHECK (current_eligibility_posture IS NULL OR current_eligibility_posture IN (
        'eligible',
        'ineligible',
        'under_review',
        'requires_enhanced_review',
        'blocked'
      ));
  END IF;
END$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. current_limiting_factors_json
--    Structured list of limiting factors (reason codes + human labels) that
--    caused the current eligibility posture.  Admin-only; never exposed to buyers.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS current_limiting_factors_json jsonb;

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- VERIFICATION QUERIES (run after applying)
-- ────────────────────────────────────────────────────────────────────────────
-- SELECT verification_state, count(*) FROM properties GROUP BY 1;
-- SELECT conname FROM pg_constraint WHERE conrelid = 'public.properties'::regclass AND contype = 'c';
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'properties'
--   ORDER BY ordinal_position;
