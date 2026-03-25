-- Add resolved_note column to deal_review_requests for admin outcome notes at resolution time.
ALTER TABLE deal_review_requests ADD COLUMN IF NOT EXISTS resolved_note text;
