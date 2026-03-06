// src/lib/defaultScenario.ts
// App repo boundary: no imports from @fractpath/compute. Use local structural types.

export type DealTerms = {
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

  duration_yield_floor_enabled: boolean;
  duration_yield_floor_start_year: number | null;
  duration_yield_floor_min_multiple: number | null;
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
    property_value: 500000,
    upfront_payment: 50000,
    monthly_payment: 0,
    number_of_payments: 0,

    payback_window_start_year: 3,
    payback_window_end_year: 7,
    timing_factor_early: 0.5,
    timing_factor_late: 1.5,

    floor_multiple: 1.0,
    ceiling_multiple: 3.0,
    downside_mode: "HARD_FLOOR",

    contract_maturity_years: 10,
    liquidity_trigger_year: 5,
    minimum_hold_years: 2,

    platform_fee: 0,
    servicing_fee_monthly: 0,
    exit_fee_pct: 0,

    duration_yield_floor_enabled: false,
    duration_yield_floor_start_year: null,
    duration_yield_floor_min_multiple: null,
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
