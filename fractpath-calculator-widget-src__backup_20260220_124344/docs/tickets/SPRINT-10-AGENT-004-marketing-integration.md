# SPRINT 10 — AGENT-004
Marketing Canonical Compute Integration

Repository: fractpath-marketing  
Depends On:
- @fractpath/compute (canonical module)
- docs/financial-core/sprint-10-marketing-parity-spec.md
- docs/financial-core/sprint-10-compute-spec.md

Status: Ready for Implementation

---

# Objective

Remove all local financial logic from marketing.

Replace with canonical computeDeal().

Marketing must become a rendering layer only.

---

# Implementation Steps

## 1) Install Canonical Compute Module

Add dependency:



@fractpath/compute


Ensure proper workspace or GitHub package import.

---

## 2) Replace Calculator Logic

Locate:

- Any gain calculations
- Floor/ceiling formulas
- IRR solvers
- Settlement math
- Equity accumulation logic

Remove them.

Replace with:



const results = computeDeal(terms, assumptions)


---

## 3) Lite Rendering

Marketing may display a simplified view:

Example values to render:

- results.isa_settlement
- results.investor_profit
- results.investor_multiple
- results.investor_irr_annual

These must be direct references.

No derived math.

---

## 4) Remove Duplicate Financial Code

Prohibited in marketing repo:

- IRR solver
- Hardcoded floor logic
- Ceiling formulas
- Gain calculations
- Timing factor logic
- Settlement reconstruction

If any remain, remove.

---

## 5) Parity Validation

Before merge:

Test scenarios:

- Standard exit
- Early exit
- Late exit
- Ceiling binding
- NO_FLOOR negative case

Verify:

Marketing output === compute module output

Exact match required.

---

# Version Logging

Marketing should log:



results.compute_version


For debug validation.

---

# Out of Scope

- UI redesign
- Copy changes
- Lead capture changes

This ticket is strictly financial parity enforcement.

---

# Definition of Done

AGENT-004 complete when:

- No financial math exists in marketing repo
- All outputs originate from computeDeal()
- Parity validated
- compute_version visible/loggable

---

# End of Ticket
