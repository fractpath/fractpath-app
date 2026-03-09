# Owner Review Redirect + Read-Only Fix

Date: 2026-03-05

## Changes

### T1 — /threads redirect now skips pending_owner

**File:** `src/app/threads/[threadId]/page.tsx`, line 162

**Before:**
```ts
if (!debug && !fromDeal && dealId) {
  redirect(`/deal/${dealId}#offer`);
}
```

**After:**
```ts
if (!debug && !fromDeal && dealId && thread.status !== "pending_owner") {
  redirect(`/deal/${dealId}#offer`);
}
```

**Why:** The redirect sent property owners away from the thread decision surface (Accept/Reject) during pending_owner. Combined with the deal page's "Review offer" link back to /threads, this caused navigation confusion. Now owners stay on /threads when the thread is pending_owner.

### T2 — Deal page fully read-only during pending_owner

**File:** `src/app/deal/[dealId]/page.tsx`, line 110

**Before:**
```ts
const locked = !!(isPendingOwner && isBuyer);
```

**After:**
```ts
const locked = !!isPendingOwner;
```

**Why:** During pending_owner, both buyer and property owner should see a read-only deal page. Previously only the buyer was locked.

### T3 — Calculator view-only during pending_owner

**File:** `src/app/deal/[dealId]/page.tsx`, line 165

**Before:**
```ts
canEdit={isOwner}
```

**After:**
```ts
canEdit={isOwner && !locked}
```

**Why:** The calculator's edit mode was gated only by isOwner, allowing edits during pending_owner. Now locked=true forces view-only.

### T5 — DealHeader: plain text title, hidden buttons when locked

**File:** `src/components/deals/DealHeader.tsx`

**Before:** Title always rendered as an `<input>`, Save/Add property/Submit Offer always shown (just disabled).

**After:**
- When `locked=true`: title renders as plain `<div>` text (not editable)
- When `locked=true`: Save, "+ Add property", and Submit Offer buttons are completely hidden (not just disabled)
- When `locked=false`: behavior unchanged (input + buttons as before)

## T4 — Discovery: Owner Accept/Reject Implementation

### Location
- **Component:** `src/components/threads/ThreadActionPanel.tsx` (inline panel, not a modal)
  - Lines 92-158: Owner view renders Accept/Reject buttons
  - Gating: `isOwner && proposalStatus === "submitted" && threadStatus === "pending_owner" && !finalized`
  - Verification gate: `acceptAllowed` from `useThreadVerificationStatus(threadId)`
  - Calls `POST /api/proposals/${proposalId}/owner-decision` with `{ decision: "accept" | "reject" }`

- **Parent:** `src/components/threads/ThreadDetailView.tsx`
  - Line 173: Renders `<ThreadActionPanel>` with `isOwner`, `proposalId`, `proposalStatus`

- **Backend:** `src/app/api/proposals/[proposalId]/owner-decision/route.ts`
  - Validates owner via property.owner_user_id
  - Checks thread.status === "pending_owner"
  - Checks property verification for accept
  - Inserts OFFER_ACCEPTED or OFFER_REJECTED deal_event
  - Updates thread status to "accepted" or "declined"

### Reuse potential for deal-page modal (next phase)
`ThreadActionPanel` is a self-contained client component. It could be imported directly into a modal on the deal page, passing `isOwner`, `threadId`, `threadStatus`, `proposalId`, and `proposalStatus`. The backend route does not depend on being called from /threads.

## Files Changed

1. `src/app/threads/[threadId]/page.tsx`
2. `src/app/deal/[dealId]/page.tsx`
3. `src/components/deals/DealHeader.tsx`
4. `docs/owner-review-redirect-and-readonly-fix.md` (this file)

## Verification

### Build
```
$ npm run build → Compiled successfully, all routes, no errors.
```

### Grep proof
```
/threads redirect is now conditional on thread.status !== "pending_owner"
DealHeader: locked gates plain-text title + hides Save/Add property/Submit Offer
Deal page: locked = !!isPendingOwner, canEdit = isOwner && !locked
```

## Manual Test Plan

- [ ] **As homeowner:** Click "Review offer" link on deal page → arrives at /threads/[threadId] → page stays (no redirect to /deal) → sees Accept/Reject controls
- [ ] **As homeowner:** Visit /deal/[dealId] while pending_owner → title is plain text, Save/Add property/Submit Offer hidden, calculator view-only, "Review offer" link visible
- [ ] **As buyer:** Visit /deal/[dealId] while pending_owner → Withdraw banner visible, title plain text, Save/Add property/Submit Offer hidden, calculator view-only
- [ ] **After decision:** Thread status changes → locked=false → deal page returns to normal edit mode
- [ ] **Non-pending_owner thread:** /threads redirect to /deal still works as before
