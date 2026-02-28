# Architecture: Private Property-Anchored Deal Threads

Sprint 0 — Inventory + Drift Audit

---

## Domain Separation

### Property (Identity Anchor)
A property represents a real-world residential address owned by a homeowner. It is the identity anchor for all downstream deal activity. Properties go through a verification pipeline before they can be used in deals.

- **Lifecycle**: `unverified` → `under_review` → `verified` → `archived`
- **Ownership**: Single owner (`owner_user_id`), enforced by RLS
- **Uniqueness**: One verified property per owner (partial unique index)
- **Documents**: 3 mandatory verification uploads (selfie, drivers_license, utility_bill) stored in `property-verification` bucket

### Deal Thread (Negotiation Container)
Currently implemented as `deals` + `deal_access_grants`. The `deals` table is the negotiation container; `deal_access_grants` controls participant access with roles (OWNER, VIEWER, COUNTERPARTY).

- **Note**: Tables named `deal_threads` and `deal_thread_participants` do not exist yet. The current model uses `deals` + `deal_access_grants` as the equivalent.
- **No property FK**: Deals currently have no foreign key to `properties`. The `create_deal_with_owner_grant` RPC accepts `p_property_address` as text, not as a property ID reference.

### Proposal (Immutable Canonical Snapshot)
Currently implemented as `deal_snapshots` + `deal_versions`. Snapshots are immutable, append-only records. Versions reference snapshots to track negotiation states (OFFER, COUNTER, ACCEPT, REJECT).

- **Note**: A table named `deal_proposals` does not exist. The equivalent is `deal_versions` referencing `deal_snapshots`.

---

## Current Schema Inventory

### `properties`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | `gen_random_uuid()` |
| owner_user_id | uuid FK → auth.users | NOT NULL, CASCADE |
| address | text | NOT NULL (original migration; app code uses structured fields) |
| address_line1 | text | Added later (app-level structured address) |
| address_line2 | text | Nullable |
| city | text | Nullable |
| state | text | |
| postal_code | text | |
| status | text | CHECK: unverified, under_review, verified, archived |
| is_private | boolean | Replaces old `visibility` text column |
| verified_at | timestamptz | Nullable |
| verified_by | uuid FK → auth.users | Nullable |
| reviewed_at | timestamptz | Nullable |
| reviewed_by | uuid FK → auth.users | Nullable |
| review_notes | text | Nullable |
| created_at | timestamptz | DEFAULT now() |
| updated_at | timestamptz | Trigger-maintained |

**Indexes:**
- `idx_properties_owner` on (owner_user_id)
- `idx_properties_one_verified_per_owner` UNIQUE on (owner_user_id) WHERE status = 'verified'

**Constraints:**
- `chk_visibility_requires_verified`: visibility='public' requires status='verified' (may be stale if `visibility` column was replaced by `is_private`)

### `deals`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | `gen_random_uuid()` |
| owner_user_id | uuid FK → auth.users | NOT NULL, CASCADE |
| status | text | DEFAULT 'IMPORTED' |
| created_from | text | NOT NULL |
| source_ref | text | Nullable |
| mode | text | Referenced in app code, may be added outside migrations |
| property_address | text | Used by `create_deal_with_owner_grant` RPC |
| created_at | timestamptz | DEFAULT now() |

**Indexes:**
- `idx_deals_owner` on (owner_user_id, created_at DESC)
- `idx_deals_source_ref` on (source_ref) WHERE NOT NULL

### `deal_access_grants`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | `gen_random_uuid()` |
| deal_id | uuid FK → deals | NOT NULL, CASCADE |
| user_id | uuid FK → auth.users | NOT NULL, CASCADE |
| role | text | DEFAULT 'VIEWER' (OWNER, VIEWER, COUNTERPARTY) |
| created_by | uuid FK → auth.users | Nullable |
| created_at | timestamptz | DEFAULT now() |

**Indexes:**
- `idx_deal_access_grants_deal_user` UNIQUE on (deal_id, user_id)
- `idx_deal_access_grants_user` on (user_id)

