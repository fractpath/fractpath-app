# Option B Phase 2a — Buyer/Creator Grant Minting Discovery Log

Date: 2026-03-04

## DB Connection Verification

```
$ PGPASSWORD="$SUPABASE_DB_PASSWORD" psql -h "$SUPABASE_DB_HOST" -p "$SUPABASE_DB_PORT" -U "$SUPABASE_DB_USER" -d "$SUPABASE_DB_NAME" -c "\conninfo"

You are connected to database "postgres" as user "postgres.onacakmynvzcvbqenjaf" on host "aws-1-us-east-1.pooler.supabase.com" (address "18.214.78.123") at port "5432".
SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, compression: off)
```

Confirmed: connected to Supabase Postgres.

---

## Task D1 — Identify deal creation code paths

### Search commands + results

```
$ rg -n 'from\("deals"\)\.insert|insert\(\{.*owner_user_id|insert into deals|deals_insert' src
(no matches — deal inserts use either RPC or service client patterns)
```

```
$ rg -n 'create_deal_with_owner_grant' src
src/app/api/deals/create/route.ts:67:      "create_deal_with_owner_grant_v2",
```

### Deal creation paths identified (3 creation + 1 non-creation)

#### Path 1: `/api/deals/create` (route.ts)
- File: `src/app/api/deals/create/route.ts`
- Mechanism: `supabase.rpc("create_deal_with_owner_grant_v2", { p_user_id: user.id })` (line 66-71)
- User: `user.id` from `supabase.auth.getUser()` (line 17-19)
- Grant behavior: RPC atomically inserts deal + OWNER grant (see RPC definition below)
- Additionally: trigger `trg_ensure_owner_grant` fires AFTER INSERT as a safety net

#### Path 2: `/api/deals/resume` (route.ts)
- File: `src/app/api/deals/resume/route.ts`
- Mechanism: `service.from("deals").insert({owner_user_id: user.id, ...})` (line 277-288)
- User: `user.id` from `supabase.auth.getUser()` (line 133-135)
- Grant behavior: Explicit upsert at lines 295-305:
  ```ts
  service.from("deal_access_grants").upsert({
    deal_id: newDeal.id,
    user_id: user.id,
    role: isRealtor ? "VIEWER" : "OWNER",
    created_by: user.id,
  }, { onConflict: "deal_id,user_id", ignoreDuplicates: true })
  ```
- Additionally: trigger fires on the INSERT

#### Path 3: `/api/deals/[dealId]/fork` (route.ts)
- File: `src/app/api/deals/[dealId]/fork/route.ts`
- Mechanism: `service.from("deals").insert({owner_user_id: user.id, ...})` (line 89-100)
- User: `user.id` from `supabase.auth.getUser()` (line 40-42)
- Grant behavior: Explicit upsert at lines 109-122:
  ```ts
  service.from("deal_access_grants").upsert({
    deal_id: newDeal.id,
    user_id: user.id,
    role: "OWNER",
    created_by: user.id,
  }, { onConflict: "deal_id,user_id", ignoreDuplicates: true })
  ```
- Additionally: trigger fires on the INSERT

#### Path 4 (non-creation): `/api/deals/[dealId]/submit-offer` (route.ts)
- File: `src/app/api/deals/[dealId]/submit-offer/route.ts`
- Mechanism: Does NOT create a deal. Creates a thread/proposal on an EXISTING deal.
- User: `user.id` from `supabase.auth.getUser()` (line 25-27)
- Grant behavior: The submitter MUST already be OWNER of the deal (enforced at lines 65-70):
  ```ts
  const isOwner =
    (deal as any).owner_user_id === user.id || grant?.role === "OWNER";
  if (!isOwner) {
    return json(403, { error: "Only the deal owner can submit an offer" });
  }
  ```
- No new grant minting needed — submitter already has OWNER access.
- NOTE: After submission, this route reassigns `deals.owner_user_id` to `properties.owner_user_id` (the property owner), but the buyer's OWNER grant row in `deal_access_grants` is NOT revoked, so buyer retains grant-based access.

---

## Task D1 — DB Evidence: Existing trigger + RPC + constraints

