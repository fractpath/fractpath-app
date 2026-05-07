-- ============================================================
-- T005: Data repair — advance deals stuck before ACCEPTED
--
-- Run this in Supabase SQL Editor (or psql).
-- Always run the DRY-RUN section first and review the output
-- before running the REPAIR section.
-- ============================================================


-- ──────────────────────────────────────────────────────────────
-- STEP 1 — DRY RUN
-- Shows every deal that has an OFFER_ACCEPTED event but whose
-- status column has not yet reached ACCEPTED.
-- Expect zero rows once the repair is complete.
-- ──────────────────────────────────────────────────────────────
SELECT
  d.id              AS deal_id,
  d.status          AS current_status,
  d.accepted_at,
  d.admin_voided_at,
  ev.id             AS offer_accepted_event_id,
  ev.created_at     AS offer_accepted_at,
  ev.payload        AS event_payload
FROM deals d
INNER JOIN deal_events ev
  ON  ev.deal_id    = d.id
  AND ev.event_type = 'OFFER_ACCEPTED'
WHERE d.status NOT IN ('ACCEPTED', 'CLOSED')
  AND d.admin_voided_at IS NULL
ORDER BY ev.created_at DESC;


-- ──────────────────────────────────────────────────────────────
-- STEP 2 — REPAIR  (run only after reviewing dry-run output)
--
-- Sub-step A: DRAFT → PROPOSED for any deals that never got the
-- PROPOSED transition (should be rare; belt-and-suspenders).
-- ──────────────────────────────────────────────────────────────
UPDATE deals
SET status = 'PROPOSED'
WHERE status = 'DRAFT'
  AND id IN (
    SELECT DISTINCT deal_id
    FROM deal_events
    WHERE event_type = 'OFFER_ACCEPTED'
  )
RETURNING id, status AS new_status;


-- ──────────────────────────────────────────────────────────────
-- Sub-step B: PROPOSED → ACCEPTED for all remaining stuck deals.
-- Sets accepted_at to the timestamp of the OFFER_ACCEPTED event
-- when the column is still NULL (i.e. trigger never ran).
-- ──────────────────────────────────────────────────────────────
UPDATE deals
SET
  status      = 'ACCEPTED',
  accepted_at = COALESCE(
    accepted_at,
    (
      SELECT ev2.created_at
      FROM deal_events ev2
      WHERE ev2.deal_id    = deals.id
        AND ev2.event_type = 'OFFER_ACCEPTED'
      ORDER BY ev2.created_at DESC
      LIMIT 1
    )
  )
WHERE status = 'PROPOSED'
  AND id IN (
    SELECT DISTINCT deal_id
    FROM deal_events
    WHERE event_type = 'OFFER_ACCEPTED'
  )
RETURNING id, status AS new_status, accepted_at;


-- ──────────────────────────────────────────────────────────────
-- STEP 3 — POST-REPAIR VERIFICATION
-- Should return zero rows.
-- ──────────────────────────────────────────────────────────────
SELECT
  d.id          AS deal_id,
  d.status      AS current_status,
  d.accepted_at
FROM deals d
INNER JOIN deal_events ev
  ON  ev.deal_id    = d.id
  AND ev.event_type = 'OFFER_ACCEPTED'
WHERE d.status NOT IN ('ACCEPTED', 'CLOSED')
  AND d.admin_voided_at IS NULL;
