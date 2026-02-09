# FractPath

## Overview
FractPath is a minimal homeowner intake application built with Next.js. It collects exploratory scenario information and sends a deterministic, non-binding scenario summary to HubSpot for internal sales follow-up. The portal includes Supabase authentication with role-based onboarding (Homeowner, Buyer, Realtor), a dashboard, and a draft token bridge from the marketing widget to authenticated scenarios.

## Project Structure
```
src/
├── app/
│   ├── page.tsx              # Main intake form
│   ├── login/page.tsx        # Sign in page
│   ├── signup/page.tsx       # Sign up page with role selection
│   ├── dashboard/page.tsx    # User dashboard (role-specific)
│   ├── resume/page.tsx       # Draft token redemption page
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
│       ├── scenario/route.ts # GET/POST scenarios
│       ├── me/route.ts       # Current user info (LOCKED)
│       └── drafts/
│           ├── mint/route.ts   # POST: mint draft token (pre-auth)
│           └── redeem/route.ts # POST: redeem token → scenario
├── components/
│   └── AuthHeader.tsx        # Sign in/out header
├── lib/
│   ├── supabase/
│   │   ├── client.ts         # Browser Supabase client
│   │   ├── server.ts         # Server Supabase client (anon)
│   │   ├── service.ts        # Service-role Supabase client
│   │   └── middleware.ts     # Session refresh
│   ├── rateLimit.ts          # In-memory IP rate limiter
│   ├── useSession.ts         # React session hook
│   └── __tests__/
│       └── draftToken.test.ts # Token generation tests
└── middleware.ts             # Next.js middleware

supabase/
└── migrations/
    ├── 20260131_agentic_005_fractpath_scenarios.sql
    └── 20260209_sprint5_draft_tokens.sql

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

Required for Sprint 5 (draft token mint/redeem):
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (SECRET, never expose to browser)

## Sprint Status

### Sprint 5 - Draft Token Bridge (APP-INT-001) (In Progress)
- [x] Supabase migration: draft_tokens table with RLS (service-role only)
- [x] Service-role Supabase client (src/lib/supabase/service.ts)
- [x] POST /api/drafts/mint — mint opaque draft token (pre-auth, rate-limited)
- [x] POST /api/drafts/redeem — redeem token → fractpath_scenarios row
- [x] /resume page — token redemption UI with auth flow
- [x] Token preserved across login via cookie (fractpath_draft_token)
- [x] Dashboard detects pending draft cookie, redirects to /resume
- [x] Lightweight tests for token entropy, uniqueness, snapshot passthrough
- [x] npm run build passes
- [ ] Run migration on Supabase
- [ ] Add SUPABASE_SERVICE_ROLE_KEY to environment
- [ ] End-to-end manual QA

### APP-001 - Secure Portal Onboarding (In Progress)
- [x] Role selection on signup (homeowner, buyer, realtor)
- [x] Persona URL param support (?persona=homeowner)
- [x] Profile storage in Supabase user_metadata
- [x] Dashboard page with role-specific content
- [x] Scenario acknowledgment placeholder
- [x] Trust/security signals
- [x] Login redirects to /dashboard
- [ ] Full end-to-end testing

### Sprint 4 - Authentication & Scenarios (Complete)
- [x] Login page and auth flow
- [x] Signup page with email verification
- [x] Protected page with auth guard
- [x] My Scenarios page with API integration
- [x] Reset password flow
- [x] Update password flow
- [x] Verify email page with resend
- [x] API: /api/me (current user)
- [x] API: /api/scenario (GET/POST scenarios)

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
- Language must be neutral and exploratory (no deal/commitment language)
- No persistence of scenarios implied
- No new domain objects (Deal IDs, Property IDs)
- DraftSnapshot is opaque — store and forward, never interpret fields

## Roles/Personas
- **Homeowner**: "Exploring a new way to unlock equity without a loan"
- **Buyer**: "Modeling a pathway to ownership through shared equity"
- **Realtor**: "Participating as a referral partner and co-pilot"

## Test Commands
See `docs/sprint4-test-commands.md` for curl commands and browser QA instructions.