### Trigger: `trg_ensure_owner_grant`

```
$ PGPASSWORD="$SUPABASE_DB_PASSWORD" psql ... -c "SELECT tgname, tgrelid::regclass, tgfoid::regprocedure FROM pg_trigger WHERE tgname ILIKE '%grant%' OR tgname ILIKE '%owner%';"

              tgname               |      tgrelid       |               tgfoid
-----------------------------------+--------------------+-------------------------------------
 trg_ensure_owner_grant            | deals              | ensure_owner_grant_on_deal_insert()
 trg_prevent_last_owner_revocation | deal_access_grants | prevent_last_owner_revocation()
(2 rows)
```

### Trigger function definition:

```sql
CREATE OR REPLACE FUNCTION public.ensure_owner_grant_on_deal_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- if no active owner grant exists for creator, create one
  if not exists (
    select 1
    from public.deal_access_grants g
    where g.deal_id = new.id
      and g.user_id = new.owner_user_id
      and g.revoked_at is null
  ) then
    insert into public.deal_access_grants (
      deal_id, user_id, role, created_by, created_at
    )
    values (
      new.id, new.owner_user_id, 'OWNER', new.owner_user_id, now()
    );
  end if;
  return new;
end;
$function$
```

### RPC: `create_deal_with_owner_grant_v2`

```sql
CREATE OR REPLACE FUNCTION public.create_deal_with_owner_grant_v2(p_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_deal_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_user_id is null or p_user_id <> auth.uid() then
    raise exception 'actor_mismatch';
  end if;
  insert into public.deals (owner_user_id, status, created_from, source_ref)
  values (auth.uid(), 'DRAFT', 'app', 'create')
  returning id into v_deal_id;
  insert into public.deal_access_grants (deal_id, user_id, role)
  values (v_deal_id, auth.uid(), 'OWNER')
  on conflict (deal_id, user_id) do nothing;
  return v_deal_id;
end;
$function$
```

### Constraints on `deal_access_grants`:

```
$ PGPASSWORD="$SUPABASE_DB_PASSWORD" psql ... -c "SELECT conname, conrelid::regclass, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.deal_access_grants'::regclass;"

                conname                 |      conrelid      |                    pg_get_constraintdef
----------------------------------------+--------------------+-------------------------------------------------------------
 deal_access_grants_deal_user_role_uniq | deal_access_grants | UNIQUE (deal_id, user_id, role)
 deal_access_grants_pkey                | deal_access_grants | PRIMARY KEY (deal_id, user_id)
 deal_access_grants_role_check          | deal_access_grants | CHECK ((role = ANY (ARRAY['OWNER'::text, 'VIEWER'::text])))
(3 rows)
```

### Full schema of `deal_access_grants`:

```
$ PGPASSWORD="$SUPABASE_DB_PASSWORD" psql ... -c "\d+ public.deal_access_grants"

                                              Table "public.deal_access_grants"
   Column   |           Type           | Collation | Nullable | Default | Storage  | Compression | Stats target | Description
------------+--------------------------+-----------+----------+---------+----------+-------------+--------------+-------------
 deal_id    | uuid                     |           | not null |         | plain    |             |              |
 user_id    | uuid                     |           | not null |         | plain    |             |              |
 role       | text                     |           | not null |         | extended |             |              |
 created_at | timestamp with time zone |           | not null | now()   | plain    |             |              |
 created_by | uuid                     |           |          |         | plain    |             |              |
 revoked_at | timestamp with time zone |           |          |         | plain    |             |              |
 expires_at | timestamp with time zone |           |          |         | plain    |             |              |
Indexes:
    "deal_access_grants_pkey" PRIMARY KEY, btree (deal_id, user_id)
    "deal_access_grants_deal_user_role_uniq" UNIQUE CONSTRAINT, btree (deal_id, user_id, role)
    "deal_access_grants_unique_active" UNIQUE, btree (deal_id, user_id) WHERE revoked_at IS NULL
    "deal_access_grants_user_id_idx" btree (user_id)
    "idx_deal_access_grants_deal_user" UNIQUE, btree (deal_id, user_id)
    "idx_deal_access_grants_user" btree (user_id)
Check constraints:
    "deal_access_grants_role_check" CHECK (role = ANY (ARRAY['OWNER'::text, 'VIEWER'::text]))
Policies:
    POLICY "dag_allow_self_viewer_insert" FOR INSERT
      TO authenticated
      WITH CHECK (((user_id = auth.uid()) AND (role = 'VIEWER'::text) AND (created_by = auth.uid())))
    POLICY "dag_deny_anon_delete" FOR DELETE
      USING (false)
    POLICY "dag_deny_anon_insert" FOR INSERT
      WITH CHECK (false)
    POLICY "dag_deny_anon_update" FOR UPDATE
      USING (false)
    POLICY "dag_select_own" FOR SELECT
      TO authenticated
      USING (((user_id = auth.uid()) AND (revoked_at IS NULL) AND ((expires_at IS NULL) OR (expires_at > now()))))
Triggers:
    trg_prevent_last_owner_revocation BEFORE UPDATE ON deal_access_grants FOR EACH ROW EXECUTE FUNCTION prevent_last_owner_revocation()
```

