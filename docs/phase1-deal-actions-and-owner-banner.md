# Phase 1: Deal Page Action Bar + Modal-only Writes + Owner Banner

## Layout Rule: Modal-only Writes

All persistence on the deal page now happens inside modals, never inline:

- **Edit deal name**: Edit button next to H1 title opens EditDealNameModal. Saves via PATCH /api/deals/[dealId]/header.
- **Add property**: "Add property" button opens PropertyForm modal (unchanged from prior behavior).
- **Submit offer**: Submit button in DealActionsBar opens SubmitOfferModal (unchanged behavior).
- **Share**: Share button in DealActionsBar opens ShareDealModal. Generates link via POST /api/deals/[dealId]/share.
- **Archive**: Archive button in DealActionsBar opens ArchiveDealModal (UI-only in Phase 1; button disabled with "coming soon" text).

The inline Save button has been removed from the deal page. Title changes auto-save via the EditDealNameModal. Property changes are persisted on resolve.

## DealActionsBar

Positioned top-right of the deal page header area, separate from DealHeader.

| Button | Locked state (pending_owner) | Read-only (viewer) |
|--------|------------------------------|---------------------|
| Submit | Disabled | Disabled |
| Share | Disabled | Disabled |
| Archive | Enabled | Enabled |

Submit and Share are disabled when locked or readOnly. Archive remains available regardless of lock state since it does not create data or alter deal terms.

## Deal Title Presentation

- Title is rendered as an H1 element (read-only text display).
- "Edit" button appears next to the title when the user is an owner and the deal is not locked.
- Clicking Edit opens EditDealNameModal with a single text input + Save/Cancel.

## Owner Decision Banner

Changed from emerald/green to amber/yellow to match the dashboard "Awaiting approval" badge:

| Element | Before | After |
|---------|--------|-------|
| Background | bg-emerald-50 | bg-amber-50 |
| Border | border-emerald-300 | border-amber-300 |
| Text | text-emerald-900 | text-amber-900 |
| Dot ping | bg-emerald-400 | bg-amber-400 |
| Dot solid | bg-emerald-500 | bg-amber-500 |
| Button border | border-emerald-400 | border-amber-400 |
| Button text | text-emerald-800 | text-amber-800 |
| Button hover | hover:bg-emerald-100 | hover:bg-amber-100 |
| Button label | "Review & decide" | "Review" |

Rationale: Green implied success or approval. Amber/yellow conveys "action needed" without suggesting a decision has been made.

## Deferred to Later Phases

- **Email sharing** (Phase 4): ShareDealModal has an email input but no send functionality. Helper text says "Email sharing is coming soon."
- **Archive backend** (Phase 3): ArchiveDealModal renders but the Archive button is disabled with "coming soon" label.

## Files Changed

| File | Change |
|------|--------|
| `src/components/deal/DealActionsBar.tsx` | Created — Submit/Share/Archive buttons + modals |
| `src/components/deal/EditDealNameModal.tsx` | Created — modal for editing deal name |
| `src/components/deal/ShareDealModal.tsx` | Created — modal for sharing deal (link generation) |
| `src/components/deal/ArchiveDealModal.tsx` | Created — UI-only archive confirm modal |
| `src/components/deal/OwnerDecisionBanner.tsx` | Updated — emerald → amber, "Review & decide" → "Review" |
| `src/components/deals/DealHeader.tsx` | Updated — title as H1 + Edit button, removed Save/Submit buttons |
| `src/app/deal/[dealId]/page.tsx` | Updated — added DealActionsBar at top-right |

## Manual Test Checklist

### 1. Deal page (draft)
- Title shows as H1 with Edit button
- Clicking Edit opens modal with current title, Save/Cancel buttons
- Saving updates displayed title
- Actions top-right: Submit, Share, Archive
- Submit opens existing submit-offer overlay
- Share modal generates link and allows copy
- Archive modal shows disabled button with "coming soon"
- No inline Save button anywhere

### 2. Deal page (pending_owner locked)
- No Edit button next to title
- No Add property button
- Submit and Share buttons disabled
- Archive button still accessible
- Owner banner appears in amber/yellow with "Review" button
- Clicking Review opens the owner decision modal

### 3. Buyer view (pending_owner)
- Withdraw banner still visible
- Owner banner not shown
- Submit and Share disabled
- Archive accessible
