# FractPath

## Overview
FractPath is a minimal homeowner intake application built with Next.js. It collects exploratory scenario information and sends a deterministic, non-binding scenario summary to HubSpot for internal sales follow-up.

## Project Structure
```
src/
├── app/
│   ├── page.tsx              # Main intake form
│   ├── login/page.tsx        # Sign in page
│   ├── signup/page.tsx       # Sign up page with role selection
│   ├── dashboard/page.tsx    # User dashboard (role-specific)
│   ├── protected/page.tsx    # Auth-gated page (legacy)
│   ├── my-scenarios/page.tsx # User scenarios list
│   ├── reset-password/page.tsx # Password reset request
│   ├── update-password/page.tsx # Set new password
│   ├── verify-email/page.tsx # Email verification
│   ├── me/                   # Debug page for /api/me
│   ├── auth/
│   │   ├── login/route.ts    # Login POST handler
│   │   ├── signup/route.ts   # Signup POST handler (stores role)
│   │   ├── logout/route.ts   # Logout handler
│   │   ├── callback/route.ts # OAuth/magic link callback
│   │   └── resend-confirmation/route.ts
│   └── api/
│       ├── submit/route.ts   # Form submission
│       ├── scenario/route.ts # GET/POST scenarios
│       └── me/route.ts       # Current user info (includes role)
├── components/
│   └── AuthHeader.tsx        # Sign in/out header
├── lib/
│   ├── supabase/
│   │   ├── client.ts         # Browser Supabase client
│   │   ├── server.ts         # Server Supabase client
│   │   └── middleware.ts     # Session refresh
│   └── useSession.ts         # React session hook
└── middleware.ts             # Next.js middleware

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

## Sprint Status

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

## User Preferences
- Language must be neutral and exploratory (no deal/commitment language)
- No persistence of scenarios implied
- No new domain objects (Deal IDs, Property IDs)

## Roles/Personas
- **Homeowner**: "Exploring a new way to unlock equity without a loan"
- **Buyer**: "Modeling a pathway to ownership through shared equity"
- **Realtor**: "Participating as a referral partner and co-pilot"

## Test Commands
See `docs/sprint4-test-commands.md` for curl commands and browser QA instructions.
