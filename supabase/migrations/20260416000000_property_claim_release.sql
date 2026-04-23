BEGIN;

-- ================================================================
-- Property Claim Release — schema additions
-- Sprint: claim-release
-- ================================================================

-- 1. Expand deal_threads.status check to include terminal claim-release statuses
--    Drop and recreate the inline check constraint.
ALTER TABLE public.deal_threads
  DROP CONSTRAINT IF EXISTS deal_threads_status_check;

ALTER TABLE public.deal_threads
  ADD CONSTRAINT deal_threads_status_check
  CHECK (status IN (
    'draft',
    'pending_owner',
    'negotiating',
    'decision_pending',
    'accepted',
    'closed',
    'closed_due_to_claim_release',
    'voided_by_admin'
  ));

-- 2a. Make owner_user_id nullable to support claim release (owner link is removed on release)
ALTER TABLE public.properties
  ALTER COLUMN owner_user_id DROP NOT NULL;

-- 2b. Add admin_hold and claim_released_at to properties
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS admin_hold        boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS claim_released_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_properties_admin_hold
  ON public.properties (admin_hold) WHERE admin_hold = true;

-- 3. property_claim_events — append-only audit log
CREATE TABLE IF NOT EXISTS public.property_claim_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  uuid        NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  event_type   text        NOT NULL,
  actor_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role   text,
  reason_code  text,
  notes        text,
  deal_ids     uuid[],
  metadata     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_claim_events_property_id
  ON public.property_claim_events (property_id);

CREATE INDEX IF NOT EXISTS idx_property_claim_events_event_type
  ON public.property_claim_events (event_type);

-- No UPDATE, no DELETE — append only
ALTER TABLE public.property_claim_events ENABLE ROW LEVEL SECURITY;

-- Service role has full access; authenticated users have read on their own property events
CREATE POLICY "service_role_all_claim_events"
  ON public.property_claim_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "owner_read_own_claim_events"
  ON public.property_claim_events
  FOR SELECT
  TO authenticated
  USING (
    property_id IN (
      SELECT id FROM public.properties
      WHERE owner_user_id = auth.uid()
    )
  );

COMMIT;
