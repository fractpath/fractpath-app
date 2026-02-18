# SPRINT 10 — AGENT-003
Snapshot Schema Expansion + Immutability

Repository: fractpath-app  
Depends On:
- docs/financial-core/sprint-10-snapshot-spec.md
- docs/financial-core/sprint-10-app-integration-spec.md
- @fractpath/compute (computeDeal + compute_version)

Status: Ready for Implementation

---

# Objective

Expand snapshot persistence to store the canonical payload:

- inputs (DealTerms)
- assumptions (ScenarioAssumptions)
- outputs (DealResults)
- compute_version
- computed_at

Snapshots must be immutable after creation.

---

# Database Changes

## 1) Create or Expand Table

Preferred: create a dedicated table:

deal_snapshots


Required columns:

- id uuid primary key default gen_random_uuid()
- deal_id uuid not null references deals(id)
- compute_version text not null
- inputs jsonb not null
- assumptions jsonb not null
- outputs jsonb not null
- computed_at timestamptz not null default now()
- created_at timestamptz not null default now()

Add indexes:
- (deal_id)
- (compute_version)

---

## 2) Immutability Enforcement

Snapshots must not be updateable.

Enforce via one of:

A) RLS policy that denies UPDATE for all roles  
B) Trigger that raises on UPDATE  
C) Both (recommended)

Minimum requirement:

- Block UPDATE on deal_snapshots
- Block DELETE (optional but recommended)

---

# Application Layer Changes

## 3) Snapshot Write on Approval

On approval action:

1. Load current draft inputs + assumptions
2. Call canonical compute:
const results = computeDeal(inputs, assumptions)

3. Persist snapshot row containing:
- compute_version
- inputs
- assumptions
- outputs
- computed_at

4. Store pointer on deals table if needed:
- deals.approved_snapshot_id
- deals.latest_snapshot_id (optional)

---

## 4) Draft vs Approved Behavior

- Draft deals: recompute live from inputs
- Approved deals: render from snapshot.outputs only

No silent recompute for approved deals.

---

# Deterministic Recompute Validation

Before snapshot insert:

- recompute once and compare results
- if mismatch → error and block insert

Comparison must respect rounding policy from compute module.

---

# Fork Behavior (Reference)

Forking a deal must:

- copy inputs + assumptions only
- not copy outputs
- require recompute

(Implementation may be separate ticket, but schema must support it.)

---

# Out of Scope

- UI polish
- Negotiation state machines
- Buyer counter flows

---

# Definition of Done

AGENT-003 is complete when:

- Database migration exists and applied
- deal_snapshots persists canonical payload
- UPDATE/DELETE blocked (immutability)
- approval flow writes snapshot successfully
- approved deal renders from snapshot outputs

---

# End of Ticket
