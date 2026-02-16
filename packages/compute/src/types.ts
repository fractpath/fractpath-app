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
  isa_pre_floor_cap: number;
  floor_amount: number;
  ceiling_amount: number;
  isa_settlement: number;
  dyf_floor_amount: number;
  dyf_applied: boolean;
  investor_profit: number;
  investor_multiple: number;
  investor_irr_annual: number;
  compute_version: string;
}
