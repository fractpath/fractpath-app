# WGT-010 — Deterministic Calculator Engine (MVP, Canonical Compute Module)

## Objective

Implement the FractPath calculator math as a **pure, deterministic compute module** that is the single source of truth for all economic outputs across repos.

This module must support:

- marketing-safe Basic Results rendering (WGT-031 allowlist)
- full-fidelity outputs for app rendering and persistence
- server-side trusted execution in `fractpath-app` (APP-002)

**Alignment update:**  
The same compute module must be importable and runnable in a server context (Node/Edge-safe as applicable). No reliance on browser-only APIs.

---

## Canonical References (Treat as Truth)

- WGT-031 — Gating semantics + marketing allowlist
- WGT-040 — DraftSnapshot transport schema + determinism requirements
- WGT-050 — Contract versioning + deprecation policy
- WGT-020 — Share semantics (payload separation)

---

## Non-goals

- No network calls
- No persistence
- No authentication
- No UI work
- No app share logic
- No “binding quote” semantics
- No marketing-visible ROI/IRR/APR claims (internal computation allowed but must not be rendered in marketing)

---

## Deliverables (Code)

Create a minimal, testable compute module:

1) `shared/calc/types.ts`
- `ScenarioInputsV1`
- `ScenarioOutputsV1`
- `ScenarioSeriesV1`
- `ScenarioAssumptionsV1`

2) `shared/calc/constants.ts`
- explicit defaults + identifiers:
  - appreciation `g_annual`
  - timing factors `tf_early`, `tf_late`
  - floor multiplier `fm`
  - ceiling multiplier `cm`
  - contribution window `cpw_start_year`, `cpw_end_year`
  - equity availability behavior flag (reject vs clamp)
- export:
  - `TERMS_VERSION = "terms_v1"` (or semver+sha style)
  - `ASSUMPTIONS_VERSION = "assumptions_v1"`

3) `shared/calc/compute.ts`
- `computeScenarioV1(inputs: ScenarioInputsV1, assumptions?: ScenarioAssumptionsV1): ScenarioOutputsV1`
- must be pure and deterministic

4) Tests + golden fixtures (required)
- `shared/calc/__tests__/compute.test.ts`
- golden fixtures with known inputs → exact outputs
- stable rounding and ordering rules enforced

---

## Required Engine Behaviors (MVP)

### A) Determinism (Hard Requirement)

- no randomness
- no time-based branching
- no network / IO
- identical inputs + identical assumptions → identical numeric outputs

### B) Time Series Vesting (Upfront + Monthly)

Inputs must support (explicit units):

- starting value `sv_usd`
- appreciation `g_annual`
- upfront contribution `i_upfront_usd`
- monthly contribution `i_monthly_usd`
- monthly count `n_months` (or horizon years converted deterministically)
- homeowner mortgage balance `mortgage_balance_usd` (required for homeowner equity constraint)

Persona must NOT affect math outputs.

Engine must compute series:

- contributed-to-date (IBA) over time
- vested equity fraction over time (per current proportional model)
- homeowner remaining equity over time
- property FMV estimate over time

### C) Property Value Growth

- `fmv(t) = sv * (1 + g)^(t/12)`
- Growth applies only to FMV estimate, not timing factor.

### D) Settlement Scenarios (Early / Standard / Late)

Compute 3 scenario outcomes at year markers:

- early
- standard
- late

Rules:

- FMV at a scenario is derived only from time + g (no TF effect).
- Timing factor modifies payout amount, not FMV.

### E) Floor / Cap Application

Apply payout bounds:

- `floor = iba_paid_to_date * fm`
- `cap = iba_paid_to_date * cm`

Outputs must include:

- `payout_uncapped`
- `payout_pre_bounds` (after TF)
- `floor_amount`
- `cap_amount`
- `payout_final`
- flags:
  - `floor_applied`
  - `cap_applied`

### F) Equity Availability Constraint (Homeowner Required)

Engine must enforce homeowner equity availability:

- `available_equity_usd = max(0, fmv - mortgage_balance_usd)`

Behavior must be deterministic (pick one and lock it via constants/assumptions):

- Reject invalid inputs with explicit error codes, OR
- Clamp to available equity and surface disclosures in outputs

Outputs must include a disclosure-ready field:

- `equity_availability_disclosure` (string key or structured note)

---

## Output Shape Requirements (Downstream Compatibility)

ScenarioOutputsV1 must include:

### 1) Headline values (marketing-safe candidates)
Fields must exist such that marketing Basic Results can be mapped without marketing-only math.

### 2) Scenario table values
Early/Standard/Late metrics including:

- scenario year
- scenario fmv
- vested equity
- contributed-to-date
- payout_final
- payout bounds + flags

### 3) Series arrays
- months array
- fmv series
- equity split series (buyer vs homeowner)
- contributed-to-date series

### 4) Meta block (required)
- `terms_version` (TERMS_VERSION)
- `assumptions_version` (ASSUMPTIONS_VERSION)
- `engine_version` (package version or constant)
- (optional now) canonicalization hooks for hashing (WGT-040)

---

## Rounding / Units Guardrails

- Prefer explicit units (`*_usd`, months vs years).
- Define a single rounding policy (e.g., cents) and apply consistently.
- Avoid float drift:
  - use deterministic rounding points
  - keep ordering stable
- Tests must lock rounding behavior.

---

## Acceptance Criteria

- Engine computes time series vesting (upfront + monthly)
- Engine computes Early/Standard/Late scenario outputs
- Timing factor modifies payout amount (not FMV)
- Floor/cap applied exactly with flags
- Homeowner equity availability constraint enforced + disclosed
- Outputs deterministic and stable under golden tests
- No external calls, persistence, or auth dependencies
- Module is runnable in both browser and server contexts

---

## Notes / Guardrails

- Keep compute minimal and reversible.
- Persona affects UI framing only; compute ignores persona.
- Any schema changes require WGT-050 discipline.

