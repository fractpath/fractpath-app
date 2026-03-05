# Redirect Loop Fix Log

Date: 2026-03-05

## Root Cause — Ping-Pong Redirect

Two redirects created an infinite loop:

1. **Deal page → Thread page:** Added in the role-gating fix, `src/app/deal/[dealId]/page.tsx` redirected property owners to `/threads/${activeThread.id}` when `isPendingOwner && isPropertyOwner`.

2. **Thread page → Deal page:** Sprint 13 Option A already had a redirect from `/threads/[threadId]` back to `/deal/[dealId]#offer` for owners in certain conditions.

Together: owner visits `/deal/X` → redirected to `/threads/Y` → redirected back to `/deal/X` → infinite loop.

## Fix Applied

### Removed
- The `redirect(/threads/${activeThread.id})` call in `src/app/deal/[dealId]/page.tsx` (lines 106-108 removed).

### Added
- Derived boolean: `const showOwnerReviewLink = isPendingOwner && isPropertyOwner && !!activeThread`
- Inline owner-only banner (emerald-themed) with text "Offer submitted — review and decide" and a "Review offer" Link to `/threads/${activeThread.id}`.
- Banner only renders when `showOwnerReviewLink && activeThread` — property owner during pending_owner state only.

### Unchanged
- Buyer locking behavior (`locked` prop, disabled title/save/add-property/submit-offer).
- Buyer-only Withdraw banner (`isPendingOwner && isBuyer`).
- All backend routes, DB schema, RLS, `/threads` pages.

## Files Changed

1. `src/app/deal/[dealId]/page.tsx`
2. `docs/redirect-loop-fix-log.md` (this file)

## Verification

### Build
```
$ npm run build → Compiled successfully, all routes, no errors.
```

### Redirect removal confirmed
```
$ rg -n 'redirect(`/threads/${activeThread.id}`)' src/app/deal/[dealId]/page.tsx
No redirect to /threads found — confirmed removed
```

## Manual Verification Checklist

- [ ] **As homeowner:** Visit /deal/[dealId] while pending_owner → no redirect loop; see "Offer submitted — review and decide" banner with "Review offer" link; Withdraw banner NOT shown.
- [ ] **As buyer:** Visit /deal/[dealId] while pending_owner → Withdraw banner shown; title/save/add-property locked; no owner review link shown.
- [ ] **Confirm /threads flow** still behaves as before (Accept/Reject available on thread page for owner).
- [ ] **After decision:** Both banners disappear (thread status no longer pending_owner).
