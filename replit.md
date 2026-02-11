# FractPath

## Overview
FractPath is a minimal homeowner intake application built with Next.js. It collects exploratory scenario information and sends a deterministic, non-binding scenario summary to HubSpot for internal sales follow-up. The portal includes Supabase authentication with role-based onboarding (Homeowner, Buyer, Realtor), a dashboard, a deal resume flow that bridges marketing DraftSnapshots into authenticated deals with immutable calculator snapshots, and a share-link flow for read-only deal viewing.

## Project Structure
```
src/
├── app/
│   ├── page.tsx              # Main intake form
│   ├── login/page.tsx        # Sign in page
│   ├── signup/page.tsx       # Sign up page with role selection
│   ├── dashboard/page.tsx    # User dashboard (role-specific)
│   ├── resume/page.tsx       # Draft token → Deal redemption page
│   ├── deal/[dealId]/page.tsx # Deal view (OWNER/VIEWER, read-only shared)
│   ├── share/page.tsx        # Share token → VIEWER grant → redirect to deal
│   ├── protected/page.tsx    # Auth-gated page (legacy)
│   ├── my-scenarios/page.tsx # User scenarios list
│   ├── reset-password/page.tsx # Password reset request
│   ├── update-password/page.tsx # Set new password
│   ├── verify-email/page.tsx # Email verification
│   ├── me/                   # Debug page for /api/me
│   ├── auth/
│   │   ├── login/route.ts    # Login POST handler (LOCKED)
│   │   ├── signup/route.ts   # Signup POST handler (LOCKED)
│   │   ├── logout/route.ts   # Logout handler (LOCKED)
│   │   ├── callback/route.ts # OAuth/magic link callback (LOCKED)
│   │   └── resend-confirmation/route.ts (LOCKED)
│   └── api/
│       ├── submit/route.ts   # Form submission
│       ├── scenario/route.ts # GET/POST scenarios (legacy pre-deal)
│       ├── me/route.ts       # Current user info (LOCKED)
│       ├── deals/
│       │   ├── resume/route.ts       # POST: resume DraftSnapshot → Deal + Snapshot v1
│       │   └── [dealId]/
│       │       ├── share/route.ts    # POST: create share link (OWNER only)
│       │       └── snapshot/route.ts # POST: owner-only snapshot ingestion
│       └── drafts/
│           ├── mint/route.ts   # POST: mint draft token (pre-auth)
│           └── redeem/route.ts # POST: redeem token → scenario (legacy)
├── components/
│   ├── AuthHeader.tsx        # Sign in/out header
│   └── ShareDealCard.tsx     # Share deal form (client component)
├── lib/
│   ├── supabase/
│   │   ├── client.ts         # Browser Supabase client
│   │   ├── server.ts         # Server Supabase client (anon)
│   │   ├── service.ts        # Service-role Supabase client
│   │   ├── admin.ts          # Admin/service-role client (alternate)
│   │   └── middleware.ts     # Session refresh
│   ├── draftSnapshot.ts      # DraftSnapshot v1 validation + hash verification
│   ├── dealSnapshot.ts       # FullDealSnapshotV1 validation (opaque, no recompute)
│   ├── dealSnapshotDb.ts     # insertDealSnapshot + getLatestDealSnapshot helpers
│   ├── dealSnapshotDisplay.ts # Pure display extraction + formatting helpers
│   ├── draftToDealSnapshot.ts # DraftSnapshotV1 → FullDealSnapshotV1 mapping
│   ├── rateLimit.ts          # In-memory IP rate limiter
│   ├── useSession.ts         # React session hook
│   └── __tests__/
│       ├── draftToken.test.ts              # Token generation tests (5 tests)
│       ├── draftSnapshotValidation.test.ts # Snapshot validation tests (12 tests)
│       ├── dealSnapshotValidation.test.ts  # FullDealSnapshotV1 validation tests (14 tests)
│       ├── dealSnapshotDisplay.test.ts    # Snapshot display/rendering + selection tests (14 tests)
│       ├── draftToDealSnapshot.test.ts   # Draft→Deal snapshot mapping tests (5 tests)
│       ├── shareRoute.test.ts             # Share route validation tests (9 tests)
│       └── snapshotIngestion.test.ts     # Snapshot ingestion route tests (14 tests)
└── middleware.ts             # Next.js middleware

supabase/
└── migrations/
    ├── 20260131_agentic_005_fractpath_scenarios.sql
    ├── 20260209_sprint5_draft_tokens.sql
    ├── 20260210_app_int_001_deals_snapshots_events.sql
    ├── 20260210_create_deal_with_owner_grant.sql
    ├── 20260210_rls_deals_owner_viewer.sql
    ├── 20260210_share_access_grants_tokens.sql
    ├── 20260210_rls_snapshots_events_viewer.sql
    └── 20260210_app_060_deal_snapshots.sql

tickets/
├── README.md                 # Ticket index and conventions
├── APP/                      # Product feature tickets
└── OPS/                      # Ops/infrastructure tickets

docs/
├── README.md                 # Documentation index
├── ENV-CONTRACT.md           # Env var contract
├── runbook/dev.md            # Developer runbook
└── sprint4-test-commands.md
```

