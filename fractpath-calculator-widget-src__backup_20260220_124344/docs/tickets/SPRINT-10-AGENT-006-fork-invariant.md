# SPRINT 10 — AGENT-006
Fork Invariant Enforcement

Repository: fractpath-app  
Depends On:
- SPRINT-10-AGENT-003-snapshot-schema.md
- SPRINT-10-AGENT-005-app-integration.md
- docs/financial-core/sprint-10-snapshot-spec.md

Status: Ready for Implementation

---

# Objective

Enforce structural invariants when a deal is forked.

Forking must preserve financial integrity and prevent snapshot corruption.

---

# Core Rule

Fork copies:

- inputs
- assumptions

Fork must NOT copy:

- outputs
- compute_version
- computed_at
- prior snapshot payload

Fork must force recompute.

---

# Required Behavior

## 1) Fork Action

When user selects “Fork Deal”:

System must:

1. Load source deal snapshot.
2. Extract:
   - snapshot.inputs
   - snapshot.assumptions
3. Create new draft deal:
   - inputs = copied inputs
   - assumptions = copied assumptions
   - no outputs persisted
   - no snapshot created

---

## 2) Recompute on Forked Draft

When forked draft is opened:

const results = computeDeal(inputs, assumptions)


Render live draft view.

---

## 3) Approval of Fork

Upon approval:

- Compute new results
- Persist new snapshot
- Store compute_version
- Link snapshot to forked deal

Original snapshot remains unchanged.

---

# Prohibited Behavior

Fork must NOT:

- Copy snapshot.outputs
- Copy compute_version
- Copy computed_at
- Reuse prior snapshot ID

---

# Database Integrity

If original deal has:

approved_snapshot_id


Forked deal must:

- Have null snapshot until approval
- Create new snapshot row on approval

---

# Deterministic Invariant

Before persisting forked snapshot:

compute(inputs, assumptions) === outputs


Must validate within rounding tolerance.

---

# Edge Cases

If compute_version changed between original deal and fork:

- Fork uses current compute version.
- Snapshot stores new version.
- Old deal remains tied to prior version.

No retroactive mutation allowed.

---

# Definition of Done

AGENT-006 complete when:

- Fork copies only inputs + assumptions
- Draft fork recomputes live
- Approval of fork creates new snapshot
- Original snapshot untouched
- No duplicate financial math exists
- compute_version correct for forked snapshot

---

# Strategic Outcome

Fork becomes:

- A safe financial branch
- A new compute event
- A new immutable snapshot

This enables future counter flows safely.

---

# End of Ticket
