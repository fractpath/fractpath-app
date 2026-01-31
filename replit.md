# FractPath

## Overview
FractPath is a minimal homeowner intake application built with Next.js. It collects exploratory scenario information and sends a deterministic, non-binding scenario summary to HubSpot for internal sales follow-up.

## Project Structure
```
src/
├── app/
│   ├── page.tsx              # Main intake form
│   ├── login/page.tsx        # Sign in page
│   ├── signup/page.tsx       # Sign up page
│   ├── reset-password/page.tsx # Password reset page
│   ├── auth/callback/route.ts  # Auth callback handler
│   └── api/submit/route.ts   # Form submission endpoint
├── components/
│   └── AuthHeader.tsx        # Sign in/out header component
├── lib/
│   ├── supabase/
│   │   ├── client.ts         # Browser Supabase client
│   │   ├── server.ts         # Server Supabase client
│   │   └── middleware.ts     # Session refresh middleware
│   └── useSession.ts         # React session hook
└── middleware.ts             # Next.js middleware
```

## Running the Project
```bash
npm run dev -- -p 5000
```

## Environment Variables
Required for authentication:
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL (must be full HTTPS URL, e.g., https://xxxxx.supabase.co)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon/public key

## Authentication
- Email/password sign up and sign in via Supabase Auth
- Password reset flow with email link
- Session persistence across page refreshes
- Auth header shows Sign in / Sign out based on state
- Homepage remains accessible without authentication

## User Preferences
- Language must be neutral and exploratory (no deal/commitment language)
- No persistence of scenarios implied
- No new domain objects (Deal IDs, Property IDs)