### RLS policies on `dag_allow_self_viewer_insert`:

Note: This policy already exists and allows authenticated users to self-insert VIEWER grants:
```sql
WITH CHECK (((user_id = auth.uid()) AND (role = 'VIEWER'::text) AND (created_by = auth.uid())))
```

This was presumably added to enable self-VIEWER grant minting from the client side.

---

## Task D2 — Buyer/creator user ID availability at each path

| Path | User source | Line(s) | User role in deal |
|------|-------------|---------|-------------------|
| `/api/deals/create` | `supabase.auth.getUser()` → `user.id` | L17-19, passed as `p_user_id` at L69 | **OWNER** (deal creator) |
| `/api/deals/resume` | `supabase.auth.getUser()` → `user.id` | L133-135 | **OWNER** (or VIEWER if realtor) |
| `/api/deals/[dealId]/fork` | `supabase.auth.getUser()` → `user.id` | L40-42 | **OWNER** (forker becomes new deal owner) |
| `/api/deals/[dealId]/submit-offer` | `supabase.auth.getUser()` → `user.id` | L25-27 | Already **OWNER** (enforced L65-70) |

### Key finding: The "buyer" IS the deal creator/owner in all paths

In FractPath's current architecture:
- A **buyer** creates a deal via `/api/deals/create` → they become `deals.owner_user_id` → they get OWNER grant
- A buyer who resumes a marketing draft via `/api/deals/resume` → same pattern
- A buyer who forks → same pattern
- When a buyer submits an offer (`submit-offer`), they're operating on THEIR OWN deal — they already have OWNER

There is no code path where a "buyer" needs a VIEWER grant on someone else's deal at creation time. The buyer is always the deal owner.

---

## Task D3 — Proposed minting patch plan

### FINDING: No patch is needed for NEW deal creation

All four deal creation paths already ensure the creator gets an OWNER grant through one or more of:

1. **RPC `create_deal_with_owner_grant_v2`** — atomically creates OWNER grant (path 1)
2. **Explicit `.upsert()` with role OWNER** — after insert (paths 2, 3)
3. **Trigger `trg_ensure_owner_grant`** — fires AFTER INSERT on deals, creates OWNER if missing (safety net for all paths)
4. **RLS policy `dag_allow_self_viewer_insert`** — already exists to allow client-side self-VIEWER minting if needed in future

### Where a VIEWER grant MIGHT be needed (future scope, NOT this phase)

The scenario where a VIEWER grant would be needed is when a **property owner** receives an offer. Currently:
- `submit-offer` sets `deals.owner_user_id` to `properties.owner_user_id` (the property owner)
- This gives the property owner access via the legacy `owner_user_id` path in the deals SELECT policy
- But no `deal_access_grants` VIEWER row is minted for the property owner

This is a **Phase 2b** concern (property-owner-as-counterparty grant minting), not Phase 2a (buyer/creator grant minting).

### If a VIEWER mint were needed, the pattern would be:

