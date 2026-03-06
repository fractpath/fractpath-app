# Phase 2: Deal Page Layout Hardening

## Final Layout

### Top Row (right-aligned)
Page-level action buttons:
- **Submit offer** — primary black button (`bg-foreground text-background`)
- **Share** — secondary outline button (`border bg-white`)
- **Archive** — secondary outline button (`border bg-white`)

### Title Section
Header row:
- Left: H1 deal title (read-only text, "Untitled deal" fallback)
- Right: **Edit Name** secondary outline button (hidden when locked/readOnly)

### Property Section (below title, separated by `border-t`)
Header row:
- Left: "Property" label
- Right: **Edit Property** secondary outline button (hidden when locked/readOnly)

Body:
- If no property: "No property assigned yet. Add a property to enable making an offer."
- If property exists: badge/pill with display address + status pill (Unclaimed / Claimed — not verified / Verified)

### Calculator Section (below property, separated by `border-t`)
Header row:
- Left: "Scenario Details" label
- Right: "View only" indicator when locked/readOnly (no indicator when editable)

Body:
- Existing DealWidgetShell calculator
- When locked: `canEdit=false`, no edit affordances

### Banners (between DealHeader and Calculator)
- ActiveThreadBanner (buyer, pending_owner)
- OwnerDecisionSection (owner, pending_owner)

## Label Changes

| Component | Before | After |
|-----------|--------|-------|
| DealActionsBar submit | "Submit" | "Submit offer" |
| DealActionsBar share | border only | `border bg-white` (secondary) |
| DealActionsBar archive | border only | `border bg-white` (secondary) |
| DealHeader edit button | "Edit" | "Edit Name" |
| DealHeader property button | "+ Add property" | "Edit Property" |
| DealHeader wrapper | `<section className="mb-6 rounded-md border p-4">` | `<div className="space-y-6">` (no border) |
| DealDetailWidgetPanel wrapper | `<section className="mt-6">` | `<div className="border-t pt-6">` |
| DealDetailWidgetPanel locked label | "Owner only" | "View only" |

## Locked State Behavior (pending_owner)

| Element | Visible | Enabled |
|---------|---------|---------|
| Submit offer | Yes | No (disabled) |
| Share | Yes | No (disabled) |
| Archive | Yes | Yes |
| Edit Name | No (hidden) | — |
| Edit Property | No (hidden) | — |
| Calculator edit | No | — |

## Files Changed

| File | Change |
|------|--------|
| `src/components/deal/DealActionsBar.tsx` | Label → "Submit offer", secondary styling on Share/Archive |
| `src/components/deals/DealHeader.tsx` | Removed rounded border wrapper, title row with "Edit Name", separate Property section with "Edit Property" |
| `src/components/deal/DealDetailWidgetPanel.tsx` | Added `border-t pt-6` separator, changed locked label to "View only" |
| `src/app/deal/[dealId]/page.tsx` | DealActionsBar on own row (right-aligned), DealHeader below as separate block |

## Manual Test Checklist

### 1. Draft deal (owner, no thread)
- Actions row right-aligned at top: Submit offer (black), Share (outline), Archive (outline)
- Title row: H1 left, "Edit Name" right
- Property section: "Property" label left, "Edit Property" right
- Empty state text when no property assigned
- Property pill when property assigned with status badge
- Calculator section: "Scenario Details" label, editable
- No rounded border containers

### 2. Locked deal (pending_owner, owner view)
- Submit offer disabled
- Share disabled
- Archive enabled
- No "Edit Name" button
- No "Edit Property" button
- Calculator shows "View only" label, not editable
- Owner decision banner visible (amber)

### 3. Viewer / read-only
- Submit offer disabled
- Share disabled
- No "Edit Name" button
- No "Edit Property" button
- Calculator shows "View only" label

### 4. Buyer with pending thread
- ActiveThreadBanner visible
- Submit offer disabled
- Calculator not editable
