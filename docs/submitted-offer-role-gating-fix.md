# Submitted-Offer Role-Gating Fix

Date: 2026-03-05

## Root Cause

Both the buyer and homeowner had `role=OWNER` grants in `deal_access_grants`. The deal page computed `isOwner = grant.role === "OWNER" || deal.owner_user_id === user.id`, treating both users identically. There was no buyer-vs-property-owner discrimination, causing:

1. Buyer could still edit title/property/save after offer submission
2. Homeowner saw the Withdraw Offer banner (buyer-only control)
3. Homeowner was never redirected to the thread decision surface (Accept/Reject)

## Implemented Gating Rules

### Deal page (`src/app/deal/[dealId]/page.tsx`)

- Thread query now selects `buyer_user_id` in addition to `id, status`
- Three new derivations:
  - `isPropertyOwner = user.id === deal.owner_user_id`
  - `isBuyer = !!activeThread && activeThread.buyer_user_id === user.id`
  - `isPendingOwner = activeThread?.status === "pending_owner"`
- Property owner redirect: when `isPendingOwner && isPropertyOwner && activeThread`, redirects to `/threads/${activeThread.id}` for Accept/Reject decision surface
- Buyer lock: `locked = isPendingOwner && isBuyer` passed as prop to DealHeader
- ActiveThreadBanner renders only when `isPendingOwner && isBuyer && activeThread`

### ActiveThreadBanner (`src/components/deal/ActiveThreadBanner.tsx`)

- New required prop: `isBuyer: boolean`
- Guard: returns null if `!isBuyer` (defensive, in addition to page-level gating)

### DealHeader (`src/components/deals/DealHeader.tsx`)

- New optional prop: `locked?: boolean` (default false)
- `isDisabled = readOnly || locked` replaces bare `readOnly` for:
  - Title input
  - Save button
  - "+ Add property" button
  - Submit Offer (already gated by `canMakeOffer` which uses `isDisabled`)

## Files Changed

1. `src/app/deal/[dealId]/page.tsx`
2. `src/components/deal/ActiveThreadBanner.tsx`
3. `src/components/deals/DealHeader.tsx`
4. `docs/submitted-offer-role-gating-fix.md` (this file)

## Truth Table

| User          | isPendingOwner | Behavior |
|---------------|----------------|----------|
| Buyer         | true           | Withdraw banner shown, title/save/add-property/submit-offer disabled (locked=true) |
| Buyer         | false          | Normal edit access (locked=false), no banner |
| Property owner| true           | Redirected to /threads/[threadId] for Accept/Reject |
| Property owner| false          | Normal owner view |
| Other/viewer  | any            | readOnly=true, no banner |

## Verification

### Build
```
$ npm run build → Compiled successfully, all routes, no errors.
```

### Grep proof
```
$ rg -n "buyer_user_id|isPropertyOwner|isBuyer|isPendingOwner" src/app/deal/[dealId]/page.tsx
94:  .select("id, status, buyer_user_id")
102: const isPropertyOwner = user.id === (deal as any).owner_user_id
103: const isBuyer = !!activeThread && activeThread.buyer_user_id === user.id
104: const isPendingOwner = activeThread?.status === "pending_owner"
106: if (isPendingOwner && isPropertyOwner && activeThread)
110: const locked = !!(isPendingOwner && isBuyer)
134: {isPendingOwner && isBuyer && activeThread && (
138:   isBuyer={true}

$ rg -n "locked|disabled|isDisabled|isBuyer" src/components/deals/DealHeader.tsx src/components/deal/ActiveThreadBanner.tsx
DealHeader.tsx:25:  locked?: boolean;
DealHeader.tsx:46:  locked = false,
DealHeader.tsx:176: const isDisabled = readOnly || locked;
DealHeader.tsx:206: disabled={isDisabled}
DealHeader.tsx:214: disabled={isDisabled}
DealHeader.tsx:224: disabled={isDisabled}
DealHeader.tsx:233: disabled={!canMakeOffer}
ActiveThreadBanner.tsx:9:  isBuyer: boolean;
ActiveThreadBanner.tsx:12: ({ threadId, threadStatus, isBuyer })
ActiveThreadBanner.tsx:38: if (threadStatus !== "pending_owner" || !isBuyer) return null;
```

## Manual Scenario Test Plan

### S1: Buyer submits offer → sees Withdraw banner, controls locked
- Login as buyer (cee2ecc6)
- Navigate to /deal/95d3f0b8-1d76-4769-8e86-32dc0926c485
- Expected: Withdraw Offer banner visible, title input disabled, Save disabled, Add property disabled, Submit Offer disabled

### S2: Homeowner opens "Offers waiting for your decision" → lands on thread page
- Login as homeowner (0faf6e11)
- Dashboard shows "Offers waiting for your decision" linking to /threads/c5e2b18f-...
- Expected: Thread page renders with Accept Offer / Reject Offer buttons

### S3: Homeowner navigates directly to /deal/[dealId] → redirected to thread
- Login as homeowner (0faf6e11)
- Navigate to /deal/95d3f0b8-1d76-4769-8e86-32dc0926c485
- Expected: Redirect to /threads/c5e2b18f-2ed9-4c77-81a8-b7bdce27e983

### S4: After owner accepts/rejects → banner disappears for buyer
- After owner decision, thread status changes from pending_owner
- Buyer revisits /deal/95d3f0b8-...
- Expected: No activeThread with pending_owner status → no banner, locked=false, normal edit access restored