## Running the Project
```bash
npm run dev -- -p 5000
```

## Environment Variables
Required for authentication:
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL (must be full HTTPS URL)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon/public key
- `SUPABASE_URL` - Same as above (for server-side)
- `SUPABASE_ANON_KEY` - Same as above (for server-side)

Required for deal resume + share flows:
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (SECRET, never expose to browser)

## Domain Model

### Deal Lifecycle
- DraftSnapshot (marketing widget) → draft_token (minted pre-auth) → Deal + Calculator Snapshot v1 (post-auth)
- Deals are created via POST /api/deals/resume only
- Calculator snapshots are append-only, immutable, versioned
- Deal events provide audit trail (DEAL_CREATED, CALCULATOR_SNAPSHOT_CREATED)

### Share Link Flow
- Owner clicks "Share" → POST /api/deals/[dealId]/share → returns shareUrl
- shareUrl = /share?t={token}
- Recipient opens shareUrl → /share page validates token
- If not authenticated → sign-in/signup links with returnTo preservation
- If authenticated → VIEWER grant created → redirect to /deal/{id}?mode=shared
- Recipient sees: read-only banner, VIEWER role, Snapshot v1, Deal events
- No deal math recompute, no snapshot mutation, no write access

### DraftSnapshot v1 Contract
- schema_version: "1"
- inputs: object (verbatim from widget)
- result: object (verbatim from widget)
- engine_version: string
- calculator_schema_version: string
- inputs_hash: SHA-256 of JSON.stringify(inputs)
- result_hash: SHA-256 of JSON.stringify(result)
- Validation: schema_version check, required fields, hash integrity
- No recomputation, no normalization beyond schema validation

### Access Control
- `deal_access_grants` table: (deal_id, user_id, role)
- Roles: OWNER, VIEWER
- RLS: deals SELECT via grant; UPDATE/DELETE OWNER only
- calculator_snapshots and deal_events: SELECT via grant on parent deal
- deal_snapshots: SELECT via grant, INSERT OWNER only, UPDATE/DELETE denied (append-only triggers)
- deal_share_tokens: service-role only (deny all anon/authenticated)

## Sprint Status

### APP-063 — Owner-only snapshot ingestion endpoint (Complete)
- [x] POST /api/deals/[dealId]/snapshot — auth + OWNER-only
- [x] Request body: { snapshot: FullDealSnapshotV1 } (opaque, no recompute)
- [x] Uses insertDealSnapshot() as single source for validation + insert
- [x] Ownership: owner_user_id match OR OWNER grant in deal_access_grants
- [x] Error responses: 401 (unauth), 403 (not owner), 400 (bad body), 404 (no deal), 422 (validation)
- [x] Returns: { ok: true, snapshot_id } on success (201)
- [x] Tests: 14 ingestion route tests (UUID, body parsing, ownership, validation gating)
- [x] npm run build passes

### APP-062 — Snapshot history & selection (Complete)
- [x] getDealSnapshots(dealId, limit=20) helper added
- [x] selectSnapshot() pure helper for selection logic with fallback to latest
- [x] Deal page fetches full snapshot list (up to 20)
- [x] Snapshot history section shows when >1 snapshot exists
- [x] Selection via ?snapshot=<id> URL param (server-side, no client JS)
- [x] "Back to latest" link when viewing older snapshot
- [x] Shared mode preserved in history links
- [x] Tests: 14 display + selection tests (9 existing + 5 new, all passing)
- [x] npm run build passes

### APP-061B — Resume route persists deal_snapshots (Complete)
- [x] Replaced all calculator_snapshots reads/writes with deal_snapshots
- [x] Resume route uses insertDealSnapshot + getLatestDealSnapshot
- [x] Pure mapping helper: mapDraftToDealSnapshot (DraftSnapshotV1 → FullDealSnapshotV1)
- [x] Idempotency preserved: existing deal_snapshot skips duplicate insert
- [x] Audit event renamed: CALCULATOR_SNAPSHOT_CREATED → DEAL_SNAPSHOT_CREATED
- [x] Response includes snapshot_id field
- [x] Tests: 5 mapping tests (all passing)
- [x] npm run build passes

