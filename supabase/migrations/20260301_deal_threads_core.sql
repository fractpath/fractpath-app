BEGIN;

-- ============================================================
-- Sprint 12 / Phase 2 — Deal Thread Core
-- Private negotiation container: deal_threads + participants
-- ============================================================

-- 1. deal_threads
CREATE TABLE IF NOT EXISTS public.deal_threads (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id         uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  status              text NOT NULL DEFAULT 'pending_owner'
                        CHECK (status IN ('draft','pending_owner','negotiating','decision_pending','accepted','closed')),
  created_by_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  buyer_user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  owner_user_id       uuid NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  current_proposal_id uuid NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_threads_property_id
  ON public.deal_threads (property_id);

CREATE INDEX IF NOT EXISTS idx_deal_threads_buyer_user_id
  ON public.deal_threads (buyer_user_id);

CREATE INDEX IF NOT EXISTS idx_deal_threads_owner_user_id
  ON public.deal_threads (owner_user_id);

DROP TRIGGER IF EXISTS trg_deal_threads_updated_at ON public.deal_threads;
CREATE TRIGGER trg_deal_threads_updated_at
  BEFORE UPDATE ON public.deal_threads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. deal_thread_participants
CREATE TABLE IF NOT EXISTS public.deal_thread_participants (
  thread_id   uuid NOT NULL REFERENCES public.deal_threads(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('buyer','owner','reviewer')),
  permission  text NOT NULL CHECK (permission IN ('read','comment','propose','decide')),
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_thread_participants_user
  ON public.deal_thread_participants (user_id);

DROP TRIGGER IF EXISTS trg_deal_thread_participants_updated_at ON public.deal_thread_participants;
CREATE TRIGGER trg_deal_thread_participants_updated_at
  BEFORE UPDATE ON public.deal_thread_participants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 3. RLS — deal_threads
-- ============================================================
ALTER TABLE public.deal_threads ENABLE ROW LEVEL SECURITY;

-- SELECT: visible iff active participant
DROP POLICY IF EXISTS "deal_threads_select_participant" ON public.deal_threads;
CREATE POLICY "deal_threads_select_participant"
  ON public.deal_threads FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deal_thread_participants p
      WHERE p.thread_id = public.deal_threads.id
        AND p.user_id = auth.uid()
        AND p.status = 'active'
    )
  );

-- INSERT: only buyer creating own thread
DROP POLICY IF EXISTS "deal_threads_insert_buyer" ON public.deal_threads;
CREATE POLICY "deal_threads_insert_buyer"
  ON public.deal_threads FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by_user_id = auth.uid()
    AND buyer_user_id = auth.uid()
  );

-- UPDATE: creator can update status while in mutable states
DROP POLICY IF EXISTS "deal_threads_update_creator" ON public.deal_threads;
CREATE POLICY "deal_threads_update_creator"
  ON public.deal_threads FOR UPDATE
  TO authenticated
  USING (
    created_by_user_id = auth.uid()
    AND status IN ('draft','pending_owner','negotiating','decision_pending')
  )
  WITH CHECK (
    created_by_user_id = auth.uid()
  );

-- DELETE: denied
DROP POLICY IF EXISTS "deal_threads_deny_delete" ON public.deal_threads;
CREATE POLICY "deal_threads_deny_delete"
  ON public.deal_threads FOR DELETE
  TO authenticated
  USING (false);

-- ============================================================
-- 4. RLS — deal_thread_participants
-- ============================================================
ALTER TABLE public.deal_thread_participants ENABLE ROW LEVEL SECURITY;

-- SELECT: see participant rows for threads you participate in
DROP POLICY IF EXISTS "thread_participants_select" ON public.deal_thread_participants;
CREATE POLICY "thread_participants_select"
  ON public.deal_thread_participants FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deal_thread_participants p2
      WHERE p2.thread_id = public.deal_thread_participants.thread_id
        AND p2.user_id = auth.uid()
        AND p2.status = 'active'
    )
  );

-- INSERT: only self, buyer role, propose permission, active
DROP POLICY IF EXISTS "thread_participants_insert_self" ON public.deal_thread_participants;
CREATE POLICY "thread_participants_insert_self"
  ON public.deal_thread_participants FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'buyer'
    AND permission = 'propose'
    AND status = 'active'
  );

-- UPDATE: denied for now
DROP POLICY IF EXISTS "thread_participants_deny_update" ON public.deal_thread_participants;
CREATE POLICY "thread_participants_deny_update"
  ON public.deal_thread_participants FOR UPDATE
  TO authenticated
  USING (false);

-- DELETE: denied
DROP POLICY IF EXISTS "thread_participants_deny_delete" ON public.deal_thread_participants;
CREATE POLICY "thread_participants_deny_delete"
  ON public.deal_thread_participants FOR DELETE
  TO authenticated
  USING (false);

COMMIT;
