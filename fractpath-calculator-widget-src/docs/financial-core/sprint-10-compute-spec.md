# FractPath — Sprint 10 Canonical Compute Specification
Version: 10.0.0  
Status: Frozen for Engineering  
Applies To: @fractpath/compute  

---

# Purpose

This document defines the single source of financial truth for FractPath.

All compute logic implemented in code must strictly adhere to this specification.

Marketing, App, Snapshot persistence, and any third-party integrations must rely on the canonical compute module governed by this document.

No alternative math implementations are permitted.

---

# Core Principles

1. Deterministic compute (same inputs → same outputs)
2. Single source of financial truth
3. Snapshot immutability
4. Versioned compute logic
5. Marketing + App math parity
6. Fork copies inputs only, not outputs
7. No silent mutation of binding financial fields

---

# Canonical Schemas

## DealTerms (Binding on Approval)

These values are immutable once a deal is approved.

```ts
interface DealTerms {
  property_value: number
  upfront_payment: number
  monthly_payment: number
  number_of_payments: number

  payback_window_start_year: number
  payback_window_end_year: number

  timing_factor_early: number
  timing_factor_late: number

  floor_multiple: number
  ceiling_multiple: number

  downside_mode: "HARD_FLOOR" | "NO_FLOOR"

  contract_maturity_years: number
  liquidity_trigger_year: number
  minimum_hold_years: number

  platform_fee: number
  servicing_fee_monthly: number
  exit_fee_pct: number
}
ScenarioAssumptions (Editable “What-If” Inputs)
These are not binding at approval.

interface ScenarioAssumptions {
  annual_appreciation: number
  closing_cost_pct: number
  exit_year: number
  fmv_override?: number
}
DealResults (Deterministic Outputs)
interface DealResults {
  invested_capital_total: number
  vested_equity_percentage: number
  projected_fmv: number
  base_equity_value: number
  gain_above_capital: number
  isa_pre_floor_cap: number
  floor_amount: number
  ceiling_amount: number
  isa_settlement: number
  investor_profit: number
  investor_multiple: number
  investor_irr_annual: number
  compute_version: string
}
Financial Logic Model
Step 1 — Total Invested Capital (IBA)
IBA = upfront_payment + sum(monthly_payments_made)
Step 2 — Projected FMV
If fmv_override is provided:

FMV = fmv_override
Else:

FMV = property_value × (1 + annual_appreciation) ^ exit_year
Step 3 — Vested Equity
Vested equity is determined by:

Upfront equity = upfront_payment / property_value

Monthly equity = monthly_payment / property_value_at_time_of_payment

Accumulate over time until exit_year

Step 4 — Base Equity Value
base_equity_value = FMV × vested_equity_percentage
Step 5 — Gain Above Capital
gain_above_capital = base_equity_value − IBA
Gain may be negative.

Step 6 — Timing Factor (TF)
If exit_year < payback_window_start_year:

TF = timing_factor_early
If exit_year > payback_window_end_year:

TF = timing_factor_late
Else:

TF = 1
Step 7 — ISA Pre Floor/Cap
Timing factor applies only to gain.

isa_pre_floor_cap = IBA + (gain_above_capital × TF)
Principal is never multiplied.

Step 8 — Floor & Ceiling
floor_amount = IBA × floor_multiple
ceiling_amount = IBA × ceiling_multiple
Downside Mode Rules
If downside_mode = HARD_FLOOR:

isa_settlement = clamp(
  isa_pre_floor_cap,
  floor_amount,
  ceiling_amount
)
If downside_mode = NO_FLOOR:

isa_settlement = min(
  isa_pre_floor_cap,
  ceiling_amount
)
ISA may be less than IBA in NO_FLOOR mode.

Step 9 — Investor Profit
investor_profit = isa_settlement − IBA
Step 10 — Investor Multiple
investor_multiple = isa_settlement / IBA
Step 11 — IRR Calculation (Canonical)
IRR must be computed using:

Monthly cashflows

Monthly solver

Annualized result

Cashflow ordering:

Month 0: −upfront_payment

Month 1 → N: −monthly_payment (if within payment schedule)

Exit month: +isa_settlement

Monthly IRR is solved via deterministic numeric method.

Annual IRR:

irr_annual = (1 + irr_monthly)^12 − 1
Deterministic Rounding Policy
All monetary outputs must be rounded to 2 decimal places.

IRR must be rounded to 6 decimal places before annualization, then 4 decimal places for display.

Rounding must be consistent across environments.

Step 8b — Duration Yield Floor (DYF)
Optional ceiling-compression protection for long-duration outcomes.

DealTerms fields (all optional):

```ts
duration_yield_floor_enabled?: boolean       // default false
duration_yield_floor_start_year?: number | null  // year threshold
duration_yield_floor_min_multiple?: number | null // minimum settlement multiple
```

Logic (applied AFTER standard floor/ceiling clamp):

```
ISA_standard = settlement after DownsideMode clamp (Step 8)
DYF_floor_amount = IBA × duration_yield_floor_min_multiple

If duration_yield_floor_enabled AND exit_year >= duration_yield_floor_start_year:
  ISA_with_dyf = MAX(ISA_standard, DYF_floor_amount)
Else:
  ISA_with_dyf = ISA_standard
```

DYF constraints:
- Must NOT apply before start_year
- Must be deterministic and rounded per rounding policy
- Compatible with both HARD_FLOOR and NO_FLOOR modes
- DYF may exceed ceiling_multiple outcomes (that is its purpose)
- If disabled or fields null, DYF has no effect on settlement

DealResults includes:
- `dyf_floor_amount: number` — computed DYF floor (0 if disabled)
- `dyf_applied: boolean` — whether DYF raised the settlement

Duration Protection
Contract maturity and liquidity trigger are contract-layer rights.

They do NOT modify financial settlement math.

Snapshot Requirements
Upon approval, the following must be stored immutably:

{
  compute_version,
  inputs,
  assumptions,
  outputs,
  computed_at
}
Versioning
All outputs must include:

compute_version = "10.0.0"
If compute logic changes, version must increment.