### `deal_snapshots`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | `gen_random_uuid()` |
| deal_id | uuid FK → deals | NOT NULL, CASCADE |
| created_by | uuid FK → auth.users | NOT NULL |
| created_at | timestamptz | DEFAULT now() |
| contract_version | text | NOT NULL (stores compute_version) |
| schema_version | text | NOT NULL |
| input_hash | text | Nullable, indexed |
| output_hash | text | Nullable, indexed |
| snapshot_json | jsonb | NOT NULL, full FullDealSnapshotV1 |

**Immutability:** DB triggers (`trg_deal_snapshots_no_update`, `trg_deal_snapshots_no_delete`) call `no_update_delete()` — raises exception on any UPDATE or DELETE.

### `deal_versions`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | `gen_random_uuid()` |
| deal_id | uuid FK → deals | NOT NULL, CASCADE |
| created_by | uuid FK → auth.users | NOT NULL |
| created_at | timestamptz | DEFAULT now() |
| version_number | int | NOT NULL |
| version_type | text | NOT NULL (OFFER, COUNTER, ACCEPT, REJECT) |
| base_snapshot_id | uuid FK → deal_snapshots | Nullable |
| proposed_snapshot_id | uuid FK → deal_snapshots | Nullable |
| note | text | Nullable |
| meta | jsonb | DEFAULT '{}' |

**Immutability:** DB triggers block UPDATE/DELETE.

### `deal_share_tokens`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | `gen_random_uuid()` |
| token | text | UNIQUE, NOT NULL |
| deal_id | uuid FK → deals | NOT NULL, CASCADE |
| to_email | text | Nullable |
| created_by | uuid FK → auth.users | NOT NULL |
| expires_at | timestamptz | DEFAULT now() + 30 days |
| revoked_at | timestamptz | Nullable |
| created_at | timestamptz | DEFAULT now() |

### `draft_tokens`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | `gen_random_uuid()` |
| token | text | UNIQUE, NOT NULL |
| snapshot_json | jsonb | NOT NULL |
| contract_version | text | Nullable |
| schema_version | text | Nullable |
| expires_at | timestamptz | NOT NULL |
| redeemed_at | timestamptz | Nullable |
| redeemed_by_user_id | uuid FK → auth.users | Nullable |
| source | text | DEFAULT 'marketing' |
| created_at | timestamptz | DEFAULT now() |

### `property_documents`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | `gen_random_uuid()` |
| property_id | uuid FK → properties | NOT NULL, CASCADE |
| doc_type | text | CHECK: selfie, drivers_license, utility_bill |
| storage_path | text | NOT NULL |
| content_type | text | Nullable |
| byte_size | bigint | Nullable (meta) |
| sha256 | text | Nullable (meta) |
| width | integer | Nullable (meta) |
| height | integer | Nullable (meta) |
| original_content_type | text | Nullable (meta) |
| phash | text | Nullable (meta) |
| created_at | timestamptz | DEFAULT now() |

**Indexes:**
- `idx_property_documents_unique_type` UNIQUE on (property_id, doc_type)

### `property_status_audit`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | `gen_random_uuid()` |
| property_id | uuid FK → properties | NOT NULL, CASCADE |
| from_status | text | NOT NULL |
| to_status | text | NOT NULL |
| changed_by | uuid FK → auth.users | NOT NULL |
| changed_at | timestamptz | DEFAULT now() |
| notes | text | Nullable |
| actor_type | text | DEFAULT 'human' |

### `deal_events`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | `gen_random_uuid()` |
| deal_id | uuid FK → deals | NOT NULL, CASCADE |
| event_type | text | NOT NULL |
| payload | jsonb | DEFAULT '{}' |
| created_by | uuid FK → auth.users | Nullable |
| created_at | timestamptz | DEFAULT now() |

**Immutability:** DB triggers block UPDATE/DELETE.

### `calculator_snapshots` (Legacy)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| deal_id | uuid FK → deals | |
| version | integer | |
| source | text | |
| inputs_json | jsonb | |
| results_json | jsonb | |
| calculator_schema_version | text | |
| engine_version | text | |
| inputs_hash | text | |
| result_hash | text | |
| parent_snapshot_id | uuid FK → self | |
| created_by | uuid FK → auth.users | |
| created_at | timestamptz | |

**Note:** Legacy table from Sprint 5. Application code exclusively uses `deal_snapshots`. Hard immutability triggers are in place.

