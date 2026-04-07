-- Dedicated table for third-party property enrichment data.
-- Mashvisor (and future providers) write here rather than to property_review_runs.
-- One current row per property+provider enforced by partial unique index.

CREATE TABLE IF NOT EXISTS property_enrichments (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id        uuid        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  provider           text        NOT NULL CHECK (provider IN ('mashvisor')),
  provider_record_id text,
  status             text        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'completed', 'failed')),
  is_current         boolean     NOT NULL DEFAULT true,
  source_address     jsonb,
  raw_payload        jsonb,
  summary_payload    jsonb,
  images_payload     jsonb,
  fetched_at         timestamptz,
  error_message      text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_enrichments_property_id
  ON property_enrichments (property_id);

CREATE INDEX IF NOT EXISTS idx_property_enrichments_property_provider
  ON property_enrichments (property_id, provider);

-- Only one current row per property+provider.
CREATE UNIQUE INDEX IF NOT EXISTS idx_property_enrichments_current
  ON property_enrichments (property_id, provider)
  WHERE is_current = true;
