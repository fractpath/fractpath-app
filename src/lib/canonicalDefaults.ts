/**
 * Canonical deal term and scenario defaults.
 * Single source of truth — all normalizers and default seeds import from here.
 * Do NOT duplicate these values elsewhere.
 */

export const CANONICAL_DEAL_TERM_DEFAULTS = {
  // Core economics
  property_value: 500000,
  upfront_payment: 50000,
  monthly_payment: 0,
  number_of_payments: 0,

  // Lifecycle
  minimum_hold_years: 1,
  contract_maturity_years: 30,
  target_exit_year: null as number | null,
  target_exit_window_start_year: 3,
  target_exit_window_end_year: 7,
  long_stop_year: 13,

  // Extension windows — premiums are canonical even when window dates are unset
  first_extension_start_year: null as number | null,
  first_extension_end_year: null as number | null,
  first_extension_premium_pct: 0.06,
  second_extension_start_year: null as number | null,
  second_extension_end_year: null as number | null,
  second_extension_premium_pct: 0.12,

  // Partial buyout
  partial_buyout_allowed: false,
  partial_buyout_min_fraction: null as number | null,
  partial_buyout_increment_fraction: null as number | null,

  // Buyer purchase option
  buyer_purchase_option_enabled: false,
  buyer_purchase_notice_days: null as number | null,
  buyer_purchase_closing_days: null as number | null,

  // Fees — approved canonical contract defaults
  setup_fee_pct: 0.023,
  setup_fee_floor: 1750,
  setup_fee_cap: 18000,
  servicing_fee_monthly: 59,
  payment_admin_fee: 4,
  exit_admin_fee_amount: 4500,

  // Realtor
  realtor_representation_mode: "NONE" as "BUYER" | "SELLER" | "DUAL" | "NONE",
  realtor_commission_pct: 0,
} as const;

export const CANONICAL_SCENARIO_DEFAULTS = {
  annual_appreciation: 0.04,
  closing_cost_pct: 0.06,
  exit_year: 5,
} as const;