### `profiles`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | FK → auth.users, CASCADE |
| first_name | text | NOT NULL |
| last_name | text | NOT NULL |
| nickname | text | NOT NULL |
| phone | text | Nullable |
| marketing_opt_in | boolean | DEFAULT true |
| sms_consent | boolean | DEFAULT false |
| sms_consent_at | timestamptz | Nullable |
| eula_version | text | Nullable |
| eula_accepted_at | timestamptz | Nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | Trigger-maintained |

### Tables NOT Present
The following tables referenced in the prompt do **not exist** in the current migration set:
- `deal_threads` — use `deals` + `deal_access_grants`
- `deal_thread_participants` — use `deal_access_grants`
- `deal_proposals` — use `deal_versions` + `deal_snapshots`
- `thread_invites` — use `deal_share_tokens`

---

## SQL Function Inventory

### Functions Defined in Migrations

| Function | Migration File | Purpose |
|----------|---------------|---------|
| `no_update_delete()` | `20260210_app_int_001_deals_snapshots_events.sql` | Immutability guard — raises exception on UPDATE/DELETE. Used by triggers on `deal_snapshots`, `deal_versions`, `deal_events`, `calculator_snapshots`. |
| `set_updated_at()` | `20260225_app_profiles_properties.sql` (also `20260131_*`) | Sets `updated_at = now()` on UPDATE. Used by triggers on `profiles`, `properties`. |
| `create_deal_with_owner_grant(p_property_address TEXT, p_user_id UUID)` | `20260210_create_deal_with_owner_grant.sql` | SECURITY DEFINER. Creates a deal + OWNER grant atomically. **See drift #10 — signature likely differs in live env.** |

### Functions Called by App Code but NOT in Migrations

| Function | Called From | Purpose |
|----------|-------------|---------|
| `mint_deal_share_token(p_deal_id, p_actor_user_id)` | `src/app/api/deals/[dealId]/share/route.ts` | Generates a share token for a deal. Only OWNER should call. |
| `redeem_deal_share_token(...)` | `src/app/share/page.tsx` | Redeems a share token, creating a VIEWER grant. |

---

## Snapshot Reuse Audit

### Does `deal_snapshots.snapshot_json` match canonical compute schema?
**Yes.** The `snapshot_json` column stores the full `FullDealSnapshotV1` structure:
```
{
  compute_version: string,
  schema_version: string,
  inputs: { deal_terms: {...}, scenario: {...} },
  outputs: { results: {...} },
  computed_at: string,
  computed_by: string,
  input_hash?: string,
  output_hash?: string
}
```

Validation is enforced at insert time by `validateFullDealSnapshotV1()` in `src/lib/dealSnapshot.ts`.

### Compute version fields stored
- `contract_version` column (text, NOT NULL) stores the `compute_version` value
- `snapshot_json.compute_version` inside the JSONB payload
- Both are set during `insertDealSnapshot()` — the column maps from `compute_version` for backward compatibility

### Are snapshots recomputed on accept?
**No.** When a version_type='ACCEPT' is created in `deal_versions`, it references `proposed_snapshot_id` — the existing immutable snapshot. No new compute occurs.

---

## Token Reuse Audit

### Draft Tokens
- **Algorithm**: `crypto.randomBytes(32).toString("hex")` — 256-bit random, no hashing
- **Single-use**: Enforced by checking `redeemed_at IS NOT NULL` before redemption; set atomically on redeem
- **Expiry**: `expires_at = now() + 7 days`; checked server-side before redemption
- **Storage**: Plaintext token in `draft_tokens.token` (UNIQUE index)

### Share Tokens
- **Algorithm**: Generated by `mint_deal_share_token` RPC (SQL function not in migration files — may be defined directly in Supabase dashboard)
- **Single-use**: Enforced via `max_redemptions` / `redemption_count` (checked in share page)
- **Expiry**: `expires_at = now() + 30 days`; checked server-side
- **Revocation**: `revoked_at` column allows manual invalidation
- **Storage**: Plaintext token in `deal_share_tokens.token` (UNIQUE index)

### Admin Document Preview Tokens
- **Algorithm**: HMAC-SHA256 signed tokens with expiry (`<exp>.<sigB64url>`)
- **Expiry**: Embedded in token, verified server-side
- **Single-use**: Not single-use (valid until expiry)

