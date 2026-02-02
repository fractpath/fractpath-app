# Replit Baseline Contract (Known-Good)

## Must-pass checks
- `npm run smoke`:
  - /login returns 200
  - /api/me returns 401 when logged out

## Replit proxy expectations
- Replit Run invokes: `npm run dev -p 5000` (or similar)
- `package.json` MUST allow Next to accept the CLI port flag.
  - dev script: `next dev -H 0.0.0.0`
  - DO NOT hardcode `-p` in package.json

## Replit config
- `.replit` uses:
  - `run = "npm run dev"`
  - `[[ports]] localPort = 5000 externalPort = 80` (if your Run passes -p 5000)
  - If port changes, keep these aligned.

## Supabase env guardrails
- Server: `src/app/lib/supabaseServer.ts`
  - Prefers SUPABASE_* but falls back to NEXT_PUBLIC_* if needed
  - Validates https URL
- Client: `src/lib/supabase/client.ts`
  - Defensive selection to survive env var swapping in Replit

## Recovery (fast)
1) `pkill -f next || true`
2) `rm -rf .next`
3) Click Run
4) `npm run smoke`

## Baseline tag
- `replit-baseline`
