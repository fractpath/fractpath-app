# Phase 3: Archive Deal (Soft-Delete)

## What Archive Means

Archiving a deal is a soft-delete operation. The deal row is NOT deleted. Instead:

- `deals.archived_at` is set to the current timestamp
- `deals.archived_by` is set to the archiving user's ID
- The archiving user's `deal_access_grants` rows for that deal are revoked (`revoked_at = now()`)

The deal, its snapshots, events, threads, and proposals remain in the database for compliance retention.

## What Access Is Revoked

- Only the caller's grants are revoked (not other participants')
- If the caller is the property owner and there are other participants (e.g., buyer), their access remains unless explicitly revoked in a future phase
- The archived deal is blocked at the page level: both the primary path (RLS-gated) and the owner fallback path check `archived_at` and show an "archived" message

## What Is Retained for Compliance

All of the following remain in the database unchanged:

- `deals` row (with `archived_at` and `archived_by` set)
- `deal_snapshots` (all versions)
- `deal_events` (full audit trail)
- `deal_threads` and `deal_proposals`
- `deal_access_grants` (with `revoked_at` set for the archiver)
- `deal_versions`

## DB Schema Changes

```sql
alter table public.deals add column if not exists archived_at timestamptz;
alter table public.deals add column if not exists archived_by uuid;
create index if not exists idx_deals_archived_at on public.deals(archived_at) where archived_at is not null;
```

## API Endpoint

**POST /api/deals/[dealId]/archive**

- Auth: requires authenticated user
- Authorization: caller must have OWNER grant OR be `deals.owner_user_id`
- Idempotent: returns `{ ok: true, already_archived: true }` if already archived
- On success: sets `archived_at`, revokes caller's grants, returns `{ ok: true }`
- On failure: returns `{ ok: false, error: "..." }` with appropriate status code

## Dashboard Behavior

Archived deals are excluded from:

- "My Deals" section (owner cards filter by `byId.has()` which excludes archived deals)
- "Offers waiting approval" section (pending approval cards filtered by `byId.has()`)
- "Shared with me" section (viewer cards filter by `byId.has()`)

Filtering is done at two levels:
1. Deals query includes `archived_at` and filters out rows where `archived_at` is not null
2. Service-client query for pending-owner extra deals adds `.is("archived_at", null)`
3. All card builders check `byId.has(dealId)` before creating cards

## Deal Page Guard

Both access paths check for archived status:

1. **Primary path** (RLS-gated): After fetching the deal, if `archived_at` is set, shows "This deal has been archived" with a link back to dashboard
2. **Owner fallback path** (thread+property chain): Before allowing owner access, checks `archived_at` via service client and blocks if archived

## Reversibility

- Archive is only reversible by admin/service (direct DB update)
- No unarchive UI is provided in this phase
- To unarchive: `UPDATE deals SET archived_at = NULL, archived_by = NULL WHERE id = '<dealId>';`
- Grants would need to be re-created manually

## DB Verification Commands

```sql
-- Confirm columns exist
\d+ public.deals

-- Check a specific deal
SELECT id, archived_at, archived_by FROM public.deals WHERE id = '<dealId>';

-- Check caller grants revoked
SELECT deal_id, user_id, role, revoked_at FROM public.deal_access_grants
  WHERE deal_id = '<dealId>' AND user_id = '<userId>';
```

## Manual Test Plan

### 1. Archive a deal
- Navigate to a deal you own
- Click "Archive" in the actions bar
- Confirm in the modal
- Verify redirect to /dashboard
- Verify deal no longer appears in dashboard

### 2. Archived deal page access
- Navigate directly to `/deal/<archivedDealId>`
- Verify "This deal has been archived" message is shown
- Verify link back to dashboard works

### 3. Idempotent archive
- Call `POST /api/deals/<dealId>/archive` again
- Verify `{ ok: true, already_archived: true }` response

### 4. Non-owner cannot archive
- As a VIEWER user, call `POST /api/deals/<dealId>/archive`
- Verify 403 Forbidden response

### 5. Dashboard exclusion
- Verify archived deals do not appear in "My Deals"
- Verify archived deals do not appear in "Offers waiting approval"
- Verify archived deals do not appear in "Shared with me"

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/20260305000000_archive_deals.sql` | New — adds `archived_at`, `archived_by` columns + index |
| `src/app/api/deals/[dealId]/archive/route.ts` | New — POST endpoint for archiving |
| `src/components/deal/ArchiveDealModal.tsx` | Updated — wired to call archive endpoint, redirect on success |
| `src/components/deal/DealActionsBar.tsx` | Updated — passes `dealId` to ArchiveDealModal |
| `src/app/dashboard/page.tsx` | Updated — filters out archived deals from all card lists |
| `src/app/deal/[dealId]/page.tsx` | Updated — archive guard on both access paths |
