-- Generalised per-user, per-thread "not my property" dismissal record.
-- Works for all claimable-card bridges (invite, participant, owner_user_id, access grant).
-- A dismissal hides the property card for this user only;
-- the property remains unclaimed and claimable by another owner.

CREATE TABLE IF NOT EXISTS public.thread_claim_dismissals (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   uuid        NOT NULL REFERENCES public.deal_threads(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (thread_id, user_id)
);

-- Used by /api/me/properties to filter dismissed threads in one shot.
CREATE INDEX IF NOT EXISTS idx_tcd_user_id
  ON public.thread_claim_dismissals (user_id);

ALTER TABLE public.thread_claim_dismissals ENABLE ROW LEVEL SECURITY;

-- Users can read their own dismissals (needed for client-side checks if ever exposed).
CREATE POLICY "tcd_select_own"
  ON public.thread_claim_dismissals FOR SELECT
  USING (user_id = auth.uid());

-- Users can insert their own dismissals (service client routes bypass RLS;
-- this policy protects direct API access).
CREATE POLICY "tcd_insert_own"
  ON public.thread_claim_dismissals FOR INSERT
  WITH CHECK (user_id = auth.uid());