### APP-061 — Render deal detail from persisted snapshot only (Complete)
- [x] Deal page fetches from deal_snapshots via getLatestDealSnapshot
- [x] Snapshot present → renders inputs/outputs as key-value pairs (no recompute)
- [x] Snapshot missing → clear empty state ("No scenario snapshot saved yet")
- [x] Chart series rendered if present in snapshot_json
- [x] Graceful degradation for missing optional fields (em dash fallback)
- [x] Pure display helper (dealSnapshotDisplay.ts) with formatValue + humanLabel
- [x] Tests: 9 display logic tests (all passing)
- [x] npm run build passes

### APP-060 — Persist FullDealSnapshotV1 (Complete)
- [x] Migration: deal_snapshots table with append-only triggers, indexes, RLS
- [x] RLS: SELECT via grant (OWNER/VIEWER), INSERT OWNER only, no UPDATE/DELETE
- [x] FullDealSnapshotV1 validation (contract_version, schema_version, inputs, outputs)
- [x] Server helpers: insertDealSnapshot + getLatestDealSnapshot
- [x] Tests: 14 validation tests (all passing)
- [x] npm run build passes
- [ ] Run migration on Supabase

### APP-SHARE-001 — Share Link Produces VIEWER Read-Only (Current)
- [x] Migration: deal_access_grants + deal_share_tokens tables
- [x] Migration: RLS for calculator_snapshots + deal_events (SELECT via grant)
- [x] POST /api/deals/[dealId]/share — owner only, creates share token, returns local shareUrl
- [x] /share page — validates token, handles auth, creates VIEWER grant, redirects to deal
- [x] Deal page shows read-only banner, Snapshot v1, Deal events for VIEWERs
- [x] Tests: 9 share route validation tests (all passing)
- [x] npm run build passes
- [ ] Run migrations on Supabase
- [ ] End-to-end manual QA

### APP-INT-001 — Resume DraftSnapshot into Deal (Complete)
- [x] Supabase migration: deals, calculator_snapshots, deal_events tables with RLS
- [x] DraftSnapshot v1 validation (schema_version, required fields, hash checks)
- [x] POST /api/deals/resume — auth, validate, atomic redeem, deal+snapshot+events
- [x] /resume page updated to call /api/deals/resume, redirect to deal view
- [x] Idempotent re-entry: same user → return existing deal
- [x] Atomic token redemption with row-count guard
- [x] Audit events: DEAL_CREATED, CALCULATOR_SNAPSHOT_CREATED
- [x] Tests: 12 validation tests + 5 token tests (all passing)

### Sprint 5 - Draft Token Bridge (Complete)
- [x] draft_tokens table with RLS (service-role only)
- [x] Service-role Supabase client
- [x] POST /api/drafts/mint — mint opaque draft token (pre-auth, rate-limited)
- [x] POST /api/drafts/redeem — legacy redeem to fractpath_scenarios
- [x] Token preserved across login via cookie (fractpath_draft_token)
- [x] Dashboard detects pending draft cookie, redirects to /resume

### APP-001 - Secure Portal Onboarding (In Progress)
- [x] Role selection on signup (homeowner, buyer, realtor)
- [x] Persona URL param support (?persona=homeowner)
- [x] Profile storage in Supabase user_metadata
- [x] Dashboard page with role-specific content
- [x] Login redirects to /dashboard
- [ ] Full end-to-end testing

### Sprint 4 - Authentication & Scenarios (Complete)
- [x] Login/signup/email verification flows
- [x] Protected pages with auth guard
- [x] My Scenarios page
- [x] Password reset/update flows
- [x] API: /api/me, /api/scenario

### Test User
- Email: `cookie-test@example.com`
- Password: `TestPassw0rd`

## Auth Baseline (LOCKED)
Do NOT modify these files without a dedicated, reviewed ticket:
- src/app/api/me/route.ts
- src/app/auth/callback/route.ts
- src/app/auth/login/route.ts
- src/app/auth/logout/route.ts
- src/app/auth/resend-confirmation/route.ts
- src/app/auth/signup/route.ts
- src/app/me/page.tsx

## User Preferences
- Language must be neutral and exploratory (no deal/commitment language in user-facing copy)
- DraftSnapshot inputs/results are stored verbatim — no recomputation or normalization
- Calculator snapshots are immutable and append-only
- Errors must be explicit and blocking (fail-closed)

## Roles/Personas
- **Homeowner**: "Exploring a new way to unlock equity without a loan"
- **Buyer**: "Modeling a pathway to ownership through shared equity"
- **Realtor**: "Participating as a referral partner and co-pilot"

## Test Commands
See `docs/sprint4-test-commands.md` for curl commands and browser QA instructions.
