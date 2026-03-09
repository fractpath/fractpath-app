import { computeDeal as canonicalComputeDeal, COMPUTE_VERSION } from "@fractpath/compute";

type Ok<T> = { ok: true; result: T };
type Err = {
  ok: false;
  code: "BAD_INPUT" | "NOT_INTEGRATED" | "ERROR";
  error: string;
};

export type CanonicalComputeOk = {
  compute_version: string;
  results: Record<string, unknown>;
};

function isObj(v: any): boolean {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function num(v: any): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

const DEAL_TERMS_DEFAULTS: Record<string, unknown> = {
  monthly_payment: 0,
  number_of_payments: 0,
  payback_window_start_year: 3,
  payback_window_end_year: 7,
  timing_factor_early: 1,
  timing_factor_late: 1,
  floor_multiple: 1.1,
  ceiling_multiple: 2.0,
  downside_mode: "HARD_FLOOR",
  contract_maturity_years: 30,
  liquidity_trigger_year: 13,
  minimum_hold_years: 2,
  platform_fee: 2500,
  servicing_fee_monthly: 20,
  exit_fee_pct: 0.01,
  realtor_representation_mode: "NONE",
  realtor_commission_pct: 0,
  realtor_commission_payment_mode: "PER_PAYMENT_EVENT",
};

const SCENARIO_DEFAULTS: Record<string, unknown> = {
  annual_appreciation: 0.03,
  closing_cost_pct: 0.02,
  exit_year: 5,
};

export async function computeDeal(
  inputs: any,
): Promise<Ok<CanonicalComputeOk> | Err> {
  if (!isObj(inputs)) {
    return { ok: false, code: "BAD_INPUT", error: "inputs must be an object" };
  }
  if (!isObj(inputs.deal_terms)) {
    return { ok: false, code: "BAD_INPUT", error: "deal_terms is required" };
  }
  if (!isObj(inputs.scenario)) {
    return { ok: false, code: "BAD_INPUT", error: "scenario is required" };
  }

  const property_value = num(inputs.deal_terms.property_value);
  const upfront_payment = num(inputs.deal_terms.upfront_payment);
  const exit_year = num(inputs.scenario.exit_year ?? SCENARIO_DEFAULTS.exit_year);

  if (property_value === null) {
    return {
      ok: false,
      code: "BAD_INPUT",
      error: "deal_terms.property_value is required",
    };
  }
  if (upfront_payment === null) {
    return {
      ok: false,
      code: "BAD_INPUT",
      error: "deal_terms.upfront_payment is required",
    };
  }
  if (exit_year === null) {
    return {
      ok: false,
      code: "BAD_INPUT",
      error: "scenario.exit_year is required",
    };
  }

  const terms: Record<string, unknown> = {
    ...DEAL_TERMS_DEFAULTS,
    ...inputs.deal_terms,
  };

  if (terms.realtor_commission_payment_mode !== "PER_PAYMENT_EVENT") {
    terms.realtor_commission_payment_mode = "PER_PAYMENT_EVENT";
  }

  const scenario: Record<string, unknown> = {
    ...SCENARIO_DEFAULTS,
    ...inputs.scenario,
  };

  let dealResults: any;
  try {
    dealResults = canonicalComputeDeal(terms as any, scenario as any);
  } catch (e: any) {
    return { ok: false, code: "ERROR", error: e?.message ?? String(e) };
  }

  const results: Record<string, unknown> = {
    invested_capital_total: dealResults.invested_capital_total,
    projected_fmv: dealResults.projected_fmv,
    isa_settlement: dealResults.isa_settlement,
    investor_profit: dealResults.investor_profit,
    investor_multiple: dealResults.investor_multiple,
    investor_irr_annual: dealResults.investor_irr_annual,
    investor_irr_annual_net: dealResults.investor_irr_annual_net,

    vested_equity_percentage: dealResults.vested_equity_percentage,
    vested_equity_pct: dealResults.vested_equity_percentage,

    base_equity_value: dealResults.base_equity_value,
    floor_amount: dealResults.floor_amount,
    ceiling_amount: dealResults.ceiling_amount,
    isa_pre_floor_cap: dealResults.isa_pre_floor_cap,
    gain_above_capital: dealResults.gain_above_capital,
    timing_factor_applied: dealResults.timing_factor_applied,

    isa_standard_pre_dyf: dealResults.isa_standard_pre_dyf,
    dyf_floor_amount: dealResults.dyf_floor_amount,
    dyf_applied: dealResults.dyf_applied,

    realtor_fee_total_projected: dealResults.realtor_fee_total_projected,
    realtor_fee_upfront_projected: dealResults.realtor_fee_upfront_projected,
    realtor_fee_installments_projected: dealResults.realtor_fee_installments_projected,
    buyer_realtor_fee_total_projected: dealResults.buyer_realtor_fee_total_projected,
    seller_realtor_fee_total_projected: dealResults.seller_realtor_fee_total_projected,

    annual_appreciation: num(inputs.scenario.annual_appreciation) ?? 0.03,

    compute_version: dealResults.compute_version ?? COMPUTE_VERSION,
  };

  return {
    ok: true,
    result: {
      compute_version: dealResults.compute_version ?? COMPUTE_VERSION,
      results,
    },
  };
}

export const computeDealAdapter = computeDeal;
