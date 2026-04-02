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

function safeNum(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

// Internal engine-compat defaults: the installed engine is v10 and requires these fields.
// These are NOT part of the public v11 DealTerms interface — callers do not need to supply them.
const V10_ENGINE_COMPAT_DEFAULTS: Record<string, unknown> = {
  monthly_payment: 0,
  number_of_payments: 0,
  // v10 timing / floor / cap fields (engine internal — not part of v11 interface)
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
  // v10 fee fields
  platform_fee: 0,
  servicing_fee_monthly: 0,
  exit_fee_pct: 0,
  // Realtor
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

  // Merge: v10 engine compat defaults → v11 caller-supplied terms (caller wins)
  const terms: Record<string, unknown> = {
    ...V10_ENGINE_COMPAT_DEFAULTS,
    ...inputs.deal_terms,
    // Enforce payment mode to satisfy v10 engine
    realtor_commission_payment_mode: "PER_PAYMENT_EVENT",
  };

  const scenario: Record<string, unknown> = {
    ...SCENARIO_DEFAULTS,
    ...inputs.scenario,
  };

  let v10Raw: any;
  try {
    v10Raw = canonicalComputeDeal(terms as any, scenario as any);
  } catch (e: any) {
    return { ok: false, code: "ERROR", error: e?.message ?? String(e) };
  }

  // -----------------------------------------------------------------------
  // Project v11 result shape from v10 engine output.
  //
  // The installed engine returns v10 fields (isa_settlement, invested_capital_total, etc.).
  // We map them to the v11 semantic names so the app boundary is v11-clean.
  // This translation layer will be replaced when the v11 engine is installed.
  // -----------------------------------------------------------------------

  const capitalTotal = safeNum(v10Raw.invested_capital_total);
  const settlement = safeNum(v10Raw.isa_settlement);
  const equity = safeNum(v10Raw.base_equity_value);
  const gainAbove = safeNum(v10Raw.gain_above_capital);
  const realtorFee = safeNum(v10Raw.realtor_fee_total_projected);
  const computeVersion: string =
    typeof v10Raw.compute_version === "string"
      ? v10Raw.compute_version
      : COMPUTE_VERSION;

  const results: Record<string, unknown> = {
    // Funding
    total_scheduled_buyer_funding: capitalTotal,
    actual_buyer_funding_to_date: capitalTotal,
    funding_completion_factor: capitalTotal > 0 ? 1.0 : 0,

    // Appreciation shares
    scheduled_buyer_appreciation_share: equity,
    effective_buyer_appreciation_share: equity,
    buyer_base_capital_component: capitalTotal,
    buyer_appreciation_claim: gainAbove,

    // Valuation
    current_contract_value: settlement,
    current_participation_value: equity,

    // Buyout amounts
    base_buyout_amount: settlement,
    extension_adjusted_buyout_amount: settlement,
    partial_buyout_amount_25: Math.round(settlement * 0.25 * 100) / 100,
    partial_buyout_amount_50: Math.round(settlement * 0.50 * 100) / 100,
    partial_buyout_amount_75: Math.round(settlement * 0.75 * 100) / 100,
    discount_purchase_price: settlement,

    // Window (v10 engine has no window concept)
    current_window: null,

    // Fees
    fractpath_setup_fee_amount: 0,
    fractpath_revenue_to_date: 0,
    realtor_fee_total_projected: realtorFee,

    // Meta
    annual_appreciation: num(inputs.scenario.annual_appreciation) ?? 0.03,
    compute_version: computeVersion,
  };

  return {
    ok: true,
    result: {
      compute_version: computeVersion,
      results,
    },
  };
}

export const computeDealAdapter = computeDeal;
