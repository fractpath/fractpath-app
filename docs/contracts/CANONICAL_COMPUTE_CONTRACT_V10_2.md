docs/contracts/CANONICAL_COMPUTE_CONTRACT_V10_2.md
# FractPath Canonical Compute Contract
## Version 10.2.0 (Realtor Commission — Per Payment Event + Equity-Weighted Attribution + Netting Locked)

### Purpose
Eliminate compute drift across widget, app, and marketing repos by defining a single, deterministic, versioned compute contract.

This document supersedes previous chat-derived summaries.
Replit agents must reference this file when implementing compute logic.

---

# 0) Non-Negotiables

- Canonical inputs + outputs use **snake_case only**.
- No new fields may be added without:
 - Updating this document
 - Updating TypeScript types
 - Updating validators
 - Updating golden tests
- **No silent recompute** if canonical snapshot validates.
- All math must be deterministic and reproducible.
- **Fee Policy remains LOCKED**:
 - Fees must NOT be silently deducted from `isa_settlement`.
 - Recommended: model fees as additional cashflows.
 - Present "net to investor" and "net to homeowner" views separately.
 - Keep canonical `isa_settlement` independent of fee deductions.

---

# 1) Canonical Inputs

## 1A) DealTerms (Binding Once Approved)

```ts
export type DownsideMode = "HARD_FLOOR" | "NO_FLOOR";
export type RealtorRepresentationMode = "NONE" | "BUYER" | "SELLER" | "DUAL";
export type RealtorCommissionPaymentMode = "PER_PAYMENT_EVENT"; // LOCKED in v10.2

export interface DealTerms {
 // Property + payments
 property_value: number;          // USD at contract start
 upfront_payment: number;         // USD at month 0
 monthly_payment: number;         // USD per month
 number_of_payments: number;      // total scheduled months

 // Payback windows
 payback_window_start_year: number;
 payback_window_end_year: number;
 timing_factor_early: number;
 timing_factor_late: number;

 // Return bounds
 floor_multiple: number;
 ceiling_multiple: number;
 downside_mode: DownsideMode;

 // Duration governance
 contract_maturity_years: number;
 liquidity_trigger_year: number;
 minimum_hold_years: number;

 // Fees (LOCKED UNITS)
 platform_fee: number;            // flat USD
 servicing_fee_monthly: number;   // USD per month
 exit_fee_pct: number;            // % of projected FMV

 // Duration Yield Floor (DYF)
 duration_yield_floor_enabled?: boolean;
 duration_yield_floor_start_year?: number | null;
 duration_yield_floor_min_multiple?: number | null;

 // Realtor Commission (NEW IN v10.2)
 realtor_representation_mode: RealtorRepresentationMode; // "NONE" disables commission
 realtor_commission_pct: number;                          // decimal (e.g. 0.025)
 realtor_commission_payment_mode: RealtorCommissionPaymentMode; // LOCKED "PER_PAYMENT_EVENT"
}
Realtor Input Rules (LOCKED)
realtor_commission_payment_mode MUST equal "PER_PAYMENT_EVENT" in v10.2.


If realtor_representation_mode = "NONE" then realtor_commission_pct MUST be treated as 0 for compute.


Recommended validation cap:


0 <= realtor_commission_pct <= 0.06 (hard reject above cap)



1B) ScenarioAssumptions (Editable What-If Inputs)
export interface ScenarioAssumptions {
 annual_appreciation: number;   // e.g. 0.04
 closing_cost_pct: number;      // % of FMV at exit
 exit_year: number;             // fractional allowed
 fmv_override?: number;         // aligns with code contract (not nullable)
}
NOTE:
closing_cost_pct remains available for UI and later net-cashflow modeling.


v10.2 does not require closing costs to be deducted from isa_settlement.



2) Canonical Outputs
IMPORTANT: This output interface must match packages/compute/src/types.ts exactly.
export interface DealResults {
 // Core economics (UNCHANGED v10.1)
 invested_capital_total: number;
 vested_equity_percentage: number;
 projected_fmv: number;
 base_equity_value: number;

 gain_above_capital: number;
 timing_factor_applied: number;

 isa_pre_floor_cap: number;

 floor_amount: number;
 ceiling_amount: number;

 isa_standard_pre_dyf: number;

 dyf_floor_amount: number | null;
 dyf_applied: boolean;

 isa_settlement: number;

 // Investor economics (UNCHANGED semantics)
 investor_profit: number;
 investor_multiple: number;
 investor_irr_annual: number;

 // Realtor fee projections + attribution (NEW IN v10.2)
 realtor_fee_total_projected: number;
 realtor_fee_upfront_projected: number;
 realtor_fee_installments_projected: number;

 buyer_realtor_fee_total_projected: number;
 seller_realtor_fee_total_projected: number;

 // Optional net IRR (NEW IN v10.2, explicit)
 // If not implemented, must be set to null and documented in code.
 investor_irr_annual_net: number | null;

 compute_version: string;
}
Output Semantics (LOCKED)
isa_settlement remains gross settlement computed exactly per v10.1.


Realtor fees are modeled as additional cashflows, not deducted from isa_settlement.


investor_irr_annual retains v10.1 semantics (gross, fee-excluding unless already implemented in v10.1 code).


investor_irr_annual_net is explicitly fee-inclusive if implemented; otherwise must be null.



3) Deterministic Compute Rules (UNCHANGED v10.1)
Step 0 — Exit Month Rule (LOCKED)
exit_month = floor(exit_year * 12)
payments_made_by_exit = min(number_of_payments, exit_month)
Settlement occurs at month = exit_month.
Step 1 — Invested Capital (IBA)
invested_capital_total =
 upfront_payment +
 (monthly_payment * payments_made_by_exit)
Step 2 — Equity Vesting (DCA Model)
Upfront equity:
equity_upfront = upfront_payment / property_value
For each paid month m:
property_value_m =
 property_value * (1 + annual_appreciation)^(m / 12)

equity_m = monthly_payment / property_value_m
Total vested:
vested_equity_percentage =
 equity_upfront + Σ equity_m
Step 3 — FMV at Exit
If override exists:
projected_fmv = fmv_override
Else:
projected_fmv =
 property_value * (1 + annual_appreciation)^exit_year
Step 4 — Base Equity Value
base_equity_value =
 projected_fmv * vested_equity_percentage
Step 5 — Gain Above Capital
gain_above_capital =
 base_equity_value - invested_capital_total
Step 6 — Timing Factor (Gain Only)
timing_factor_applied =
 timing_factor_early if exit_year < payback_window_start_year
 timing_factor_late  if exit_year > payback_window_end_year
 1 otherwise
Step 7 — Pre Floor/Cap Settlement
Timing factor applies only to gain:
isa_pre_floor_cap =
 invested_capital_total +
 (gain_above_capital * timing_factor_applied)
Step 8 — Apply Downside Mode + Ceiling
floor_amount   = invested_capital_total * floor_multiple
ceiling_amount = invested_capital_total * ceiling_multiple
If HARD_FLOOR:
isa_standard_pre_dyf =
 clamp(isa_pre_floor_cap, floor_amount, ceiling_amount)
If NO_FLOOR:
isa_standard_pre_dyf =
 min(isa_pre_floor_cap, ceiling_amount)

4) Duration Yield Floor (DYF) (UNCHANGED v10.1)
LOCKED DECISION:
 DYF may override the ceiling cap.
DYF activates if:
duration_yield_floor_enabled


AND exit_year >= duration_yield_floor_start_year


Compute:
dyf_floor_amount =
 invested_capital_total * duration_yield_floor_min_multiple
Final settlement:
isa_settlement =
 max(isa_standard_pre_dyf, dyf_floor_amount)
If DYF not active:
isa_settlement = isa_standard_pre_dyf
DYF Invariants:
If dyf_applied = false: isa_settlement <= ceiling_amount


If dyf_applied = true: isa_settlement >= dyf_floor_amount


Settlement may exceed ceiling_amount when DYF applies.



5) Investor Economics (UNCHANGED v10.1)
investor_profit =
 isa_settlement - invested_capital_total

investor_multiple =
 isa_settlement / invested_capital_total
IRR Calculation (Deterministic)
Cashflows:
Month 0: -upfront_payment


Month 1..payments_made_by_exit: -monthly_payment


Month exit_month: +isa_settlement


Solve monthly IRR deterministically (fixed tolerances). Annualize:
investor_irr_annual =
 (1 + irr_monthly)^12 - 1

6) Realtor Commission Model (NEW IN v10.2)
6A) Principle (LOCKED)
Realtor commission is earned and payable only when money transfers.
 In projection compute, realized transfers are modeled up to payments_made_by_exit.
This section defines:
deterministic projected totals for scenario modeling


deterministic attribution rules for buyer vs seller


netting semantics for operational payout reporting


6B) Commission Base (LOCKED)
Commission is based on equity transfer cashflows:
upfront_payment at month 0


each monthly_payment for months actually paid in the projection model


It is NOT based on:
projected_fmv


final settlement sale price


MLS listing commission rules


6C) Commission Totals (Projection)
Let:
pct = realtor_commission_pct if representation_mode != "NONE", else 0


Compute:
Upfront:
realtor_fee_upfront_projected =
 upfront_payment * pct
Installments:
realtor_fee_installments_projected =
 (monthly_payment * payments_made_by_exit) * pct
Total:
realtor_fee_total_projected =
 realtor_fee_upfront_projected + realtor_fee_installments_projected
6D) Equity-Weighted Attribution (LOCKED)
For each payment event, attribution uses buyer vested equity after applying that payment.
Operational definition:
In live servicing: compute vested equity using realized payment events to date.


In projection compute: approximate using the canonical vesting model up to month m.


For a given payment event E:
commission_E = gross_amount_E * pct


vested_equity_pct_E = vested equity percentage AFTER applying payment E


Attribution:
buyer_commission_share_E =
 commission_E * vested_equity_pct_E

seller_commission_share_E =
 commission_E * (1 - vested_equity_pct_E)
Projection totals:
buyer_realtor_fee_total_projected = Σ buyer_commission_share_E


seller_realtor_fee_total_projected = Σ seller_commission_share_E


6E) Netting Semantics (LOCKED)
Netting is the operational cash movement model:
Buyer sends the full gross_amount_E.


Realtor receives commission_E immediately upon cleared funds.


Seller receives:


seller_net_E = gross_amount_E - commission_E
Attribution (6D) is for reporting and obligation allocation; it does not require reverse transfers.
6F) Default / Remedies (Out of Scope)
No commission is earned on unpaid or failed payments.


Clawbacks, defaults, and remedies remain out of scope for compute and belong to workflow/legal layers.



7) Fee Model (LOCKED UNITS) (UNCHANGED v10.1)
Platform Fee:
platform_fee = flat USD


Exit Fee:
exit_fee_amount = projected_fmv * exit_fee_pct
Servicing Fee:
servicing_total = servicing_fee_monthly * payments_made_by_exit
Fee Policy:
Fees must NOT be silently deducted from isa_settlement.


Recommended: model fees as additional cashflows.


Present net views separately.



8) Canonical Snapshot Structure
Persist immutably:
{
 "compute_version": "10.2.0",
 "inputs": {
   "deal_terms": { "...": "..." },
   "scenario": { "...": "..." }
 },
 "outputs": {
   "results": { "...": "..." }
 },
 "computed_at": "ISO-8601"
}

9) Required Drift Guards
All repos must enforce:
snake_case validation


finite numeric outputs


deterministic golden test fixtures


invariant tests:


HARD_FLOOR never below floor_amount


standard mode never above ceiling_amount unless DYF applies


DYF override behavior


investor_multiple correctness


IRR reproducibility


Version guards:


compute_version must equal "10.2.0" for v10.2 fixtures


realtor fields must be present in v10.2 snapshots (defaults allowed)



10) Explicitly Out of Scope (Not Part of Compute)
Default remedies


Lien mechanics


Breach logic


State machine transitions


Legal enforcement


Dispute resolution


Broker licensing compliance


Escrow/trust handling rules


These belong to workflow/legal layers, not compute kernel.

11) Versioning Policy (LOCKED)
Any change to:
settlement formula


fee base


DYF behavior


exit rounding


timing factor semantics


realtor fee semantics (base, timing, attribution, netting)


Requires:
compute_version bump


updated golden tests


update to this document



This Document Is The Canonical Compute Authority
All agents implementing compute must reference:
docs/contracts/CANONICAL_COMPUTE_CONTRACT_V10_2.md
No chat memory supersedes this file.

---

## Next (so agents don’t drift)
Add a pointer file:

`docs/contracts/CANONICAL_COMPUTE_CONTRACT_LATEST.md`

```md
# Canonical Compute Contract (LATEST)

LATEST: Version 10.2.0

Agents must reference:
docs/contracts/CANONICAL_COMPUTE_CONTRACT_V10_2.md

