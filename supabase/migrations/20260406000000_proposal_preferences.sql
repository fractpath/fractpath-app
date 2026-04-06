-- Add owner proposal preference columns to the properties table.
-- All three columns are safe to add to existing rows:
--   proposal_interest_status defaults to 'not_interested' (no change in behavior)
--   visibility_preference defaults to 'private' (no change in behavior)
--   proposal_preferences_acknowledged_at is nullable (null = not yet acknowledged)

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS proposal_interest_status TEXT NOT NULL DEFAULT 'not_interested',
  ADD COLUMN IF NOT EXISTS visibility_preference TEXT NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS proposal_preferences_acknowledged_at TIMESTAMPTZ;
