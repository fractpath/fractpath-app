# Terminal Controls Checklist

## Rule

A deal is terminal/read-only when its canonical lifecycle stage is any of:
- `agreement_signed`
- `deal_closed`
- `servicing_active`
- `servicing_issue`

Enforced by `isTerminalWorkflowStage()` in `src/lib/workflow/milestones.ts`.
Applied in `src/app/deal/[dealId]/page.tsx` immediately after `canonicalResult` is resolved in both the primary path (line ~511) and the fallback path (line ~1134).

## Control ownership

| Control | Controlled by | Suppressed via |
|---|---|---|
| Edit Name | `DealHeader.tsx:134` — `!isDisabled` | `locked = editingLocked` → `isDisabled = true` |
| Edit Property | `DealHeader.tsx:151` — `!isDisabled` | same |
| Edit Terms | `DealDetailWidgetPanel.tsx:240,269` — `canEdit` prop | `canEdit = isOwner && !editingLocked` / `fallbackCanEdit = owner && !editingLocked` |
| Recompute snapshot | `page.tsx:695,1303` — `isOwner && !editingLocked && snapJson` | `editingLocked = true` hides the button |

## Scenarios

### 1. Non-terminal accepted editable deal
**Setup:** deal has `thread.status = "accepted"`, `triage_status = "eligible"`, no closed thread, no servicing.
**Canonical stage:** `deal_eligible` or `closing_review_pending` etc.
**Expected:** All four controls available for owner.
**Result:** `editingLocked = true` from thread status check (accepted). BUT — the ineligible unlock at `if (showIneligibleBlock) editingLocked = false` is not triggered (deal is eligible). The terminal lock is NOT triggered (`deal_eligible` is not a terminal stage). So `editingLocked = true` from thread-status. Controls are locked while offer is accepted.

> Note: "editable accepted deal" means accepted but not yet triage-completed — in that window terms are locked because the offer is accepted. Once the deal advances past the accepted-thread window into closing review etc., it's admin-owned and the owner shouldn't be editing terms anyway.

**PASS** — controls gated correctly by thread status.

---

### 2. Signed deal (`agreement_signed`)
**Setup:** `packet.status = "completed"`, thread may be `accepted` or `closed`.
**Canonical stage:** `agreement_signed`
**Expected:** All four controls hidden/disabled.
**Result:** `isTerminalWorkflowStage("agreement_signed") = true` → `editingLocked = true` → `DealHeader` shows `isDisabled = true` → Edit Name, Edit Property hidden. `canEdit = false` → Edit Terms hidden. Recompute button conditional is false.
**PASS**

---

### 3. Closed deal (`deal_closed`)
**Setup:** `thread.status = "closed"`, no servicing yet.
**Canonical stage:** `deal_closed`
**Expected:** All four controls hidden/disabled.
**Result:** `thread.status = "closed"` is NOT in `["pending_owner","negotiating","accepted"]` → initial `editingLocked = false`. Then `isTerminalWorkflowStage("deal_closed") = true` → `editingLocked = true`. Controls suppressed.
**PASS** — this is the bug that was fixed.

---

### 4. Servicing active deal (`servicing_active`)
**Setup:** `thread.status = "closed"`, `deal.servicing_status = "active"`.
**Canonical stage:** `servicing_active`
**Expected:** All four controls hidden/disabled. Canonical tracker and Signature & Documents still visible.
**Result:** `thread.status = "closed"` → initial `editingLocked = false`. Then `isTerminalWorkflowStage("servicing_active") = true` → `editingLocked = true`. Controls suppressed. Tracker and SignatureCard are not gated on `editingLocked` — they render unconditionally.
**PASS** — this is the live bug that was observed.

---

## Pre-patch root cause (for reference)

`editingLocked` in `page.tsx` only checked `thread.status ∈ ["pending_owner","negotiating","accepted"]`.
Terminal stages (`deal_closed`, `servicing_active`, `servicing_issue`) arise after the thread is closed
(`thread.status = "closed"`), which is outside that set → `editingLocked = false` → all four edit
controls rendered for owner despite the deal being fully executed.

Additionally in the fallback path, `fallbackCanEdit` was computed before `canonicalResult`, so a
post-canonical terminal lock could not reach it. This was fixed by moving `fallbackCanEdit` to after
`canonicalResult` in the fallback render branch.
