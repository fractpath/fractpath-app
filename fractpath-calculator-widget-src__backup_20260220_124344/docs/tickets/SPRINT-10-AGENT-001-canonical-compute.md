# SPRINT 10 — AGENT-001
Canonical Compute Module Implementation

Repository: fractpath-calculator-widget  
Depends On:
- docs/financial-core/sprint-10-compute-spec.md
- docs/financial-core/sprint-10-runbook.md  

Status: Ready for Implementation

---

# Objective

Create the canonical deterministic financial compute engine for FractPath.

This module becomes the single source of financial truth for:

- Marketing
- App
- Snapshot persistence
- Future API wrappers

No financial math may exist outside this module after implementation.

---

# Deliverables

Create a new internal package structure:



packages/compute/
├── src/
│ ├── types.ts
│ ├── computeDeal.ts
│ ├── irr.ts
│ ├── rounding.ts
│ └── version.ts
├── tests/
└── package.json


---

# Required Implementations

## 1️⃣ types.ts

Define:

- DealTerms
- ScenarioAssumptions
- DealResults

Must exactly match schemas in sprint-10-compute-spec.md.

---

## 2️⃣ computeDeal.ts

Export:



export function computeDeal(
terms: DealTerms,
assumptions: ScenarioAssumptions
): DealResults


Must implement:

- IBA calculation
- FMV calculation
- Vested equity accumulation
- GainAboveCapital
- TimingFactor logic (gain only)
- Floor and ceiling clamp
- DownsideMode logic
- Investor multiple
- IRR (via irr.ts)
- Deterministic rounding
- Embed compute_version

Must not:
- Access database
- Use environment variables
- Depend on UI

Pure function only.

---

## 3️⃣ irr.ts

Implement:

- Monthly IRR solver
- Deterministic numeric method (Newton-Raphson or equivalent)
- Guard against divergence
- Annualization formula:


irr_annual = (1 + irr_monthly)^12 - 1


Must:
- Return consistent results across environments
- Include unit tests for edge cases

---

## 4️⃣ rounding.ts

Implement canonical rounding utilities:

- roundMoney(value: number): number (2 decimals)
- roundIRR(value: number): number (4 decimals after annualization)

All outputs must use these utilities.

---

## 5️⃣ version.ts



export const COMPUTE_VERSION = "10.0.0"


Must be embedded in DealResults.

---

# Unit Tests Required

Create deterministic test fixtures covering:

1. Standard scenario (within window)
2. Early exit scenario
3. Late exit scenario
4. Ceiling binding case
5. HARD_FLOOR enforcement case
6. NO_FLOOR negative loss case
7. Zero appreciation case

Tests must verify:

- Settlement amount
- IRR
- Multiple
- Floor/cap logic
- Deterministic rounding

Spreadsheet parity must be achieved.

---

# Invariants

The module must satisfy:



computeDeal(inputs, assumptions)


- Deterministic
- Side-effect free
- Environment independent

Same inputs must always produce same outputs.

---

# Out of Scope

Do not:

- Build UI
- Modify marketing repo
- Modify app repo
- Implement snapshot persistence
- Add negotiation logic

This ticket is compute engine only.

---

# Definition of Done

AGENT-001 is complete when:

- computeDeal() implemented
- IRR monthly solver implemented
- Version constant embedded
- All unit tests passing
- Spreadsheet parity validated
- No TODOs remaining

---

# End of Ticket
