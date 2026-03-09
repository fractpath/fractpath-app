# Option B Phase 2b — Property Owner Grant Minting Log

Date: 2026-03-05

## Files changed

- `src/app/api/deals/[dealId]/submit-offer/route.ts`
- `docs/option-b/phase2b-owner-grant-minting-log.md` (this file)

---

## BEFORE/AFTER

### `src/app/api/deals/[dealId]/submit-offer/route.ts`

**BEFORE** (lines 222–224):
```ts
  if (dealOwnerUpdErr) {
    console.error("submit_offer_set_deal_owner_error", dealOwnerUpdErr);
    return json(500, { error: dealOwnerUpdErr.message });
  }

  // IMPORTANT: move the deal out of DRAFT into the review state expected by the DB transition guard.
```

**AFTER** (lines 222–248):
```ts
  if (dealOwnerUpdErr) {
    console.error("submit_offer_set_deal_owner_error", dealOwnerUpdErr);
    return json(500, { error: dealOwnerUpdErr.message });
  }

  if (propRow.owner_user_id) {
    const { error: ownerGrantErr } = await (
      svc.from("deal_access_grants") as any
    ).upsert(
      {
        deal_id: dealId,
        user_id: propRow.owner_user_id,
        role: "OWNER",
        created_by: user.id,
        revoked_at: null,
        expires_at: null,
      },
      { onConflict: "deal_id,user_id" },
    );

    if (ownerGrantErr) {
      console.error("submit_offer_mint_owner_grant_error", ownerGrantErr);
      return json(500, { error: ownerGrantErr.message });
    }
  }

  // IMPORTANT: move the deal out of DRAFT into the review state expected by the DB transition guard.
```

### What changed

Added 17 lines after the `deals.owner_user_id` update block. When `propRow.owner_user_id` is non-null (verified property owner resolved), the route now upserts an OWNER grant into `deal_access_grants` for that property owner.

Key design decisions:
- Uses `onConflict: "deal_id,user_id"` **without** `ignoreDuplicates` — on conflict, the row is **updated** to `role='OWNER'`, `revoked_at=null`, `expires_at=null`. This ensures the property owner always ends up with an active OWNER grant regardless of prior state (e.g., if a VIEWER row existed, or if a prior grant was revoked).
- Explicitly sets `revoked_at: null` and `expires_at: null` in the upsert payload to clear any prior revocation/expiry.

### Why this pattern

- `svc` (service client) is already in scope and used throughout this route for all writes (threads, participants, proposals, invites, deals update, events)
- `(svc.from("deal_access_grants") as any)` follows the existing `as any` cast pattern used for tables not in the generated types
- `.upsert(..., { onConflict: "deal_id,user_id" })` is similar to the pattern in `/api/deals/resume/route.ts` and `/api/deals/[dealId]/fork/route.ts`, but intentionally omits `ignoreDuplicates` so existing rows are updated to OWNER with cleared revoked_at/expires_at
- `created_by: user.id` uses the authenticated buyer's id, consistent with the event inserts in the same route
- Guard `if (propRow.owner_user_id)` ensures we only mint when a property owner actually exists (outreach/known_email modes may have null owner_user_id)
- Error handling follows the same fail-closed pattern as adjacent blocks (log + return 500)

---

## Verification commands run

### Build
```
$ npm run build
✓ Compiled successfully
All routes compiled, no errors.
```

### DB evidence (placeholder IDs — run after a live submission)

```sql
-- After submitting an offer on deal <DEAL_UUID> tied to verified property with owner <OWNER_UUID>:
PGPASSWORD="$SUPABASE_DB_PASSWORD" psql -h "$SUPABASE_DB_HOST" -p "$SUPABASE_DB_PORT" -U "$SUPABASE_DB_USER" -d "$SUPABASE_DB_NAME" -c "
  SELECT deal_id, user_id, role, revoked_at, expires_at
  FROM public.deal_access_grants
  WHERE deal_id = '<DEAL_UUID>'
  ORDER BY created_at ASC;
"

-- Expected output:
--  deal_id     | user_id      | role   | revoked_at | expires_at
-- -------------+--------------+--------+------------+-----------
--  <DEAL_UUID> | <BUYER_UUID> | OWNER  | null       | null       -- from create_deal_with_owner_grant_v2
--  <DEAL_UUID> | <OWNER_UUID> | OWNER  | null       | null       -- NEW: minted by submit-offer
```

---

## Manual scenario checklist

### S1 — Buyer submits offer on a deal tied to a verified property owner
- Buyer creates deal via `/api/deals/create` (gets OWNER grant via RPC)
- Buyer submits offer via `POST /api/deals/[dealId]/submit-offer` with `mode: "verified_owner"` and `property_id` of a verified property
- Route resolves `propRow.owner_user_id` from `properties` table
- Expected: route proceeds without error

### S2 — Route updates deals.owner_user_id to property owner
- Route executes: `svc.from("deals").update({ owner_user_id: propRow.owner_user_id }).eq("id", dealId).eq("status", "DRAFT")`
- Expected: `deals.owner_user_id` updated to the property owner's user id

### S3 — Route mints durable OWNER grant for property owner
- Route executes: `svc.from("deal_access_grants").upsert({ deal_id, user_id: propRow.owner_user_id, role: "OWNER", created_by: user.id, revoked_at: null, expires_at: null }, { onConflict: "deal_id,user_id" })`
- On insert: New row with `role='OWNER'`, `revoked_at=null`, `expires_at=null`
- On conflict (row exists): Updates to `role='OWNER'`, clears `revoked_at` and `expires_at`
- Expected: Active OWNER grant exists regardless of prior state

### S4 — Property owner can read the deal via grant path
- Property owner logs in
- Navigates to `/deal/[dealId]`
- RLS `deals_select_owner_or_viewer` policy checks: `has_active_deal_grant(id, auth.uid()) OR owner_user_id = auth.uid()`
- Expected: Deal loads via EITHER path. If legacy `owner_user_id` fallback were removed, grant path alone is sufficient.

### S5 — Idempotency: duplicate submission does not create duplicate grant
- Same buyer submits offer again (route returns 409 due to existing active thread check at lines 72-79)
- But if thread check were bypassed: upsert on PK `(deal_id, user_id)` would update the existing row to OWNER with cleared revoked_at/expires_at
- Expected: No duplicate rows, no error, existing OWNER row preserved or upgraded

### S6 — Outreach/known_email modes with null property owner
- Buyer submits offer with `mode: "outreach"` or `mode: "known_email"`
- `propRow.owner_user_id` may be null (unverified property)
- Guard `if (propRow.owner_user_id)` skips grant minting
- Expected: No grant minted, no error, offer submission succeeds normally

---

## Out of scope

- Backfilling grants for previously submitted offers (existing deals with owner_user_id but no grant)
- Changing RLS policies
- Schema changes
- Trigger modifications
- UI changes
