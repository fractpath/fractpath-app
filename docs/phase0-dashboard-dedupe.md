# Phase 0: Dashboard Dedupe — Pending-Owner Offers

## Problem

A deal with a `pending_owner` thread was appearing in both "Offers waiting approval" AND "My Deals" on the homeowner dashboard because the owner had a deal_access_grant (role=OWNER) for that deal.

## Fix

Created `pendingOwnerDealIdSet` from `pendingOwnerDealIds` and added a `.filter((g) => !pendingOwnerDealIdSet.has(g.deal_id))` to the ownerCards pipeline. This ensures deals shown in "Offers waiting approval" are excluded from "My Deals".

The two sections are now mutually exclusive:
- **Offers waiting approval** — deals with `deal_threads.status = pending_owner` where user is the property owner
- **My Deals** — all other deals where user has an OWNER grant

## Why

Dashboard sections must be mutually exclusive groupings. A deal awaiting owner decision has a dedicated action surface ("Offers waiting approval" linking to `/deal/<dealId>#offer`). Showing the same deal under "My Deals" with a different status chip creates confusion and duplicate entries.

## Manual Verification

### Homeowner with pending_owner offers
1. Log in as property owner with a pending_owner thread
2. Navigate to /dashboard
3. Confirm the deal appears in "Offers waiting approval" with "Awaiting approval" chip
4. Confirm the same deal does NOT appear in "My Deals"

### Buyer dashboard unaffected
1. Log in as buyer who submitted an offer
2. Navigate to /dashboard
3. Confirm the deal appears in "My Deals" with "Offer submitted" chip (unchanged)
4. Confirm "Offers waiting approval" section does not appear (buyer is not property owner)

### No pending offers
1. Log in as user with no pending_owner threads
2. Navigate to /dashboard
3. Confirm "Offers waiting approval" section is hidden
4. Confirm all deals appear normally in "My Deals"
