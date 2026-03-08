declare module "@fractpath/compute" {
  export interface DealTerms {
    property_value: number;
    upfront_payment: number;
    monthly_payment: number;
    number_of_payments: number;
    payback_window_start_year: number;
    payback_window_end_year: number;
    timing_factor_early: number;
    timing_factor_late: number;
    floor_multiple: number;
    ceiling_multiple: number;
    downside_mode: "HARD_FLOOR" | "NO_FLOOR";
    contract_maturity_years: number;
    liquidity_trigger_year: number;
    minimum_hold_years: number;
    platform_fee: number;
    servicing_fee_monthly: number;
    exit_fee_pct: number;
    duration_yield_floor_enabled?: boolean;
    duration_yield_floor_start_year?: number | null;
    duration_yield_floor_min_multiple?: number | null;
    realtor_representation_mode: "BUYER" | "SELLER" | "DUAL" | "NONE";
    realtor_commission_pct: number;
    realtor_commission_payment_mode: "PER_PAYMENT_EVENT";
  }

  export interface ScenarioAssumptions {
    annual_appreciation: number;
    closing_cost_pct: number;
    exit_year: number;
    fmv_override?: number;
  }

  export interface DealResults {
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
    investor_profit: number;
    investor_multiple: number;
    investor_irr_annual: number;
    realtor_fee_total_projected: number;
    realtor_fee_upfront_projected: number;
    realtor_fee_installments_projected: number;
    buyer_realtor_fee_total_projected: number;
    seller_realtor_fee_total_projected: number;
    investor_irr_annual_net: number | null;
    compute_version: string;
  }

  export function computeDeal(
    terms: DealTerms,
    assumptions: ScenarioAssumptions,
  ): DealResults;

  export const COMPUTE_VERSION: string;

  export function roundMoney(n: number): number;
  export function roundIRRMonthly(n: number): number;
  export function roundIRRAnnual(n: number): number;
  export function computeIRR(cashflows: number[]): number;
  export function solveMonthlyIRR(cashflows: number[]): number;
  export function annualizeIRR(monthly: number): number;
}
