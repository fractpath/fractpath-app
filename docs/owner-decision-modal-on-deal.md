# Owner Decision Modal on Deal Page

Date: 2026-03-05

## Overview

Property owners can now Accept or Reject an offer directly from the deal page via an in-context modal, without navigating away. The /threads/[threadId] page remains as a fallback.

## Behavior by Persona

### Property owner (deal.owner_user_id) — pending_owner state
- Deal page is fully read-only (title as plain text, Save/Add property/Submit Offer hidden, calculator view-only)
- Emerald banner: "Offer awaiting your decision" with animated badge dot
- Clicking "Review & decide" opens a modal containing:
  - Microcopy explaining what acceptance means and next steps (contract, DocuSign, lender/title)
  - Accept Offer and Reject Offer buttons (from ThreadActionPanel)
  - Verification gate banner if property not verified
- After Accept/Reject, ThreadActionPanel redirects to /dashboard (existing behavior)

### Buyer (deal_threads.buyer_user_id) — pending_owner state
- Deal page is fully read-only (same as owner)
- Amber Withdraw Offer banner shown
- No owner decision controls visible
- Clicking "Withdraw Offer" calls POST /api/threads/{threadId}/withdraw

### Other users
- No access (RLS enforced) or read-only view if shared

### Non-pending_owner state
- Normal deal page behavior (editable for owners, no banners)

## Data Requirements

For the owner decision modal to function, the deal page fetches:
- `activeThread.id` and `activeThread.status` — from `deal_threads` query (already fetched)
- `activeThread.buyer_user_id` — added in prior sprint for buyer/owner discrimination
- `proposalId` and `proposalStatus` — fetched from `deal_proposals` for the active thread (new query, only when `showOwnerDecision=true`)

ThreadActionPanel needs: `threadId`, `threadStatus`, `isOwner`, `proposalId`, `proposalStatus`

## Files Created/Modified

| File | Action |
|------|--------|
| `src/components/deal/OwnerDecisionBanner.tsx` | Created — banner with "Offer awaiting your decision" + "Review & decide" button |
| `src/components/deal/OwnerDecisionModal.tsx` | Created — modal wrapping ThreadActionPanel with microcopy |
| `src/components/deal/OwnerDecisionSection.tsx` | Created — client wrapper managing banner + modal state |
| `src/app/deal/[dealId]/page.tsx` | Modified — fetch proposal, replace inline link with OwnerDecisionSection |
| `docs/owner-decision-modal-on-deal.md` | Created (this file) |

## Architecture Notes

- `OwnerDecisionModal` uses the existing `Modal` primitive from `src/components/ui/Modal.tsx`
- `ThreadActionPanel` is embedded directly inside the modal — same component used by /threads/[threadId]
- Backend route `POST /api/proposals/{proposalId}/owner-decision` is unchanged
- After successful decision, ThreadActionPanel navigates to /dashboard via `window.location.href`
- /threads/[threadId] remains functional as a fallback

## Verification

```
$ npm run build → Compiled successfully, all routes, no errors.
```

## Manual Test Steps

### S1: Homeowner opens deal in pending_owner
1. Login as property owner (deal.owner_user_id)
2. Navigate to /deal/[dealId]
3. Verify: deal is read-only (title as text, no Save/Add property buttons)
4. Verify: "Offer awaiting your decision" banner with green dot
5. Click "Review & decide"
6. Verify: modal opens with microcopy + Accept Offer / Reject Offer buttons
7. Click Accept (or Reject)
8. Verify: POST /api/proposals/{id}/owner-decision fires, redirects to /dashboard

### S2: Buyer opens same deal in pending_owner
1. Login as buyer (deal_threads.buyer_user_id)
2. Navigate to /deal/[dealId]
3. Verify: deal is read-only
4. Verify: amber Withdraw Offer banner shown
5. Verify: NO owner decision banner or modal
6. Click Withdraw → POST /api/threads/{id}/withdraw fires

### S3: /threads fallback
1. Login as property owner
2. Navigate directly to /threads/[threadId]
3. Verify: page loads with Accept/Reject controls (no redirect away during pending_owner)
