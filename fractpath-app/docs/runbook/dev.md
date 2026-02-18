# Developer Runbook — fractpath-app

## Prerequisites

- Node.js 20+
- npm (ships with Node)

## Install dependencies

```bash
npm install
```

## Required environment variables

Create a `.env.local` file in the project root with the following keys (do not commit this file):

| Variable                         | Description                        |
|----------------------------------|------------------------------------|
| `SUPABASE_URL`                   | Supabase project URL (https)       |
| `SUPABASE_ANON_KEY`              | Supabase anon / public key         |
| `NEXT_PUBLIC_SUPABASE_URL`       | Same as SUPABASE_URL (browser)     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | Same as SUPABASE_ANON_KEY (browser)|

See `docs/ENV-CONTRACT.md` for the full environment variable contract.

## Run dev server

```bash
npm run dev
```

The server starts on **http://localhost:5000** (port 5000, bound to 0.0.0.0).

A pre-dev script (`scripts/check-env.mjs`) validates required env vars before starting.

## Lint

```bash
npm run lint
```

## Build (production)

```bash
npm run build
```

## Smoke tests

```bash
npm run smoke
```

Runs `scripts/smoke.sh` against a running dev server.

## Full verify pipeline

```bash
npm run verify
```

Runs lint, build, and smoke tests in sequence.

## Common issues

### Port 5000 already in use

Kill any process using port 5000:

```bash
lsof -ti:5000 | xargs kill -9
```

### Missing environment variables

If you see `Missing env var: SUPABASE_URL` (or similar), make sure `.env.local` exists and contains all required variables. The pre-dev check will fail fast with the missing key name.

### SUPABASE_URL must be https

The env check enforces that `SUPABASE_URL` starts with `https://`. Double-check that you copied the full Supabase project URL (e.g. `https://<project-ref>.supabase.co`).

### NEXT_PUBLIC vars look wrong

Warnings like `WARN: NEXT_PUBLIC_SUPABASE_URL looks wrong` mean the public-facing copy of the variable has an unexpected format. Ensure both `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` contain the same HTTPS URL, and that the `*_ANON_KEY` vars contain a JWT string (not a URL).

### HMR / hot-reload not working

If changes don't appear, check the browser console for `[HMR] connected`. If missing, restart the dev server. In the Replit environment, the app is served through a proxy — make sure `allowedDevOrigins` is not blocking your host.