---

## RLS Policy Inventory

### `properties`
| Policy | Command | Rule |
|--------|---------|------|
| properties_select_own | SELECT | owner_user_id = auth.uid() |
| properties_insert_own | INSERT | owner_user_id = auth.uid() AND status='unverified' AND visibility='private' |
| properties_update_own | UPDATE | owner_user_id = auth.uid() AND status IN ('unverified','archived') |
| properties_deny_delete | DELETE | USING (false) — all deletes denied |

**Gap**: INSERT policy references `visibility='private'` which may conflict if column was replaced by `is_private` boolean. Admin operations bypass RLS via service-role client.

### `deals`
| Policy | Command | Rule |
|--------|---------|------|
| deals_select_owner_or_viewer | SELECT | EXISTS grant for user |
| deals_update_owner_only | UPDATE | EXISTS grant with role='OWNER' |
| deals_delete_owner_only | DELETE | EXISTS grant with role='OWNER' |

**Visibility**: Strictly participant-based via `deal_access_grants`.

### `deal_snapshots`
| Policy | Command | Rule |
|--------|---------|------|
| deal_snapshots_select_via_grant | SELECT | EXISTS grant for user |
| deal_snapshots_insert_owner_only | INSERT | EXISTS grant with role='OWNER' |
| (none) | UPDATE/DELETE | Denied by RLS + DB triggers |

### `deal_versions`
| Policy | Command | Rule |
|--------|---------|------|
| deal_versions_select_via_grant | SELECT | EXISTS grant for user |
| deal_versions_insert_owner_or_counterparty | INSERT | OWNER (any type) OR COUNTERPARTY (COUNTER only) |
| (none) | UPDATE/DELETE | Denied by RLS + DB triggers |

### `deal_access_grants`
| Policy | Command | Rule |
|--------|---------|------|
| dag_select_own | SELECT | user_id = auth.uid() |
| dag_deny_anon_insert | INSERT | WITH CHECK (false) |
| dag_deny_anon_update | UPDATE | USING (false) |
| dag_deny_anon_delete | DELETE | USING (false) |

**Note**: All mutations go through service-role client or RPC functions.

### `deal_share_tokens`
All operations denied via RLS for authenticated users. Service-role only.

### `draft_tokens`
All operations denied via RLS for authenticated users. Service-role only.

### `property_documents`
| Policy | Command | Rule |
|--------|---------|------|
| docs_select_own | SELECT | property owned by auth.uid() |
| docs_insert_own_unverified | INSERT | property owned by auth.uid() AND status='unverified' |
| docs_update_own_unverified | UPDATE | property owned by auth.uid() AND status='unverified' |
| docs_deny_delete | DELETE | USING (false) |

### `property_status_audit`
| Policy | Command | Rule |
|--------|---------|------|
| audit_select_own_properties | SELECT | property owned by auth.uid() |
| audit_deny_insert | INSERT | WITH CHECK (false) |
| audit_deny_update | UPDATE | USING (false) |
| audit_deny_delete | DELETE | USING (false) |

**Note**: Audit inserts go through service-role client only.

### `deal_events`
No RLS policies defined for authenticated users. Service-role only.

### Thread Visibility
**Strictly participant-based.** All deal-related SELECT policies require the user to have a row in `deal_access_grants`. There is no public or role-based override.

---

## Drift Risks Identified

### 1. Duplicate Address Columns
The `properties` migration defines a single `address` text column. App code uses structured fields (`address_line1`, `address_line2`, `city`, `state`, `postal_code`). The `is_private` boolean replaced the `visibility` text column. These structural changes were applied via ALTER TABLE but the original migration still creates the old columns. The old `address` and `visibility` columns may still exist in the live schema alongside the new ones.

### 2. Mutable Address on Properties
No immutability trigger exists on property address fields. Owners can update address columns freely when status is `unverified` or `archived`. This is by design for the current flow but becomes a drift risk if deals ever reference properties by ID — changing the address after deal creation would silently alter the deal's identity anchor.

### 3. No Property→Deal FK
Deals do not reference `properties.id`. The `create_deal_with_owner_grant` RPC accepts `p_property_address` as freeform text, not a property FK. There is no structural guarantee that a deal maps to a verified property.

