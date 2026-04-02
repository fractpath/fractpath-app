// src/lib/defaultScenario.ts
// App repo boundary: no imports from @fractpath/compute. Use local structural types.

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

  // Allow extra fields passed through from v10 snapshots (handled by computeAdapter defaults)
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
    annual_appreciation: 0.03,
    closing_cost_pct: 0.06,
    exit_year: 5,
  };
}

export function getDefaultDealTerms(): DealTerms {
  return {
    // Core economics
    property_value: 500000,
    upfront_payment: 50000,
    monthly_payment: 0,
    number_of_payments: 0,

    // Lifecycle
    minimum_hold_years: 2,
    contract_maturity_years: 30,
    target_exit_year: null,
    target_exit_window_start_year: 3,
    target_exit_window_end_year: 7,
    long_stop_year: 13,

    // Extension windows
    first_extension_start_year: null,
    first_extension_end_year: null,
    first_extension_premium_pct: null,
    second_extension_start_year: null,
    second_extension_end_year: null,
    second_extension_premium_pct: null,

    // Partial buyout
    partial_buyout_allowed: false,
    partial_buyout_min_fraction: null,
    partial_buyout_increment_fraction: null,

    // Buyer purchase option
    buyer_purchase_option_enabled: false,
    buyer_purchase_notice_days: null,
    buyer_purchase_closing_days: null,

    // Fees
    setup_fee_pct: null,
    setup_fee_floor: null,
    setup_fee_cap: null,
    servicing_fee_monthly: 0,
    payment_admin_fee: null,
    exit_admin_fee_amount: 0,

    // Realtor
    realtor_representation_mode: "NONE",
    realtor_commission_pct: 0,
  };
}

/**
 * Defensive normalizer:
 * - Always returns { deal_terms, scenario }
 * - Accepts legacy envelopes where inputs may be nested
 * - Does not attempt schema migrations beyond envelope normalization
 * - v10 fields not set here; computeAdapter supplies its own v10 defaults for engine compat
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
