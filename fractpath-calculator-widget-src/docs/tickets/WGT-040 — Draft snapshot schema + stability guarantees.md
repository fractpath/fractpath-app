# WGT-040 — DraftSnapshot Schema + Stability Guarantees (Transport Only, Server-Authoritative)

## Sprint
Sprint 0 (alignment-only) → Sprint 9 (implementation foundation)

---

# Objective

Define and lock the **DraftSnapshot** schema produced by the widget and consumed by the app.

This ticket eliminates ambiguity around:

- required vs optional fields
- determinism guarantees
- versioning and backward compatibility
- non-binding semantics
- homeowner equity-availability constraint (FMV − mortgage)

**Critical alignment update:** DraftSnapshot is a **transport envelope** for inputs + context.  
The app is the trusted compute authority for persisted snapshots (APP-002).  
The widget may compute for UI preview, but the app must recompute server-side before persisting.

---

# DraftSnapshot — Purpose (Revised)

A DraftSnapshot represents a **non-binding, pre-auth transport payload** that allows:

- a prospect to resume their work in the app after email capture + authentication
- the app to reconstruct a deal by:
  - validating inputs
  - recomputing outputs server-side using the canonical compute module
  - persisting version 1 as an immutable deal snapshot

A DraftSnapshot is **not** a deal, offer, quote, or commitment.

---

# Naming + Contract Alignment

DraftSnapshot is the transport envelope for the canonical calculator contract:

- `CalculatorInputsV1` (inputs schema)
- `CalculatorAssumptionsV1` (assumptions schema, if distinct)
- (Optional) `CalculatorPreviewV1` (preview output for UI only)

**Important:** The persisted authoritative output lives in the app’s `deal_snapshots.outputs_json`, computed server-side.

Marketing display constraints are governed by WGT-031. DraftSnapshot may carry more than marketing renders, but it must remain safe and non-binding.

---

# DraftSnapshot — Required Fields (Exhaustive)

## A) Identity & Versioning
- `snapshot_id`
  - opaque widget-generated identifier (uuid recommended)
- `schema_version`
  - DraftSnapshot schema version (semantic, starts at `"v1"`)
- `calculator_schema_version`
  - calculator contract schema version (e.g., `"v1"`)
- `engine_version`
  - compute package version identifier used by the widget (package version or git-based string)
- `created_at_iso`
  - ISO-8601 timestamp (UTC)

## B) Context
- `mode`
  - must be `"marketing"` at time of creation
- `persona`
  - `"homeowner" | "buyer" | "realtor"`
  - **presentation only**; must not alter compute determinism
- `assumptions`
  - the explicit assumption set applied at time of creation (object)
  - MUST be included so the app can reproduce the same compute context server-side

## C) Inputs (Applied, Canonical)
- `inputs`
  - applied calculator inputs object
  - MUST validate against `CalculatorInputsV1Schema`
  - MUST include explicit defaults used for omitted optional fields
  - includes homeowner fields required for equity availability logic (e.g., mortgage balance where applicable)
  - does NOT include raw typing state

---

# Optional Fields (Explicit Allowlist Only)

Optional fields may exist only if:

- explicitly defined in WGT-INT-001 contract mirror, AND
- additive and non-breaking per WGT-050

### Allowed Optional Field (UI Preview Only)
- `preview_result`
  - widget-computed preview output
  - MUST validate against `CalculatorResultV1Schema` if present
  - MUST be treated as non-authoritative by the app
  - MUST NOT be persisted as authoritative `outputs_json` without server recompute

If absent, app must still redeem DraftSnapshot successfully.

---

# Prohibited Fields (Unchanged, Strict)

DraftSnapshot must NOT include:

- `deal_id`
- counterparty identifiers / permissions
- negotiation state / version history
- user identifiers (user_id, email, auth claims)
- legal clauses or binding quote language
- API URLs, routing info, host wrappers
- any field implying a committed offer

---

# Equity Availability Constraint (Required Semantics)

The canonical compute engine MUST enforce and disclose homeowner equity availability:

- `available_equity_usd = max(0, FMV - mortgage_balance)`

Rules:

- engine must not produce outputs implying sale of equity beyond available
- behavior must be deterministic:
  - either reject invalid inputs, OR clamp with explicit disclosure
- disclosure must be present in:
  - assumptions and/or a breakdown row
  - and must be stable across compute environments

This is mandatory for homeowner persona Day 1.

---

# Determinism Guarantees (Revised)

## Compute determinism (canonical)
Given identical:

- `inputs`
- `assumptions`
- `calculator_schema_version`
- `engine_version`

the compute engine must produce identical numeric outputs (server-side in app, widget in preview if used).

Persona affects presentation only.

## DraftSnapshot integrity (transport)
DraftSnapshot must include deterministic hashes:

- `inputs_hash`
  - hash of canonicalized `inputs` + `calculator_schema_version`
- `assumptions_hash`
  - hash of canonicalized `assumptions` + `calculator_schema_version`

If `preview_result` exists, it may also include:

- `preview_result_hash`
  - hash of canonicalized `preview_result` + `calculator_schema_version`

Hashes must:

- exclude timestamps
- be stable across hosts/time
- be computed with an explicitly documented canonicalization approach

---

# App Redemption Rules (Alignment with APP-002)

When app redeems a DraftSnapshot:

1. Validate schema_version + calculator_schema_version.
2. Validate `inputs` and `assumptions` against exported schemas.
3. Recompute outputs server-side using canonical compute engine.
4. Persist deal snapshot version 1:
   - inputs_json = inputs
   - outputs_json = server computed outputs (includes schedule table)
   - terms_version = exported from compute module
   - engine_version = recorded
5. If unsupported schema or invalid payload:
   - fail explicitly
   - create no deal / no partial records

**App must not:**
- infer missing fields
- silently apply defaults
- persist preview_result as authoritative output

---

# Versioning & Compatibility Rules

- `schema_version` governed by WGT-050 semantic policy.
- App must redeem:
  - current MAJOR version
  - at least one prior MINOR version (policy target)

---

# Stability Guarantees

- DraftSnapshot shape is frozen for Sprint 9 foundation.
- Any mutation requires:
  - WGT-050 version bump
  - WGT-INT-001 contract mirror update
  - explicit multi-repo coordination (OPS-INT-001)

---

# Acceptance Criteria

- DraftSnapshot schema is explicit and exhaustive.
- DraftSnapshot includes:
  - identity + versioning fields
  - inputs + assumptions (canonical)
  - deterministic hashes
- Persona recorded but does not affect compute determinism.
- Equity availability constraint is enforced and disclosed by compute engine.
- Optional preview_result is permitted but treated as non-authoritative by the app.
- App redemption is deterministic:
  - validates
  - recomputes server-side
  - persists immutable snapshot v1
- Snapshot remains clearly non-binding.

---

# Dependencies

- WGT-030 — Widget UI surface + mode behavior
- WGT-031 — Widget gating semantics
- WGT-050 — Contract versioning + deprecation policy
- WGT-INT-001 — Widget public interface (contract mirror)
- APP-002 — Server-side compute + snapshot persistence
- OPS-INT-001 — Multi-repo orchestration