### 4. Snapshot Schema Not Validated on Read
`validateFullDealSnapshotV1()` is called only on INSERT. Reads from `deal_snapshots` return raw JSONB without re-validation. If the schema evolves, old snapshots may not conform to the current expected shape — though this is acceptable since snapshots are immutable and versioned.

### 5. Share Token RPC Not in Migrations
The `mint_deal_share_token` function is called in app code but its SQL definition is not present in the `supabase/migrations/` directory. It may have been created directly in the Supabase dashboard, creating a drift risk between migration-managed schema and live schema.

### 6. RLS INSERT Policy References `visibility='private'`
The `properties_insert_own` RLS policy checks `visibility = 'private'`. If the column was replaced by `is_private` boolean, this policy may silently block or allow unexpected inserts. App code bypasses this via service-role client, masking the issue.

### 7. `deals.mode` Column Not in Migrations
App code references `deal.mode` but no migration adds this column. It may exist only in the live schema.

### 8. Acceptance Not Gated by Property Verification
The `ACCEPT` version_type can be created by any OWNER regardless of whether the associated property (if any) has been verified. There is no DB-level or app-level check linking deal acceptance to property verification status.

### 9. Legacy `calculator_snapshots` Table
The old `calculator_snapshots` table still exists alongside the current `deal_snapshots`. No app code references it, but it represents dead schema weight.

### 10. `create_deal_with_owner_grant` RPC Signature Mismatch
The migration-defined function signature is `(p_property_address TEXT, p_user_id UUID)` and validates `p_property_address` with a minimum length check. The app code (`/api/deals/create/route.ts`) calls it with only `{ p_user_id: user.id }`, omitting `p_property_address` entirely. The RPC also references `deals.property_address` and `deals.created_by` columns, which do not exist in the `deals` table migration (`owner_user_id`, `status`, `created_from`, `source_ref`). The live Supabase environment likely has a modified version of both the RPC and the `deals` table that differs from the migration files.

### 11. `deals` Table Column Divergence
The `deals` migration defines columns: `id`, `owner_user_id`, `status`, `created_from`, `source_ref`, `created_at`. The `create_deal_with_owner_grant` RPC migration references `property_address` and `created_by` columns. App code also queries `deal.mode`. These columns (`property_address`, `created_by`, `mode`) are absent from the migration-defined schema, indicating the live `deals` table has been altered outside of migration files.

