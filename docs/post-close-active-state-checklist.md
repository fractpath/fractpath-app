# Post-close active state checklist

## Lifecycle tail (simplified)

| Stage | Admin label | Customer label | Who sees |
|---|---|---|---|
| `agreement_signed` | Agreement signed | Agreement signed | Compact hero + milestone tracker |
| `deal_closed` | Deal closed | Deal closed | Compact hero + milestone tracker |
| `servicing_active` | Deal active | — (tracker suppressed) | **Compact "Deal active" card** |

`servicing_issue` is removed entirely from the canonical lifecycle.
The tracked workflow ends at `servicing_active` ("Deal active").

---

## Scenario 1 — Agreement out for signatures

**Setup:** `packet.status = "sent"`, `thread.status = "accepted"`, no `servicing_status`.
**Canonical stage:** `agreement_out_for_signatures`

**Expected UI:**
- [ ] Canonical progress tracker visible (DealMilestoneTracker renders)
- [ ] "Agreement out for signatures" shown as current milestone
- [ ] Compact "Deal active" card NOT visible
- [ ] No servicing issue messaging anywhere on page
- [ ] Signature & Documents section visible (packet is live)

---

## Scenario 2 — Agreement signed / deal closed

**Setup A:** `packet.status = "completed"`, `thread.status = "accepted"` → stage `agreement_signed`
**Setup B:** `thread.status = "closed"`, `servicing_status = null` → stage `deal_closed`

**Expected UI (both setups):**
- [ ] Canonical progress tracker visible
- [ ] Current milestone is "Agreement signed" or "Deal closed" respectively
- [ ] "Deal active" milestone shown as upcoming in the tracker
- [ ] Compact "Deal active" card NOT visible
- [ ] No servicing issue messaging anywhere on page
- [ ] Signature & Documents section visible
- [ ] All four edit controls are locked (terminal lock applied via `isTerminalWorkflowStage`)

---

## Scenario 3 — Active deal (`servicing_active`)

**Setup:** `servicing_status = "active"`, `thread.status = "closed"`.
**Canonical stage:** `servicing_active`

**Expected UI:**
- [ ] Compact "Deal active" card visible, showing:
  - Green dot + "Deal active" heading
  - "Your agreement is complete and active. Signed documents are available for reference in the section above."
- [ ] Canonical progress tracker (DealMilestoneTracker) NOT rendered (customerLabel is null for `servicing_active`)
- [ ] No servicing issue messaging anywhere on page (removed from lifecycle)
- [ ] Signature & Documents section visible above the active card
- [ ] Activity section visible
- [ ] All four edit controls are locked (terminal lock)

**Also verify — hero status card:**
- [ ] `resolveCanonicalLifecycle` returns `customerHeroLabel = null` for `servicing_active` (no hero card rendered)
- [ ] The compact card (inline JSX in page.tsx) is the sole active-state indicator

---

## Scenario 4 — Admin deal page

**Setup:** Any deal in any post-close state.

**Expected UI:**
- [ ] Section header reads "Deal close" (not "Deal close & servicing")
- [ ] Section badge shows "Deal active" (emerald) when `servicing_status = "active"`
- [ ] Section badge shows "Closed" (dark) when `thread.status = "closed"` and no active status
- [ ] "Set: Servicing issue" button is gone
- [ ] "Resolve issue — set active" button is gone
- [ ] "Reset servicing" button is gone
- [ ] Only two action rows remain: "Deal close" and "Deal active"
- [ ] Stage guide text references only close + activate (no servicing issue entry)
- [ ] [SIMULATION] label is gone from section header
- [ ] TODO(servicing-partner) comment is gone from source

---

## Scenario 5 — TypeScript integrity

- [x] `pnpm -s tsc --noEmit` passes with zero errors
- [x] `servicing_issue` removed from `WorkflowStage` type
- [x] `servicing_issue` removed from `STAGE_META`
- [x] `servicing_issue` removed from `deriveWorkflowStage`
- [x] `servicing_issue` removed from `CUSTOMER_MILESTONES`
- [x] `servicing_issue` removed from `STAGE_ADMIN_GUIDANCE`
- [x] `servicing_issue` removed from `CUSTOMER_HERO_DESCRIPTIONS`
- [x] `servicing_issue` removed from `TERMINAL_WORKFLOW_STAGES`
- [x] `servicing_active.customerLabel` set to `null` (tracker suppressed)
- [x] `servicing_active.notificationLabel` updated to "Deal active"
- [x] API route `ALLOWED_ACTIONS` no longer contains "issue"
- [x] `AdminDealServicingPanel` `ServicingStatus` type is `"active" | null` only

---

## Pre-change copy audit

| Old string | New string | Location |
|---|---|---|
| "Payments active" | "Deal active" | milestones.ts, API route, AdminDealServicingPanel |
| "Servicing active" | "Deal active" | AdminDealServicingPanel badge + button |
| "Servicing issue" | removed | AdminDealServicingPanel, admin deal page, API route |
| "Deal close & servicing" | "Deal close" | Admin deal page section header |
| "Set servicing to active when payments commence" | "Mark the deal active once the agreement is confirmed in place" | milestones.ts admin guidance |
| "Monitor servicing — no immediate action required" | "Deal is active — no further action required" | milestones.ts admin guidance |
