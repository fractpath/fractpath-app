# FractPath — Sprint 10 Runbook
Financial Core Alignment

Status: Active  
Owner: Financial Core  
Dependencies: sprint-10-compute-spec.md  

---

# Sprint Objective

Transition FractPath from prototype-grade spreadsheet logic to institutional-grade deterministic financial engine.

Sprint 10 establishes:

- Canonical DealTerms schema
- Canonical ScenarioAssumptions schema
- Canonical DealResults schema
- Deterministic compute engine
- Monthly IRR solver
- Versioned compute logic
- Immutable snapshot structure
- Marketing + App compute parity
- Fork invariants
- Deterministic recompute invariant

No new financial mechanics may be introduced during this sprint.

---

# Architectural Target State

@fractpath/compute
├── src/
│ ├── types.ts
│ ├── computeDeal.ts
│ ├── irr.ts
│ ├── rounding.ts
│ └── version.ts
├── tests/
└── package.json


Used by:

- fractpath-marketing
- fractpath-app
- API wrappers
- Snapshot persistence

No duplicated math allowed outside this module.

---

# Phase Breakdown

---

## PHASE 1 — Financial Freeze (Complete)

All financial decisions are locked per sprint-10-compute-spec.md.

No further human changes allowed without version increment.

---

## PHASE 2 — AGENT-001
Create Canonical Compute Module

Deliver:

- `types.ts`
- `computeDeal.ts`
- `irr.ts`
- `rounding.ts`
- `version.ts`
- Unit tests

Definition of Done:

- Spreadsheet parity achieved
- Deterministic outputs verified
- True loss sharing under NO_FLOOR validated
- Ceiling binding validated
- Early/late timing validated

---

## PHASE 3 — AGENT-002
Compute Versioning

Deliver:

- `COMPUTE_VERSION = "10.0.0"`
- Embedded in all DealResults
- Used in snapshot persistence

Definition of Done:

- All outputs include version
- Version visible in deal detail (dev mode optional)

---

## PHASE 4 — AGENT-003
Snapshot Schema Expansion

Repository: fractpath-app

Migration must store:

{
compute_version,
inputs,
assumptions,
outputs,
computed_at
}


Snapshots are immutable.

Definition of Done:

- Approved deals persist full canonical payload
- No silent mutation allowed

---

## PHASE 5 — AGENT-004
Marketing Alignment

Repository: fractpath-marketing

Deliver:

- Remove duplicated financial logic
- Import computeDeal
- Validate parity against canonical outputs

Definition of Done:

- Marketing results equal computeDeal outputs
- No local math exists in marketing repo

---

## PHASE 6 — AGENT-005
App Alignment + Deal Detail Rendering

Repository: fractpath-app

Deliver:

- Replace existing math with computeDeal
- Deal detail view renders canonical outputs
- Recompute on edit (pre-approval)
- Persist snapshot on approval

Deal detail must display:

Investor View:
- Invested Capital
- Settlement Amount
- Profit
- Multiple
- IRR

Homeowner View:
- Projected FMV
- Settlement Payout
- Remaining Equity

Definition of Done:

- Deal detail view renders computeDeal results
- No derived math outside compute module

---

## PHASE 7 — AGENT-006
Fork Invariant

Fork must:

- Copy inputs
- Copy assumptions
- NOT copy outputs
- Force recompute

Definition of Done:

- Forked deal produces new snapshot
- compute_version preserved

---

## PHASE 8 — AGENT-007
Deterministic Recompute Invariant

App must validate:

compute(inputs, assumptions) === stored.outputs


Within rounding tolerance.

Definition of Done:

- Recompute validation passes
- Drift triggers error

---

# Definition of Done (Sprint 10)

Sprint 10 is complete when:

- Canonical compute module exists
- Spreadsheet parity achieved
- Monthly IRR implemented
- Versioning implemented
- Snapshots immutable
- Marketing uses canonical compute
- App uses canonical compute
- Deal detail renders canonical outputs
- Fork recomputes cleanly
- No duplicated financial logic exists in any repo

---

# Explicitly Out of Scope

- Buyer negotiation flows
- Realtor workflow changes
- Underwriting mechanics
- Capital raising logic
- UI redesign

Sprint 10 is infrastructure only.

---

# Strategic Outcome

After Sprint 10:

FractPath will have:

- Institutional-grade financial engine
- Deterministic compute layer
- Versioned financial history
- Stable foundation for negotiation and counter flows

This sprint marks the transition from prototype system to financial platform.
