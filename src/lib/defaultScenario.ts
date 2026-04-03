// src/lib/defaultScenario.ts
// App repo boundary: no imports from @fractpath/compute. Use local structural types.

import {
  CANONICAL_DEAL_TERM_DEFAULTS,
  CANONICAL_SCENARIO_DEFAULTS,
} from "@/lib/canonicalDefaults";

export type DealTerms = {
  // Core economics
  property_value: number;
  upfront_payment: number;
  monthly_payment: number;
  number_of_payments: number;

  // Lifecycle
  minimum_hold_years: number;
  contract_maturity_years: number;
  target_exit_year: number | null;
  target_exit_window_start_year: number;
  target_exit_window_end_year: number;
  long_stop_year: number;

  // Extension windows
  first_extension_start_year: number | null;
  first_extension_end_year: number | null;
  first_extension_premium_pct: number | null;
  second_extension_start_year: number | null;
  second_extension_end_year: number | null;
  second_extension_premium_pct: number | null;

  // Partial buyout
  partial_buyout_allowed: boolean;
  partial_buyout_min_fraction: number | null;
  partial_buyout_increment_fraction: number | null;

  // Buyer purchase option
  buyer_purchase_option_enabled: boolean;
  buyer_purchase_notice_days: number | null;
  buyer_purchase_closing_days: number | null;

  // Fees
  setup_fee_pct: number | null;
  setup_fee_floor: number | null;
  setup_fee_cap: number | null;
  servicing_fee_monthly: number;
  payment_admin_fee: number | null;
  exit_admin_fee_amount: number;

  // Realtor
  realtor_representation_mode: "BUYER" | "SELLER" | "DUAL" | "NONE";
  realtor_commission_pct: number;

  // Allow extra fields passed through from engine outputs
  [key: string]: unknown;
};

export type ScenarioAssumptions = {
  annual_appreciation: number;
  closing_cost_pct: number;
  exit_year: number;
  fmv_override?: number;
};

export type CanonicalInputs = {
  deal_terms: DealTerms;
  scenario: ScenarioAssumptions;
};

type AnyRecord = Record<string, unknown>;

function isRecord(v: unknown): v is AnyRecord {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function getDefaultScenario(): ScenarioAssumptions {
  return {
    annual_appreciation: CANONICAL_SCENARIO_DEFAULTS.annual_appreciation,
    closing_cost_pct: CANONICAL_SCENARIO_DEFAULTS.closing_cost_pct,
    exit_year: CANONICAL_SCENARIO_DEFAULTS.exit_year,
  };
}

export function getDefaultDealTerms(): DealTerms {
  const D = CANONICAL_DEAL_TERM_DEFAULTS;
  return {
    property_value: D.property_value,
    upfront_payment: D.upfront_payment,
    monthly_payment: D.monthly_payment,
    number_of_payments: D.number_of_payments,

    minimum_hold_years: D.minimum_hold_years,
    contract_maturity_years: D.contract_maturity_years,
    target_exit_year: D.target_exit_year,
    target_exit_window_start_year: D.target_exit_window_start_year,
    target_exit_window_end_year: D.target_exit_window_end_year,
    long_stop_year: D.long_stop_year,

    first_extension_start_year: D.first_extension_start_year,
    first_extension_end_year: D.first_extension_end_year,
    first_extension_premium_pct: D.first_extension_premium_pct,
    second_extension_start_year: D.second_extension_start_year,
    second_extension_end_year: D.second_extension_end_year,
    second_extension_premium_pct: D.second_extension_premium_pct,

    partial_buyout_allowed: D.partial_buyout_allowed,
    partial_buyout_min_fraction: D.partial_buyout_min_fraction,
    partial_buyout_increment_fraction: D.partial_buyout_increment_fraction,

    buyer_purchase_option_enabled: D.buyer_purchase_option_enabled,
    buyer_purchase_notice_days: D.buyer_purchase_notice_days,
    buyer_purchase_closing_days: D.buyer_purchase_closing_days,

    setup_fee_pct: D.setup_fee_pct,
    setup_fee_floor: D.setup_fee_floor,
    setup_fee_cap: D.setup_fee_cap,
    servicing_fee_monthly: D.servicing_fee_monthly,
    payment_admin_fee: D.payment_admin_fee,
    exit_admin_fee_amount: D.exit_admin_fee_amount,

    realtor_representation_mode: D.realtor_representation_mode,
    realtor_commission_pct: D.realtor_commission_pct,
  };
}

/**
 * Defensive normalizer:
 * - Always returns { deal_terms, scenario }
 * - Accepts legacy envelopes where inputs may be nested
 * - Does not attempt schema migrations beyond envelope normalization
 */
export function ensureScenario(inputs: unknown): CanonicalInputs {
  const defaults: CanonicalInputs = {
    deal_terms: getDefaultDealTerms(),
    scenario: getDefaultScenario(),
  };

  if (!isRecord(inputs)) return defaults;

  const root = inputs as AnyRecord;
  const inner =
    isRecord(root.inputs) && root.inputs ? (root.inputs as AnyRecord) : null;

  const dt = (
    isRecord(root.deal_terms) ? root.deal_terms : inner?.deal_terms
  ) as AnyRecord | undefined;
  const sc = (isRecord(root.scenario) ? root.scenario : inner?.scenario) as
    | AnyRecord
    | undefined;

  return {
    deal_terms: dt
      ? { ...defaults.deal_terms, ...(dt as any) }
      : defaults.deal_terms,
    scenario: sc
      ? { ...defaults.scenario, ...(sc as any) }
      : defaults.scenario,
  };
}
