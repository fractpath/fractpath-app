# Option B Phase 1 — Foundations Verification Log

Date: 2026-03-04

## Task 0: Preflight Evidence Capture

### DB connectivity

- `SUPABASE_DB_URL`: **NOT SET** (no direct Postgres connection to Supabase)
- `DATABASE_URL`: Points to Replit built-in Postgres (not Supabase)
- `SUPABASE_ACCESS_TOKEN`: **NOT SET** (cannot use `supabase db push`)
- `supabase/config.toml`: **DOES NOT EXIST**
- Supabase CLI version: 2.76.16 (installed but not linked to project)
- REST API (service-role): accessible at `$SUPABASE_URL/rest/v1/`

Evidence gathering was performed via Supabase REST API with service-role key.

### deal_access_grants table (EXISTS)

Query: `GET /rest/v1/deal_access_grants?select=*&limit=1`

```json
[{
  "deal_id": "5ef8d9c7-ed3d-4b62-8020-499604af94d0",
  "user_id": "acfced38-b37b-49f9-ae97-1a0775979b27",
  "role": "OWNER",
  "created_at": "2026-02-10T04:37:33.011385+00:00",
  "created_by": "acfced38-b37b-49f9-ae97-1a0775979b27",
  "revoked_at": null,
  "expires_at": null
}]
```

Columns present: `deal_id, user_id, role, created_at, created_by, revoked_at, expires_at`
Column MISSING: `id` (not returned by REST API; original migration `20260210_share_access_grants_tokens.sql` defined `id uuid pk default gen_random_uuid()` but live table lacks it)

### deals table (EXISTS)

Query: `GET /rest/v1/deals?select=*&limit=1`

```json
[{
  "id": "4583aae7-7334-4b78-8341-9044c544e84a",
  "owner_user_id": "2d3a94d2-3cdd-448a-8bed-cff9108f347a",
  "status": "CLOSED",
  "created_from": "app",
  "source_ref": null,
  "created_at": "2026-02-12T12:43:51.267513+00:00",
  "mode": "app",
  "accepted_at": "2026-03-01T14:25:22.993823+00:00",
  "executed_at": "2026-03-01T14:43:30.586409+00:00",
  "funded_at": "2026-03-01T14:46:22.978183+00:00",
  "closed_at": "2026-03-01T14:47:02.342844+00:00"
}]
```

### Existing RLS policies on deals / deal_access_grants

Queried via Replit Postgres (`$DATABASE_URL`) — returned 0 rows because Replit PG != Supabase PG.

From migration files, the live state (applied via Sprint 12 migration `20260301_sprint12_rls_grant_enforcement.sql`) is:

**deals:**
- `deals_select_owner_or_viewer` — SELECT — `EXISTS(active grant check)` — **NO legacy owner_user_id fallback**
- `deals_update_owner_only` — UPDATE — `EXISTS(active OWNER grant)`
- `deals_delete_owner_only` — DELETE — `EXISTS(active OWNER grant)`

**deal_access_grants:**
- `dag_select_own` — SELECT — `user_id = auth.uid() AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`
- `dag_deny_anon_insert` — INSERT — `WITH CHECK (false)`
- `dag_deny_anon_update` — UPDATE — `USING (false)`
- `dag_deny_anon_delete` — DELETE — `USING (false)`

### Existing deal grant functions

Query: `GET /rest/v1/rpc/has_active_deal_grant` → 404 (function does not exist)
Query: `GET /rest/v1/rpc/assert_deal_role` → exists with params `(p_actor_user_id, p_deal_id, p_required_role)`

### Existing share token RPCs (awareness only, NOT changing)

- `mint_deal_share_token_v2` / `redeem_deal_share_token_v2` exist (per replit.md)
- NOT modifying in this phase

---

## Task 1: deal_access_grants Foundations Migration

File: `supabase/migrations/20260304120000_option_b_deal_access_grants_foundations.sql`

