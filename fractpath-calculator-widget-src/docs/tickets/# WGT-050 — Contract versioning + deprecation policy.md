# WGT-050 — Contract versioning + deprecation policy (no silent mutation)

## Sprint
Sprint 0 (alignment-only) → governs all Sprint 5 execution and beyond

## Objective
Codify an enforceable breaking-change protocol for:
- Widget public interface (props + callbacks)
- Serialized payloads (DraftSnapshot, ShareSummary, app save payload)
- Mode semantics (`mode="marketing"` vs `mode="app"`)
- Calculator contract schema (`CalculatorInputsV1`, `CalculatorResultV1`)

This policy prevents silent mutation and ensures cross-repo coordination.

---

## Canonical Source of Truth
- Canonical contract file: `docs/architecture/integration-contract.md`
- This repo must mirror or reference the canonical contract via WGT-INT-001.

---

## Version Identifiers (Required)
The following version identifiers must exist and be carried through payloads and results.

### 1) `contract_version` (semantic version)
Governs:
- widget public interface (props + callbacks)
- event names and payload envelopes
- mode semantics and allowed UI surfaces (WGT-030/WGT-031)

### 2) `calculator_schema_version` (semantic version)
Governs:
- `CalculatorInputsV1` and `CalculatorResultV1` shapes and meaning
- schema validation rules (zod/json-schema)
- breakdown keys stability and units

### 3) Payload `schema_version` (semantic version; per payload)
Each serialized payload that crosses repo boundaries must carry its own schema version:
- DraftSnapshot `schema_version`
- ShareSummary `schema_version`
- App save payload `schema_version` (if distinct from calculator schema)

---

## Semantic Versioning Rules (Enforced)

### A) `contract_version`
- **MAJOR** (breaking)
  - Removing/renaming props or callbacks
  - Changing required prop/callback types
  - Changing event names
  - Changing mode behavior that alters allowed outputs (WGT-031/WGT-030)
  - Changing required CTA semantics (e.g., Apply vs Save & Continue)

- **MINOR** (backward-compatible)
  - Adding optional props/callbacks with safe defaults
  - Adding optional events that hosts may ignore
  - Adding new UI surfaces guarded by opt-in flags (must default off)

- **PATCH** (non-breaking)
  - Documentation clarifications
  - Bug fixes that do not change output meaning/units
  - Performance improvements that preserve determinism and semantics

### B) `calculator_schema_version`
- **MAJOR** (breaking)
  - Renaming/removing inputs or outputs
  - Renaming/removing breakdown keys
  - Changing the meaning/units of any numeric field
  - Changing required validation constraints in a way that breaks existing saved snapshots

- **MINOR** (additive)
  - Adding optional inputs with defaults
  - Adding optional outputs/breakdown rows that do not alter existing meanings
  - Adding new charts/series fields that are safely ignorable

- **PATCH** (non-breaking)
  - Fixing computation bugs where prior behavior was incorrect, as long as:
    - meaning/units remain stable, AND
    - release notes explicitly call out numeric changes

> **Important:** Persona framing may change copy/labels without bumping calculator schema, as long as underlying numeric fields and meanings are unchanged.

### C) Payload `schema_version` (DraftSnapshot / ShareSummary / Save payload)
- **MAJOR** (breaking)
  - Receiver would break or misinterpret data
  - Field renames/removals
  - Type changes for required fields

- **MINOR** (additive)
  - Optional fields only; receivers must tolerate absence

- **PATCH**
  - Clarifications / metadata that is safely ignorable

---

## Compatibility Window (Hard Requirement)
To prevent breaking production links, emails, and persisted deals:

- Marketing and App must accept:
  - the current `contract_version` MAJOR
  - at least the prior MINOR within that MAJOR

- App must be able to redeem DraftSnapshots for:
  - the current DraftSnapshot `schema_version` MAJOR
  - at least one prior MINOR within that MAJOR

- App must be able to render persisted calculator snapshots for:
  - the current `calculator_schema_version` MAJOR
  - at least one prior MINOR within that MAJOR

No change may shorten this window without explicit cross-repo approval.

---

## Deprecation Policy
A feature/prop/callback/field is deprecated only when:
1) Marked deprecated in the canonical contract
2) A removal target is specified (future MAJOR)
3) Migration guidance is provided

Deprecated surfaces must remain supported for the compatibility window.

---

## Coordinated Release Requirements (No Silent Mutation)
Any change impacting contract/interface/schema requires:

1) Update canonical contract (`docs/architecture/integration-contract.md`)
2) Bump the appropriate version(s):
   - `contract_version` and/or `calculator_schema_version` and/or payload `schema_version`
3) Update widget repo mirror/reference (WGT-INT-001)
4) Create/update OPS coordination entry (OPS-INT-001) indicating:
   - which repos must update
   - required order (widget → marketing → app)
5) Release notes entry documenting:
   - what changed
   - why
   - migration steps
   - any numeric impact (if compute outputs changed)

No agent or developer may implement a contract change without these steps.

---

## Changelog Requirements
- Maintain a changelog entry per version bump including:
  - Added / Changed / Deprecated / Removed
  - Explicit breaking-change callouts for MAJOR bumps
  - Migration steps
  - Compatibility notes (which versions are accepted)

- Sprint 5 agent prompts must reference the changelog for the current baseline.

---

## Determinism & Meaning Preservation
- Contract updates must not introduce ambiguity:
  - every numeric field must have clear meaning, units, and constraints
- Determinism requirement:
  - identical applied inputs + assumptions + calculator schema version must yield identical numeric outputs
  - hashes must exclude timestamps and other non-deterministic data

> Persona affects marketing presentation only. Compute determinism must not depend on persona.

---

## Acceptance Criteria
- Versioning rules are explicit and non-negotiable.
- Compatibility window is defined and enforceable across widget/marketing/app.
- Coordinated release steps prevent silent mutation.
- Sprint 5 agents can implement without interpretive choices.
- Policy explicitly distinguishes:
  - contract interface evolution
  - calculator schema evolution
  - payload schema evolution
  - persona presentation evolution

---

## Dependencies
- WGT-040 — DraftSnapshot schema + stability guarantees
- WGT-031 — Gating semantics
- WGT-030 — Mode UI surface semantics
- WGT-INT-001 — Contract mirror / public interface lock
- OPS-INT-001 — Multi-repo orchestration governor
