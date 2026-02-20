Excellent. This is the most visible Sprint 10 outcome — the deal detail view powered by canonical math.

📄 DOCUMENT 10 OF N
AGENT-005 — App Integration + Deal Detail Rendering
✅ Repository

fractpath-app

Reason:

Deal detail page lives here.

Snapshot persistence lives here.

Canonical compute must power the UI here.

✅ File Path
docs/tickets/SPRINT-10-AGENT-005-app-integration.md


Create docs/tickets/ if needed.

✅ Paste the Following Entire Document Into That File
# SPRINT 10 — AGENT-005
App Canonical Compute Integration + Deal Detail Rendering

Repository: fractpath-app  
Depends On:
- @fractpath/compute
- SPRINT-10-AGENT-003-snapshot-schema.md
- docs/financial-core/sprint-10-app-integration-spec.md

Status: Ready for Implementation

---

# Objective

Integrate canonical computeDeal() into the app.

Ensure deal detail page renders financial results derived solely from the compute module.

Sprint 10 is not complete unless the deal detail page renders canonical financial outputs.

---

# Implementation Steps

## 1) Install Compute Module

Add dependency:



@fractpath/compute


Ensure proper workspace resolution or package import.

---

## 2) Draft Behavior

For draft deals:

- On input change:


const results = computeDeal(inputs, assumptions)

- Render results live in UI.

Do not persist snapshot until approval.

---

## 3) Approval Flow

On approval:

1. Compute:


const results = computeDeal(inputs, assumptions)


2. Validate deterministic recompute invariant.

3. Persist snapshot per AGENT-003.

4. Transition deal state to approved.

---

## 4) Approved Deal Rendering

When viewing approved deal:

- Load snapshot.outputs
- Render directly
- Do not recompute silently

---

# Deal Detail Page Requirements

The deal detail view must display:

## Investor Section

- Invested Capital (IBA)
- Settlement Amount
- Investor Profit
- Investor Multiple
- Investor IRR (Annualized)
- Floor Amount
- Ceiling Amount
- Downside Mode

## Homeowner Section

- Projected FMV
- Settlement Payout
- Remaining Equity Value
- Appreciation Assumption
- Exit Year

All values must originate from DealResults.

---

# No Duplicate Math Rule

Prohibited in fractpath-app:

- IRR solver
- Gain calculation
- Floor logic
- Ceiling logic
- Settlement math

All financial values must come from computeDeal() or snapshot.outputs.

---

# Fork Behavior

Forking must:

- Copy inputs + assumptions
- NOT copy outputs
- Recompute before approval

---

# Rounding

All monetary values:

- 2 decimal places
- Use compute module rounding utilities

IRR display:

- 2 decimal places in UI
- Derived from canonical annual IRR

---

# Definition of Done

AGENT-005 is complete when:

- Draft edits recompute live
- Approved deals render from snapshot
- No financial math exists in app
- Fork behavior enforces recompute
- Deterministic recompute invariant enforced
- Deal detail page displays full canonical financial outputs

---

# Strategic Outcome

After AGENT-005:

FractPath has a working institutional-grade deal detail view.

Even if styling is simple, the financial engine is correct and authoritative.

---

# End of Ticket
