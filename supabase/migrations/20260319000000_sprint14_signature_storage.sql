-- ============================================================
-- Sprint 14 – Signature artifact storage bucket
-- ============================================================
-- Creates the private deal-signatures bucket for storing
-- executed agreement PDFs and certificates of completion.
-- Access is exclusively via the service role key (signed URLs).
-- No permissive RLS policies are added — the service client
-- bypasses RLS entirely.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'deal-signatures',
  'deal-signatures',
  false,                       -- private bucket
  52428800,                    -- 50 MB hard cap per file
  ARRAY['application/pdf']     -- PDFs only
)
ON CONFLICT (id) DO NOTHING;