```ts
await (svc.from("deal_access_grants") as any).upsert(
  {
    deal_id: dealId,
    user_id: targetUserId,
    role: "VIEWER",
    created_by: actingUserId,
  },
  { onConflict: "deal_id,user_id", ignoreDuplicates: true }
);
```

This is idempotent due to `PK (deal_id, user_id)` and `ignoreDuplicates: true`.

---

## Task D4 — Verification plan (post-patch — if patch were needed)

Since no patch is needed for buyer/creator grant minting, these scenarios serve as **regression verification** that existing behavior is correct.

### S1 — Buyer creates deal via `/api/deals/create` → has OWNER grant

```sql
-- After creating a deal, verify grant exists:
SELECT deal_id, user_id, role, created_at, revoked_at, expires_at
FROM public.deal_access_grants
WHERE deal_id = '<new_deal_id>'
  AND user_id = '<buyer_user_id>';

-- Expected: 1 row, role='OWNER', revoked_at IS NULL
```

### S2 — Buyer resumes marketing draft → has OWNER grant (or VIEWER if realtor)

```sql
SELECT deal_id, user_id, role, created_at, revoked_at, expires_at
FROM public.deal_access_grants
WHERE deal_id = '<resumed_deal_id>'
  AND user_id = '<buyer_user_id>';

-- Expected: 1 row, role='OWNER' (or 'VIEWER' for realtor persona), revoked_at IS NULL
```

### S3 — Random user cannot read deal

```sql
-- As random user (different auth.uid()), SELECT from deals should return 0 rows via RLS:
-- (Cannot be verified via psql service role — must verify in app)
```

### S4 — Owner still has access via owner_user_id AND grant

```sql
SELECT d.id, d.owner_user_id, g.role, g.revoked_at
FROM public.deals d
LEFT JOIN public.deal_access_grants g
  ON g.deal_id = d.id AND g.user_id = d.owner_user_id AND g.revoked_at IS NULL
WHERE d.id = '<deal_id>';

-- Expected: 1 row, owner_user_id matches, g.role='OWNER', g.revoked_at IS NULL
```

---

## CONCLUSION + STOP REQUEST

### Finding: No application code changes are needed for Phase 2a

All deal creation paths already mint OWNER grants for the buyer/creator. The "buyer" in FractPath IS the deal owner — they create the deal and own it. There is no code path where a buyer creates or interacts with a deal without getting a grant.

Evidence:
1. `/api/deals/create` → RPC mints OWNER + trigger safety net
2. `/api/deals/resume` → explicit upsert OWNER (or VIEWER for realtor) + trigger
3. `/api/deals/[dealId]/fork` → explicit upsert OWNER + trigger
4. `/api/deals/[dealId]/submit-offer` → does NOT create a deal; submitter already has OWNER (enforced at route level)
5. Trigger `trg_ensure_owner_grant` → fires on ANY deal INSERT as a safety net

### No additional allowlist files needed

No application code edits are required. The existing implementation already satisfies the Phase 2a objective.

### Potential Phase 2b scope (future)

The only gap is for **property owners who receive offers** — they get `deals.owner_user_id` set but no `deal_access_grants` row. This is handled by the legacy `owner_user_id` fallback in the deals SELECT policy. Minting a VIEWER or COUNTERPARTY grant for the property owner would be Phase 2b.

---

## Code Review Notes (Architect)

Verdict: **Pass with gaps** — core conclusion correct. No Phase 2a code patch required.

Gaps noted:
1. Trigger `trg_ensure_owner_grant` and function `ensure_owner_grant_on_deal_insert` exist in Supabase DB but are NOT in repository migrations. This is an environment-drift risk — behavior is correct in production but not reproducible from codebase alone. Recommend adding migration in a future sprint.
2. In `resume`, realtor gets VIEWER via explicit upsert, but `owner_user_id = user.id` means the trigger would also mint OWNER. Role-model inconsistency (outside Phase 2a scope).
3. `submit-offer` reassigns `deals.owner_user_id` but buyer's OWNER grant is retained — documented above.

## Files changed

- `docs/option-b/phase2a-buyer-grant-minting-log.md` — CREATED (this file)

No other files modified. No BEFORE/AFTER blocks needed (no edits to existing files).
