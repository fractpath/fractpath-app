-- Add 'enhanced_screening' to the property_review_runs artifact_type check constraint.
--
-- Background: property_review_runs was created with a check constraint that only
-- permitted 'property_profile' and 'avm' (RentCast artifact types). The ATTOM
-- enhanced screening service writes artifact_type = 'enhanced_screening' (the value
-- of SCREENING_ARTIFACT_TYPE in src/lib/property/screening.ts), which the original
-- constraint rejects.
--
-- Safe pattern:
--   1. Drop the existing constraint (IF EXISTS — idempotent if already re-applied).
--   2. Recreate with all three permitted values.
--
-- This migration never touches row data; it only modifies the table constraint.

ALTER TABLE property_review_runs
  DROP CONSTRAINT IF EXISTS property_review_runs_artifact_type_check;

ALTER TABLE property_review_runs
  ADD CONSTRAINT property_review_runs_artifact_type_check
    CHECK (artifact_type IN ('property_profile', 'avm', 'enhanced_screening'));
