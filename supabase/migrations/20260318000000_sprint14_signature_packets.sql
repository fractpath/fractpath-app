-- Sprint 14 Prompt 1: Active Deal Signature Execution — Schema + RLS
-- Tables: deal_signature_packets, deal_signature_recipients, deal_signature_events
-- RLS: read via existing has_active_deal_grant; no client write paths.

BEGIN;

-- ============================================================
-- 1. deal_signature_packets
-- ============================================================
CREATE TABLE IF NOT EXISTS public.deal_signature_packets (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id                  uuid        NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  thread_id                uuid        NULL     REFERENCES public.deal_threads(id) ON DELETE SET NULL,
  provider                 text        NOT NULL CHECK (provider IN ('docusign')),
  packet_version           integer     NOT NULL DEFAULT 1,
  status                   text        NOT NULL CHECK (status IN (
                             'prepared','sent','delivered','partially_signed',
                             'completed','declined','voided','error'
                           )),
  template_key             text        NULL,
  provider_envelope_id     text        NULL,
  prepared_snapshot_json   jsonb       NOT NULL,
  provider_payload_json    jsonb       NULL,
  provider_last_status     text        NULL,
  executed_document_path   text        NULL,
  certificate_document_path text       NULL,
  sent_at                  timestamptz NULL,
  completed_at             timestamptz NULL,
  voided_at                timestamptz NULL,
  declined_at              timestamptz NULL,
  supersedes_packet_id     uuid        NULL REFERENCES public.deal_signature_packets(id) ON DELETE SET NULL,
  superseded_by_packet_id  uuid        NULL REFERENCES public.deal_signature_packets(id) ON DELETE SET NULL,
  last_error               text        NULL,
  created_by               uuid        NOT NULL REFERENCES auth.users(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sig_packets_deal_id
  ON public.deal_signature_packets (deal_id);

CREATE INDEX IF NOT EXISTS idx_sig_packets_thread_id
  ON public.deal_signature_packets (thread_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sig_packets_envelope_id_unique
  ON public.deal_signature_packets (provider_envelope_id)
  WHERE provider_envelope_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sig_packets_status
  ON public.deal_signature_packets (status);

CREATE INDEX IF NOT EXISTS idx_sig_packets_created_at_desc
  ON public.deal_signature_packets (created_at DESC);

-- updated_at trigger (reuse existing set_updated_at function)
DROP TRIGGER IF EXISTS trg_sig_packets_set_updated_at ON public.deal_signature_packets;
CREATE TRIGGER trg_sig_packets_set_updated_at
  BEFORE UPDATE ON public.deal_signature_packets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 2. deal_signature_recipients
-- ============================================================
CREATE TABLE IF NOT EXISTS public.deal_signature_recipients (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id            uuid        NOT NULL REFERENCES public.deal_signature_packets(id) ON DELETE CASCADE,
  role                 text        NOT NULL CHECK (role IN ('Buyer', 'Owner')),
  user_id              uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name         text        NOT NULL,
  email                text        NOT NULL,
  routing_order        integer     NOT NULL,
  provider_recipient_id text       NULL,
  provider_status      text        NULL,
  signed_at            timestamptz NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_sig_recipients_packet_role UNIQUE (packet_id, role)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sig_recipients_packet_id
  ON public.deal_signature_recipients (packet_id);

CREATE INDEX IF NOT EXISTS idx_sig_recipients_email
  ON public.deal_signature_recipients (email);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_sig_recipients_set_updated_at ON public.deal_signature_recipients;
CREATE TRIGGER trg_sig_recipients_set_updated_at
  BEFORE UPDATE ON public.deal_signature_recipients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 3. deal_signature_events
-- ============================================================
CREATE TABLE IF NOT EXISTS public.deal_signature_events (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id            uuid        NOT NULL REFERENCES public.deal_signature_packets(id) ON DELETE CASCADE,
  provider             text        NOT NULL CHECK (provider IN ('docusign')),
  provider_event_type  text        NOT NULL,
  provider_event_at    timestamptz NULL,
  payload_json         jsonb       NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sig_events_packet_id
  ON public.deal_signature_events (packet_id);

CREATE INDEX IF NOT EXISTS idx_sig_events_provider_event_type
  ON public.deal_signature_events (provider_event_type);

CREATE INDEX IF NOT EXISTS idx_sig_events_created_at_desc
  ON public.deal_signature_events (created_at DESC);

-- ============================================================
-- 4. Enable RLS on all three tables
-- ============================================================
ALTER TABLE public.deal_signature_packets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_signature_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_signature_events     ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. RLS: deal_signature_packets
--    SELECT: user has active grant on the parent deal
--    No client INSERT / UPDATE / DELETE
-- ============================================================
DROP POLICY IF EXISTS "sig_packets_select_via_deal_grant" ON public.deal_signature_packets;
CREATE POLICY "sig_packets_select_via_deal_grant"
  ON public.deal_signature_packets
  FOR SELECT
  TO authenticated
  USING (
    public.has_active_deal_grant(deal_id, auth.uid())
  );

DROP POLICY IF EXISTS "sig_packets_deny_insert" ON public.deal_signature_packets;
CREATE POLICY "sig_packets_deny_insert"
  ON public.deal_signature_packets
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "sig_packets_deny_update" ON public.deal_signature_packets;
CREATE POLICY "sig_packets_deny_update"
  ON public.deal_signature_packets
  FOR UPDATE
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS "sig_packets_deny_delete" ON public.deal_signature_packets;
CREATE POLICY "sig_packets_deny_delete"
  ON public.deal_signature_packets
  FOR DELETE
  TO authenticated
  USING (false);

-- ============================================================
-- 6. RLS: deal_signature_recipients
--    SELECT: user has active grant on the parent deal (join through packet)
--    No client INSERT / UPDATE / DELETE
-- ============================================================
DROP POLICY IF EXISTS "sig_recipients_select_via_deal_grant" ON public.deal_signature_recipients;
CREATE POLICY "sig_recipients_select_via_deal_grant"
  ON public.deal_signature_recipients
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.deal_signature_packets p
      WHERE p.id = packet_id
        AND public.has_active_deal_grant(p.deal_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "sig_recipients_deny_insert" ON public.deal_signature_recipients;
CREATE POLICY "sig_recipients_deny_insert"
  ON public.deal_signature_recipients
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "sig_recipients_deny_update" ON public.deal_signature_recipients;
CREATE POLICY "sig_recipients_deny_update"
  ON public.deal_signature_recipients
  FOR UPDATE
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS "sig_recipients_deny_delete" ON public.deal_signature_recipients;
CREATE POLICY "sig_recipients_deny_delete"
  ON public.deal_signature_recipients
  FOR DELETE
  TO authenticated
  USING (false);

-- ============================================================
-- 7. RLS: deal_signature_events
--    SELECT: user has active grant on the parent deal (join through packet)
--    No client INSERT / UPDATE / DELETE
-- ============================================================
DROP POLICY IF EXISTS "sig_events_select_via_deal_grant" ON public.deal_signature_events;
CREATE POLICY "sig_events_select_via_deal_grant"
  ON public.deal_signature_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.deal_signature_packets p
      WHERE p.id = packet_id
        AND public.has_active_deal_grant(p.deal_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "sig_events_deny_insert" ON public.deal_signature_events;
CREATE POLICY "sig_events_deny_insert"
  ON public.deal_signature_events
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "sig_events_deny_update" ON public.deal_signature_events;
CREATE POLICY "sig_events_deny_update"
  ON public.deal_signature_events
  FOR UPDATE
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS "sig_events_deny_delete" ON public.deal_signature_events;
CREATE POLICY "sig_events_deny_delete"
  ON public.deal_signature_events
  FOR DELETE
  TO authenticated
  USING (false);

COMMIT;
