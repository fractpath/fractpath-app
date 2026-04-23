-- Remediate properties that were released (claim_released_at IS NOT NULL, owner_user_id IS NULL)
-- but still carry stale ownership_status = 'claimed' or a populated claimed_by_user_id.
--
-- This was caused by an omission in the release purge payload: ownership_status and
-- claimed_by_user_id were not included, so they were left set from the original claim.
-- The add-property address-lookup flow reads ownership_status directly to determine
-- whether to show "A homeowner is connected to this address" — fixing these fields
-- corrects that inference without touching any deal history.
--
-- Safe to re-run: the WHERE clause is idempotent (only updates rows that still have stale values).

UPDATE properties
SET
  ownership_status  = 'unclaimed',
  claimed_by_user_id = NULL
WHERE
  claim_released_at IS NOT NULL
  AND owner_user_id IS NULL
  AND (
    ownership_status  <> 'unclaimed'
    OR claimed_by_user_id IS NOT NULL
  );
