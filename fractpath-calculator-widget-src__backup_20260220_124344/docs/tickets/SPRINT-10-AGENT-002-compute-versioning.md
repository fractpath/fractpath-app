# SPRINT 10 — AGENT-002
Compute Versioning Propagation

Repository: fractpath-app  
Depends On:
- fractpath-calculator-widget/packages/compute/src/version.ts
- docs/financial-core/sprint-10-compute-spec.md
- docs/financial-core/sprint-10-snapshot-spec.md

Status: Ready for Implementation

---

# Objective

Ensure compute versioning is consistently embedded and persisted across the platform.

Compute versioning prevents silent drift and enables auditability.

---

# Requirements

## 1) Canonical Source
Compute version must be defined only in the compute module:



@fractpath/compute
version.ts → export const COMPUTE_VERSION = "10.0.0"


No other repo may hardcode the version string.

All repos must import it via computeDeal results or direct import where appropriate.

---

# App Responsibilities (fractpath-app)

## 2) Snapshot Persistence
When persisting a snapshot, store:

- snapshot.compute_version = results.compute_version
- snapshot.computed_at = now()

Compute version must be stored as:

- Top-level column (optional but recommended)
- And inside snapshot payload (required)

---

## 3) Display / Debug
In dev mode (or internal view), show compute_version for a deal.

This is for debugging parity issues.

---

# Marketing Responsibilities (fractpath-marketing)

Marketing may:

- console log results.compute_version
- optionally surface in a hidden debug section

Marketing must not hardcode compute_version.

---

# Validation

- Creating or approving a deal must store compute_version.
- Reading a deal snapshot must include compute_version.
- Recompute invariant checks must compare outputs produced by the same version as the stored snapshot.

---

# Out of Scope

- No math changes
- No schema migration beyond what AGENT-003 defines
- No UI redesign

---

# Definition of Done

AGENT-002 is complete when:

- compute_version flows through compute results
- app persists compute_version with snapshot
- marketing displays/logs compute_version
- no repo hardcodes compute_version

---

# End of Ticket