Changes (additive):
1. Adds `id uuid` column to `deal_access_grants` if missing
2. Creates partial unique index `idx_dag_active_deal_user` on `(deal_id, user_id) WHERE revoked_at IS NULL`
3. Creates supporting indexes `idx_dag_active_user_deal` and `idx_dag_active_deal`
4. Recreates RLS policies (idempotent drop+create) with active-grant enforcement
5. Creates `has_active_deal_grant(p_deal_id uuid, p_user_id uuid)` STABLE SQL function (SECURITY DEFINER)
6. Grants EXECUTE to `authenticated`, revokes from `PUBLIC`

---

## Task 2: Deals SELECT Compat Policy

File: `supabase/migrations/20260304120010_option_b_deals_select_compat_grants.sql`

Replaces `deals_select_owner_or_viewer` with:
```sql
USING (
  public.has_active_deal_grant(id, auth.uid())
  OR owner_user_id = auth.uid()
)
```

This preserves:
- (a) Grant-based access (Sprint 12 behavior)
- (b) Legacy `owner_user_id` fallback (transitional compatibility)

---

## Task 3: Migration Application

### BLOCKING CONSTRAINT

**Migrations cannot be applied from this environment.**

Reasons:
1. `SUPABASE_DB_URL` is not set — no direct Postgres connection to Supabase
2. `SUPABASE_ACCESS_TOKEN` is not set — `supabase db push` cannot authenticate
3. `supabase/config.toml` does not exist — CLI is not linked to the project
4. `DATABASE_URL` points to Replit's built-in Postgres (separate from Supabase)

**Action required:** Apply the two migration files manually via:
- Supabase Dashboard → SQL Editor, OR
- `supabase db push` from a linked local environment, OR
- Setting `SUPABASE_DB_URL` as an environment secret in Replit

### Post-migration verification commands (to run after applying)

```sql
-- Confirm table structure
\d+ public.deal_access_grants

-- Confirm indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='public' AND tablename='deal_access_grants'
ORDER BY indexname;

-- Confirm policies
SELECT tablename, policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('deals','deal_access_grants')
ORDER BY tablename, policyname;

-- Confirm function exists
SELECT proname, proowner::regrole
FROM pg_proc
JOIN pg_namespace n ON n.oid = pg_proc.pronamespace
WHERE n.nspname='public' AND proname = 'has_active_deal_grant';
```

### Build verification

```
$ npm run build
✓ Compiled successfully in 8.0s
Running TypeScript ... (no errors)

Routes:
ƒ /deal/[dealId]         (Dynamic)
ƒ /deal/new              (Dynamic)
ƒ /dashboard             (Dynamic)
ƒ /threads/[threadId]    (Dynamic)
... all routes compiled successfully

Build result: SUCCESS
```

---

## Manual Scenario Test Plan

After migrations are applied, validate in browser/app:

### S1 — No break: Buyer can still view their deal
- Login as buyer who created a deal (has OWNER grant via `create_deal_with_owner_grant_v2`)
- Navigate to `/deal/[dealId]`
- Expected: Deal loads normally (grant-based access still works)

### S2 — No break: Verified owner can still view offer
- Login as property owner (has `deals.owner_user_id` set by submit-offer)
- Navigate to `/deal/[dealId]`
- Expected: Deal loads via `owner_user_id = auth.uid()` legacy fallback (even without explicit grant)

### S3 — No break: Random user cannot view deal
- Login as unrelated user
- Navigate to `/deal/[dealId]`
- Expected: Access denied / deal not found

### S4 — Prep for Phase 2: No automatic grant minting yet
- Confirm that submit-offer does NOT insert into deal_access_grants
- Confirm that owner-decision does NOT insert into deal_access_grants
- Expected: Grants are only minted by `create_deal_with_owner_grant_v2` RPC and share token redemption

---

## Out of Scope Findings

1. **Header PATCH endpoint auth** (`src/app/api/deals/[dealId]/header/route.ts`): Uses both `owner_user_id` field check and grants check — acceptable transitional compat, consistent with this phase's approach.
2. **Deal page buyer path** (`src/app/deal/[dealId]/page.tsx`): Uses `(deal as any).owner_user_id === user.id` as owner fallback — consistent with compat policy.
3. **No grant minting in submit-offer or owner-decision**: Correct for Phase 1 (foundations only). Phase 2 will add minting.
