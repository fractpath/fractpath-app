declare module "@fractpath/compute" {
  // v11 deal terms — v10 fields (floor_multiple, timing_factor_*, exit_fee_pct, etc.) removed.
  // The compute adapter supplies v10 engine-compat defaults internally via `as any`.
  export interface DealTerms {
    property_value: number;
    upfront_payment: number;
    monthly_payment: number;
    number_of_payments: number;

    // Lifecycle
    minimum_hold_years: number;
    contract_maturity_years: number;
    target_exit_year?: number | null;
    target_exit_window_start_year?: number;
    target_exit_window_end_year?: number;
    long_stop_year?: number;

    // Extension windows
    first_extension_start_year?: number | null;
    first_extension_end_year?: number | null;
    first_extension_premium_pct?: number | null;
    second_extension_start_year?: number | null;
    second_extension_end_year?: number | null;
    second_extension_premium_pct?: number | null;

    // Partial buyout
    partial_buyout_allowed?: boolean;
    partial_buyout_min_fraction?: number | null;
    partial_buyout_increment_fraction?: number | null;

    // Buyer purchase option
    buyer_purchase_option_enabled?: boolean;
    buyer_purchase_notice_days?: number | null;
    buyer_purchase_closing_days?: number | null;

    // Fees (v11)
    setup_fee_pct?: number | null;
    setup_fee_floor?: number | null;
    setup_fee_cap?: number | null;
    servicing_fee_monthly?: number;
    payment_admin_fee?: number | null;
    exit_admin_fee_amount?: number;

    // Realtor
    realtor_representation_mode: "BUYER" | "SELLER" | "DUAL" | "NONE";
    realtor_commission_pct: number;
  }

  export interface ScenarioAssumptions {
    annual_appreciation: number;
    closing_cost_pct: number;
    exit_year: number;
    fmv_override?: number;
  }

  // v11 result shape.
  // Note: the installed engine is v10; the adapter maps v10 outputs to these v11 field names.
  export interface DealResults {
    // Funding
    total_scheduled_buyer_funding: number;
    actual_buyer_funding_to_date: number;
    funding_completion_factor: number;

    // Appreciation shares
    scheduled_buyer_appreciation_share: number;
    effective_buyer_appreciation_share: number;
    buyer_base_capital_component: number;
    buyer_appreciation_claim: number;

    // Valuation
    current_contract_value: number;
    current_participation_value: number;

    // Buyout amounts
    base_buyout_amount: number;
    extension_adjusted_buyout_amount: number;
    partial_buyout_amount_25: number;
    partial_buyout_amount_50: number;
    partial_buyout_amount_75: number;
    discount_purchase_price: number;

    // Window / lifecycle
    current_window: string | null;

    // Fees
    fractpath_setup_fee_amount: number;
    fractpath_revenue_to_date: number;
    realtor_fee_total_projected: number;

    // Meta
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
