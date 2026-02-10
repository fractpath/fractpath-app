# FractPath

## Overview
FractPath is a minimal homeowner intake application built with Next.js. It collects exploratory scenario information and sends a deterministic, non-binding scenario summary to HubSpot for internal sales follow-up. The portal includes Supabase authentication with role-based onboarding (Homeowner, Buyer, Realtor), a dashboard, and a deal resume flow that bridges marketing DraftSnapshots into authenticated deals with immutable calculator snapshots.

## Project Structure
```
src/
├── app/
│   ├── page.tsx              # Main intake form
│   ├── login/page.tsx        # Sign in page
│   ├── signup/page.tsx       # Sign up page with role selection
│   ├── dashboard/page.tsx    # User dashboard (role-specific)
│   ├── resume/page.tsx       # Draft token → Deal redemption page
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
│       │   └── resume/route.ts # POST: resume DraftSnapshot → Deal + Snapshot v1
│       └── drafts/
│           ├── mint/route.ts   # POST: mint draft token (pre-auth)
│           └── redeem/route.ts # POST: redeem token → scenario (legacy)
├── components/
│   └── AuthHeader.tsx        # Sign in/out header
├── lib/
│   ├── supabase/
│   │   ├── client.ts         # Browser Supabase client
│   │   ├── server.ts         # Server Supabase client (anon)
│   │   ├── service.ts        # Service-role Supabase client
│   │   └── middleware.ts     # Session refresh
│   ├── draftSnapshot.ts      # DraftSnapshot v1 validation + hash verification
│   ├── rateLimit.ts          # In-memory IP rate limiter
│   ├── useSession.ts         # React session hook
│   └── __tests__/
│       ├── draftToken.test.ts              # Token generation tests (5 tests)
│       └── draftSnapshotValidation.test.ts # Snapshot validation tests (12 tests)
└── middleware.ts             # Next.js middleware

supabase/
└── migrations/
    ├── 20260131_agentic_005_fractpath_scenarios.sql
    ├── 20260209_sprint5_draft_tokens.sql
    └── 20260210_app_int_001_deals_snapshots_events.sql

tickets/
├── README.md                 # Ticket index and conventions
├── APP/                      # Product feature tickets (APP-001 through APP-013)
└── OPS/                      # Ops/infrastructure tickets (OPS-001, OPS-003)

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

Required for deal resume flow:
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (SECRET, never expose to browser)

## Domain Model

### Deal Lifecycle
- DraftSnapshot (marketing widget) → draft_token (minted pre-auth) → Deal + Calculator Snapshot v1 (post-auth)
- Deals are created via POST /api/deals/resume only
- Calculator snapshots are append-only, immutable, versioned
- Deal events provide audit trail (DEAL_CREATED, CALCULATOR_SNAPSHOT_CREATED)

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

## Sprint Status

### APP-INT-001 — Resume DraftSnapshot into Deal (Current)
- [x] Supabase migration: deals, calculator_snapshots, deal_events tables with RLS
- [x] DraftSnapshot v1 validation (schema_version, required fields, hash checks)
- [x] POST /api/deals/resume — auth, validate, atomic redeem, deal+snapshot+events
- [x] /resume page updated to call /api/deals/resume, redirect to deal view
- [x] Idempotent re-entry: same user → return existing deal
- [x] Atomic token redemption with row-count guard
- [x] Audit events: DEAL_CREATED, CALCULATOR_SNAPSHOT_CREATED
- [x] Tests: 12 validation tests + 5 token tests (all passing)
- [x] npm run build passes
- [ ] Run migration on Supabase
- [ ] Add SUPABASE_SERVICE_ROLE_KEY to environment
- [ ] End-to-end manual QA

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
