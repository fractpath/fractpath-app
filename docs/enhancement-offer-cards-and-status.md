# Enhancement: Offer Cards + Status Chip on Dashboard

## Status Derivation Rules

Deal cards now display a thread-aware status chip instead of always showing the DB `deals.status` value:

| Condition | Chip Label | Tone | Who sees it |
|-----------|-----------|------|-------------|
| `deal_threads.status = pending_owner` AND user is buyer | Offer submitted | blue | Buyer |
| `deal_threads.status = pending_owner` AND user is property owner | Awaiting approval | amber | Owner |
| No active pending_owner thread | Falls through to `deals.status` (Draft, Active, etc.) | per existing mapping | Everyone |

**Why `deals.status` remains DRAFT:** The DB status reflects the deal lifecycle stage (draft → active → closed). An offer being submitted doesn't change the deal's lifecycle — it creates a `deal_threads` row with `status=pending_owner`. The display chip overrides the label for UX clarity while preserving the canonical DB value.

## New Homeowner Dashboard Section

A new "Offers waiting approval" section appears on the dashboard for property owners who have pending offers:

- Rendered as a **separate section** above "My Deals" and below "Next steps"
- Uses the **same `DealCard` component** with hover effects, KPIs, and property details
- Each card links to `/deal/<dealId>#offer` to surface the owner decision modal
- Badge count shows the number of pending offers
- Section is hidden when there are no pending_owner offers
- Deal/snapshot data for offers is fetched via service client (bypasses RLS since the owner may not have a deal_access_grant on buyer-created deals)

## Files Changed

| File | Change |
|------|--------|
| `src/app/dashboard/page.tsx` | Added service client import; built `buyerPendingDealIds` and `pendingOwnerDealIds` sets; fetched deal+snapshot data for pending deals via service client; modified `buildCardVm` to accept optional status override; built `pendingApprovalCards`; replaced old `<ul>` thread links with DealCard-based "Offers waiting approval" section; buyer's ownerCards now show "Offer submitted" chip |

## Manual Test Checklist

### 1. Buyer submits offer — card chip updates
- Log in as buyer
- Submit an offer on a deal
- Navigate to /dashboard
- **Expected:** The deal card in "My Deals" shows **"Offer submitted"** chip (blue) instead of "Draft"

### 2. Homeowner sees "Offers waiting approval"
- Log in as the property owner for a deal with a pending_owner thread
- Navigate to /dashboard
- **Expected:** New section "Offers waiting approval" appears with amber badge count
- **Expected:** DealCard(s) shown with "Awaiting approval" amber chip, full deal details (title, property address, KPIs)

### 3. Clicking offer card opens deal with decision modal
- In the "Offers waiting approval" section, click a deal card
- **Expected:** Opens `/deal/<dealId>#offer`
- **Expected:** OwnerDecisionBanner + modal are available for accept/reject

### 4. After accept/reject, card disappears
- Owner accepts or rejects the offer
- Navigate back to /dashboard
- **Expected:** The deal is no longer in "Offers waiting approval" (thread status changed from pending_owner)
- **Expected:** Buyer's card chip updates accordingly (no longer "Offer submitted" if thread is resolved)

### 5. Multiple pending offers
- Have multiple deals with pending_owner threads for the same owner
- **Expected:** All appear as separate cards in "Offers waiting approval" with correct badge count

### 6. Buyer dashboard unaffected
- Log in as buyer
- **Expected:** "Offers waiting approval" section does NOT appear (buyer is not the property owner)
- **Expected:** "My Deals" cards with submitted offers show "Offer submitted" chip
