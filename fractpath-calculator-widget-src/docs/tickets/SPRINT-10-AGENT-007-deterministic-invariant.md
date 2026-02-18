# SPRINT 10 — AGENT-007
Deterministic Recompute Invariant Enforcement

Repository: fractpath-app  
Depends On:
- SPRINT-10-AGENT-003-snapshot-schema.md
- SPRINT-10-AGENT-005-app-integration.md
- @fractpath/compute
- docs/financial-core/sprint-10-compute-spec.md

Status: Ready for Implementation

---

# Objective

Ensure financial determinism across the platform.

Before persisting a snapshot, the system must validate:

compute(inputs, assumptions) === outputs

within canonical rounding tolerance.

This prevents:

- Drift
- Silent mutation
- Partial compute corruption
- Version mismatch
- UI-derived math errors

---

# Required Behavior

## 1) Pre-Persistence Validation

On approval:

1. Call:

const results = computeDeal(inputs, assumptions)


2. Compare against:

- The outputs about to be persisted (if staged)
OR
- Recompute twice and ensure identical results

Comparison must validate:

- isa_settlement
- investor_profit
- investor_multiple
- investor_irr_annual
- floor_amount
- ceiling_amount

---

## 2) Rounding Tolerance

Use canonical rounding utilities.

Comparison must respect:

- 2 decimal precision for money
- 4 decimal precision for annual IRR

No floating point loose equality allowed.

Must use strict rounded comparison.

---

## 3) Failure Handling

If mismatch detected:

- Throw error
- Prevent snapshot insertion
- Log compute_version
- Log inputs
- Log assumptions
- Log both result objects

No partial persistence allowed.

---

## 4) Post-Approval Rendering

Approved deals must render snapshot.outputs only.

Recompute must NOT silently replace stored outputs.

If mismatch detected on later recompute:

- Raise alert (future monitoring)
- Do not auto-correct

---

# Optional Future Enhancement (Not Required Now)

Add background job:

- Periodically revalidate stored snapshots against compute module
- Detect drift after version updates

Not required for Sprint 10.

---

# Definition of Done

AGENT-007 complete when:

- Approval flow validates deterministic recompute
- Snapshot persistence blocked on mismatch
- Comparison uses canonical rounding
- No silent math replacement allowed
- compute_version mismatch handled correctly

---

# Strategic Outcome

After this ticket:

FractPath has:

- Deterministic financial engine
- Immutable financial history
- Protection against drift
- Institutional-grade auditability

This completes Sprint 10’s core financial invariants.

---

# End of Ticket
