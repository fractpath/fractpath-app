-- Add property-review workflow layer to properties.
-- These fields are SEPARATE from properties.status (unverified/under_review/verified/archived).
-- property_review_status tracks the reusable diligence stage used across deals.
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS property_review_status text,
  ADD COLUMN IF NOT EXISTS property_review_status_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS property_review_note text,
  ADD COLUMN IF NOT EXISTS property_review_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS property_review_completed_at timestamptz;
