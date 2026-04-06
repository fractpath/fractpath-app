-- Extend property_review_runs.artifact_type constraint to include
-- 'mashvisor_enrichment' so manual admin enrichment runs can be stored
-- in the same audit table alongside existing rentcast/ATTOM artifacts.
--
-- Safe pattern: drop + recreate constraint (idempotent if re-applied).

ALTER TABLE property_review_runs
  DROP CONSTRAINT IF EXISTS property_review_runs_artifact_type_check;

ALTER TABLE property_review_runs
  ADD CONSTRAINT property_review_runs_artifact_type_check
    CHECK (artifact_type IN (
      'property_profile',
      'avm',
      'enhanced_screening',
      'mashvisor_enrichment'
    ));

-- Also extend the provider column constraint if one exists (idempotent).
-- Mashvisor runs use provider = 'mashvisor'.
ALTER TABLE property_review_runs
  DROP CONSTRAINT IF EXISTS property_review_runs_provider_check;
