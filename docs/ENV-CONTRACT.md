# ENV Contract — fractpath-app

Purpose: define the authoritative environment-variable contract for `fractpath/fractpath-app` so local, Replit, and Vercel environments stay consistent and agents do not invent new env vars.

## Non-negotiables
- Never paste secrets into chat.
- Never log secrets (stdout or CI logs).
- Never embed tokens in git remotes.
- Any new environment variable requires updating this document in the same PR.

## Where environment variables live
- Local: `.env.local` (never commit)
- Replit: Secrets / environment panel (never commit)
- Vercel: Project → Settings → Environment Variables

## Required (app runtime)

### Supabase
- `SUPABASE_URL`
  - Required: YES
  - Secret: NO
  - Example: `https://<project-ref>.supabase.co`

- `SUPABASE_ANON_KEY`
  - Required: YES
  - Secret: YES (treat as secret operationally)
  - Notes: used by client and server in standard Supabase patterns.

- `SUPABASE_SERVICE_ROLE_KEY`
  - Required: NO (only if privileged server-side operations exist)
  - Secret: YES (HIGH)
  - Notes: never expose to browser; never log.

### Base URL
- `APP_BASE_URL`
  - Required: YES
  - Secret: NO
  - Examples:
    - Production: `https://app.fractpath.com`
    - Local: `http://localhost:3000`
  - Used for absolute redirects, callbacks, and email links.

## Optional (feature-gated)

### Email
Enabled only when outbound email is implemented.

- `EMAIL_PROVIDER`
  - Required: NO
  - Values: `ses` | `smtp` | `resend` | `none`
  - Default: `none`

If `EMAIL_PROVIDER=ses`:
- `SES_REGION` (not secret)

If `EMAIL_PROVIDER=smtp`:
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS` (SECRET)

### Stripe
Enabled only when payments are implemented.

- `STRIPE_SECRET_KEY` (SECRET)
- `STRIPE_WEBHOOK_SECRET` (SECRET)

## Public (browser-exposed)
Anything prefixed with `NEXT_PUBLIC_` is public and must never contain secrets.

- `NEXT_PUBLIC_APP_BASE_URL`
  - Required: NO (only if the client needs it)
  - Secret: NO

## Conventions
- Prefer server-side evaluation of environment variables.
- Fail fast in development if required environment variables are missing.
