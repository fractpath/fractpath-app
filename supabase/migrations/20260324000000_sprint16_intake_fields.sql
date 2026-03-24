-- Sprint 16: Pre-review intake fields on properties
-- All columns are nullable; existing rows are unaffected.
-- These fields are captured by the homeowner during PropertyForm submission
-- and are admin-only in projections (not exposed via public/claimable shapes).

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS ownership_type                   text,
  ADD COLUMN IF NOT EXISTS occupancy_use                    text,
  ADD COLUMN IF NOT EXISTS occupancy_use_other              text,
  ADD COLUMN IF NOT EXISTS major_condition_issue            text,
  ADD COLUMN IF NOT EXISTS major_condition_issue_details    text,
  ADD COLUMN IF NOT EXISTS known_liens_and_claims           text[],
  ADD COLUMN IF NOT EXISTS total_known_debt_amount          numeric,
  ADD COLUMN IF NOT EXISTS total_known_debt_confidence      text,
  ADD COLUMN IF NOT EXISTS debt_statement_availability      text,
  ADD COLUMN IF NOT EXISTS title_claims_known               text,
  ADD COLUMN IF NOT EXISTS title_claims_details             text,
  ADD COLUMN IF NOT EXISTS owner_stated_fmv                 numeric,
  ADD COLUMN IF NOT EXISTS owner_stated_fmv_confidence      text,
  ADD COLUMN IF NOT EXISTS owner_stated_fmv_source          text,
  ADD COLUMN IF NOT EXISTS owner_stated_fmv_source_other    text,
  ADD COLUMN IF NOT EXISTS willing_to_proceed_formal_review text;

-- Check constraints for enumerated text fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_ownership_type'
  ) THEN
    ALTER TABLE public.properties
      ADD CONSTRAINT chk_ownership_type CHECK (
        ownership_type IS NULL OR
        ownership_type IN ('sole_owner', 'co_owner', 'trust', 'estate', 'not_sure')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_occupancy_use'
  ) THEN
    ALTER TABLE public.properties
      ADD CONSTRAINT chk_occupancy_use CHECK (
        occupancy_use IS NULL OR
        occupancy_use IN ('primary', 'rental', 'vacant', 'second_home', 'other')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_major_condition_issue'
  ) THEN
    ALTER TABLE public.properties
      ADD CONSTRAINT chk_major_condition_issue CHECK (
        major_condition_issue IS NULL OR
        major_condition_issue IN ('no', 'yes', 'not_sure')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_total_known_debt_confidence'
  ) THEN
    ALTER TABLE public.properties
      ADD CONSTRAINT chk_total_known_debt_confidence CHECK (
        total_known_debt_confidence IS NULL OR
        total_known_debt_confidence IN ('exact', 'estimate', 'not_sure')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_debt_statement_availability'
  ) THEN
    ALTER TABLE public.properties
      ADD CONSTRAINT chk_debt_statement_availability CHECK (
        debt_statement_availability IS NULL OR
        debt_statement_availability IN ('yes', 'partially', 'no')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_title_claims_known'
  ) THEN
    ALTER TABLE public.properties
      ADD CONSTRAINT chk_title_claims_known CHECK (
        title_claims_known IS NULL OR
        title_claims_known IN ('no', 'yes', 'not_sure')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_owner_stated_fmv_confidence'
  ) THEN
    ALTER TABLE public.properties
      ADD CONSTRAINT chk_owner_stated_fmv_confidence CHECK (
        owner_stated_fmv_confidence IS NULL OR
        owner_stated_fmv_confidence IN ('very_confident', 'somewhat', 'low', 'not_sure')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_owner_stated_fmv_source'
  ) THEN
    ALTER TABLE public.properties
      ADD CONSTRAINT chk_owner_stated_fmv_source CHECK (
        owner_stated_fmv_source IS NULL OR
        owner_stated_fmv_source IN ('appraisal', 'realtor_cma', 'online', 'personal', 'offer_listing', 'other')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_willing_to_proceed_formal_review'
  ) THEN
    ALTER TABLE public.properties
      ADD CONSTRAINT chk_willing_to_proceed_formal_review CHECK (
        willing_to_proceed_formal_review IS NULL OR
        willing_to_proceed_formal_review IN ('yes', 'maybe', 'no')
      );
  END IF;
END $$;
