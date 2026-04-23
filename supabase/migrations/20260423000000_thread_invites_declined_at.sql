-- Adds declined_at to thread_invites to record per-recipient "not my property" dismissals.
-- The property itself remains unclaimed and claimable by another owner.
ALTER TABLE thread_invites ADD COLUMN IF NOT EXISTS declined_at timestamptz;
