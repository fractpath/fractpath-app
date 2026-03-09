# Dashboard Badge + Default Landing

## Summary of Changes

### Task A — Dashboard offer link target
- **File:** `src/app/dashboard/page.tsx`
- The "Offers waiting for your decision" section listed pending_owner threads with links to `/threads/<threadId>`.
- Changed link href from `/threads/${thread.id}` to `/deal/${thread.deal_id}#offer`.
- Badge/count logic unchanged — still based on `pendingOwnerThreads` (status=pending_owner, property owner match).

### Task B — Default post-auth landing
- **Files:** `src/app/auth/login/route.ts`, `src/app/auth/signup/route.ts`
- Login route already defaulted to `/dashboard` when no returnTo was provided. Added two additional safety checks to `sanitizeReturnTo`: reject strings starting with `/\` and strings containing `://`.
- Signup route: added `sanitizeReturnTo` function (same rules) and reads `returnTo` from form data. If a safe returnTo is provided and is not `/dashboard`, it is passed through to the `/auth/callback` URL as `?next=<returnTo>` so the callback route (which already reads `next` and defaults to `/dashboard`) will honor it after email verification.

## returnTo Safety Rules

The `sanitizeReturnTo` function (identical in both login and signup routes) applies these checks in order:

1. Must be a string — otherwise `/dashboard`
2. Must start with `/` — otherwise `/dashboard`
3. Must NOT start with `//` — otherwise `/dashboard` (prevents protocol-relative URLs)
4. Must NOT start with `/\` — otherwise `/dashboard` (prevents backslash-based redirects)
5. Must NOT contain `://` — otherwise `/dashboard` (prevents embedded protocol URLs)
6. If all checks pass, the value is used as-is

## Manual Test Plan

### 1. Normal login (no returnTo)
- Visit `/login` (no returnTo param), log in
- Expected: lands on `/dashboard`

### 2. Explicit returnTo preserved
- Visit `/login?returnTo=%2Fdeal%2F938fbba6-2340-4467-a6b8-8566250450bf%23offer`
- Log in
- Expected: lands on `/deal/938fbba6-...#offer`

### 3. Malicious returnTo blocked
- `/login?returnTo=https://evil.com` → lands on `/dashboard`
- `/login?returnTo=//evil.com` → lands on `/dashboard`
- `/login?returnTo=/\evil.com` → lands on `/dashboard`
- `/login?returnTo=javascript://alert(1)` → lands on `/dashboard`

### 4. Owner dashboard — offer links
- Log in as a property owner who has pending_owner threads
- See "Offers waiting for your decision" section with correct count
- Click an item → opens `/deal/<dealId>#offer` (not `/threads/<threadId>`)
- Deal page shows the OwnerDecisionBanner + modal

### 5. Buyer dashboard unaffected
- Log in as a buyer
- "Offers waiting for your decision" section should NOT appear (buyer is not the property owner for those threads)

### 6. Signup with returnTo
- Visit `/signup?returnTo=%2Fdeal%2Fabc123`
- Complete signup form
- Expected: redirected to `/verify-email`
- After clicking email confirmation link: lands on `/deal/abc123` (returnTo passed through to callback)

### 7. Signup without returnTo
- Visit `/signup` (no returnTo)
- Complete signup
- After email confirmation: lands on `/dashboard`
