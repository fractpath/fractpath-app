Excellent. This document directly addresses your concern about the app feeling basic.

Sprint 10 must result in a real, rendered financial deal detail view powered by canonical compute.

📄 DOCUMENT 5 OF N
App Integration & Deal Detail Rendering Specification
✅ Repository

fractpath-app

Reason:

Deal detail view lives in the app.

Snapshot persistence lives in the app.

Canonical compute must power the UI here.

✅ File Path
docs/financial-core/sprint-10-app-integration-spec.md


Create docs/financial-core/ if it does not exist.

✅ Paste the Following Entire Document Into That File
# FractPath — Sprint 10 App Integration Specification

Version: 10.0.0  
Applies To: fractpath-app  
Depends On:
- sprint-10-compute-spec.md
- sprint-10-snapshot-spec.md

---

# Purpose

This document defines how the app must integrate the canonical compute engine and render deal detail views.

Sprint 10 is not complete unless:

- The deal detail page renders canonical computed outputs.
- No financial math exists inside the app.
- Snapshots are immutable.
- Draft edits recompute deterministically.

---

# Core Principle

The app must import and use:



import { computeDeal } from "@fractpath/compute"


The app must never reconstruct financial logic locally.

---

# Draft Deal Behavior

While deal is in draft state:

- User edits inputs
- App recomputes via computeDeal()
- UI renders live computed results
- No snapshot persisted yet

All displayed numbers must originate from computeDeal().

---

# Approval Behavior

Upon approval:

1. App computes:


const results = computeDeal(inputs, assumptions)


2. App validates deterministic recompute invariant.

3. App persists immutable snapshot:



{
compute_version,
inputs,
assumptions,
outputs,
computed_at
}


4. Deal transitions to approved state.

---

# Approved Deal Behavior

For approved deals:

- Deal detail must render from snapshot.outputs
- No silent recompute allowed
- No mutation allowed

If compute logic changes in future versions:

- Old deals remain tied to old compute_version
- No retroactive recalculation

---

# Deal Detail View Requirements

The deal detail page must display:

## Investor View

- Invested Capital (IBA)
- Settlement Amount
- Investor Profit
- Investor Multiple
- Investor IRR (Annualized)
- Floor Amount
- Ceiling Amount
- Downside Mode

## Homeowner View

- Projected FMV
- Settlement Payout
- Remaining Equity Value
- Appreciation Assumption
- Exit Year

Values must map directly to DealResults.

No derived math in UI components.

---

# Rounding Consistency

All displayed monetary values must use:

- 2 decimal places
- Same rounding policy as compute module

IRR must display:

- 2 decimal places in UI
- Derived from canonical rounded annual IRR

---

# Fork Behavior

When user forks a deal:

1. Copy inputs
2. Copy assumptions
3. DO NOT copy outputs
4. Recompute using computeDeal()
5. Persist new snapshot upon approval

---

# Deterministic Recompute Validation

Before snapshot persistence:

App must verify:



compute(inputs, assumptions) === outputs


Within rounding tolerance defined in compute spec.

If mismatch:

- Throw error
- Block approval

---

# No Duplicate Math Rule

The following are prohibited in fractpath-app:

- Local IRR calculation
- Manual floor logic
- Manual ceiling logic
- Gain calculation
- Settlement reconstruction

If financial math exists in app repo, it must be removed.

---

# Definition of Done

App integration is complete when:

- Deal detail page renders canonical computed results
- Draft edits recompute live
- Approved deals render from snapshot
- No duplicated financial math exists in app
- Fork behavior enforces recompute
- Deterministic recompute invariant enforced

---

# Strategic Outcome

After Sprint 10:

The deal detail page becomes the first true institutional-grade financial view inside FractPath.

Even if styling remains simple, the underlying engine will be correct, deterministic, and versioned.

Design refinement can follow safely.

---

# End of Specification