### 12. `redeem_deal_share_token` RPC Not in Migrations
In addition to `mint_deal_share_token` (drift #5), the `redeem_deal_share_token` RPC — called in the share page redemption flow — is also missing from the migration files. Both RPCs exist only in the live Supabase environment.

### 13. `deal_share_tokens` Extra Columns — RESOLVED (Sprint 11.5)
`max_redemptions` and `redemption_count` are now added to the `deal_share_tokens` table via `20260228_contract_alignment_rpc_v2.sql`. The `redeem_deal_share_token_v2` function enforces `max_redemptions` and increments `redemption_count` atomically.

---

## Invariants (Sprint 0 Freeze)

### Property Identity
1. A property is uniquely owned by one user (`owner_user_id`).
2. At most one property per owner may be in `verified` status (enforced by partial unique index).
3. Property identity (address fields) MUST NOT be modified after status transitions beyond `unverified`.
4. Property documents are bound to a single property and doc_type (unique index on `property_id, doc_type`).

### Snapshot Immutability
1. `deal_snapshots` rows are append-only. DB triggers raise exceptions on UPDATE or DELETE.
2. `snapshot_json` is stored verbatim — no recomputation, no normalization after insert.
3. `deal_versions` rows are append-only. DB triggers raise exceptions on UPDATE or DELETE.
4. Accepting a deal version references the existing `proposed_snapshot_id` — no new snapshot is computed during acceptance.
5. `compute_version` (stored as `contract_version` column) is captured at compute time and never modified.

### Invite Token Usage
1. Draft tokens are single-use: `redeemed_at` is set atomically on redemption; subsequent attempts return the existing deal.
2. Draft tokens expire after 7 days (`expires_at`); checked server-side before redemption.
3. Share tokens expire after 30 days; checked server-side.
4. Share tokens support max redemptions and revocation (`revoked_at`).
5. All tokens are generated with `crypto.randomBytes(32)` (256-bit entropy).

### Verification Gating
1. Property verification lifecycle: `unverified` → `under_review` → `verified` → `archived`.
2. Only admin (service-role) can transition properties to `under_review`, `verified`, or back.
3. Owners can only modify properties in `unverified` or `archived` status (RLS-enforced).
4. Document uploads are only permitted for `unverified` properties (RLS-enforced).
5. All documents are server-side validated: 12MB limit, magic-byte sniffing, HEIC rejection, image transcode to JPEG, fraud signal capture (sha256, byte_size, width, height).
6. **GAP**: Deal acceptance is NOT gated by property verification status. This is an identified drift risk for future sprints.

---

## Contract Alignment (Sprint 11.5)

Sprint 11.5 reconciled migration-vs-app drift by adding authoritative v2 RPCs and the missing `deals.mode` column.

### v2 RPC Functions Added

All defined in `supabase/migrations/20260228_contract_alignment_rpc_v2.sql`.

| Function | Replaces (deprecated) | Signature | Returns |
|----------|----------------------|-----------|---------|
| `create_deal_with_owner_grant_v2` | `create_deal_with_owner_grant` | `(p_user_id UUID)` | `UUID` (deal id) |
| `mint_deal_share_token_v2` | `mint_deal_share_token` | `(p_deal_id UUID, p_actor_user_id UUID)` | `TEXT` (token) |
| `redeem_deal_share_token_v2` | `redeem_deal_share_token` | `(p_token TEXT)` | `UUID` (deal id) |
| `is_admin` | (new — was live-only) | `()` | `BOOLEAN` |

Key behaviors:
- `create_deal_with_owner_grant_v2`: No `p_property_address` param (matches app). Inserts with `owner_user_id`, `status='IMPORTED'`, `created_from='app'`, `mode='app'`.
- `mint_deal_share_token_v2`: Validates `p_actor_user_id = auth.uid()` (anti-spoofing). Validates OWNER grant. Generates 32-byte hex token. 30-day expiry.
- `redeem_deal_share_token_v2`: Validates expiry + revocation + max_redemptions. Increments `redemption_count`. Upserts VIEWER grant (idempotent). Owner self-redeem returns deal_id without duplicate grant.
- `is_admin`: Checks `auth.users.raw_user_meta_data->>'role' = 'admin'`.

Legacy functions are NOT removed — they may still exist in the live DB but are deprecated.

### `deals.mode` Column

Defined in `supabase/migrations/20260228_deals_mode_column.sql`.

- `mode TEXT NOT NULL DEFAULT 'app'`
- Known values: `app`, `marketing`, `fork`
- Backfills existing rows to `'app'`
- No CHECK constraint added (values may expand; document as follow-up if constraint is desired)

### App Code Callsite Updates

| File | Old RPC | New RPC |
|------|---------|---------|
| `src/app/api/deals/create/route.ts` | `create_deal_with_owner_grant` | `create_deal_with_owner_grant_v2` |
| `src/app/api/deals/[dealId]/share/route.ts` | `mint_deal_share_token` | `mint_deal_share_token_v2` |
| `src/app/share/page.tsx` | `redeem_deal_share_token` | `redeem_deal_share_token_v2` |
| `src/lib/auth/requireAdmin.ts` | `is_admin` | `is_admin` (unchanged — now migration-managed) |

### Remaining Suspected Drift (Requires Live DB Verification)

1. **`properties` column overlap**: Old `address`/`visibility` columns may coexist with new `address_line1`/`is_private`. Need live `\d properties` to confirm.
2. **`properties_insert_own` RLS**: Still references `visibility = 'private'`; may need update to `is_private = true` if `visibility` column was dropped.
3. **`deal_share_tokens` extra columns**: `max_redemptions` and `redemption_count` are queried in app code but not in migration. May need an additive migration.
4. **`deals` column overlap**: Migration defines `owner_user_id`, `created_from`, `source_ref`. Live DB may also have `property_address`, `created_by` from the legacy RPC. The v2 RPC no longer references those columns.
5. **`buyer_accept_proposal` RPC**: Referenced in `_app_unused/` code. Not in migrations. Confirmed unused — no action needed unless reactivated.
6. **`chk_visibility_requires_verified` constraint**: References `visibility` column which may be stale.
