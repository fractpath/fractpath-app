import {
  computeDeal as canonicalComputeDeal,
  COMPUTE_VERSION,
} from "@fractpath/compute";
import {
  CANONICAL_DEAL_TERM_DEFAULTS,
  CANONICAL_SCENARIO_DEFAULTS,
} from "@/lib/canonicalDefaults";

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

// Internal engine-compat defaults: the installed engine requires these structural fields.
// These are NOT part of the public v11 DealTerms interface — callers do not need to supply them.
// v10 timing/floor/cap fields are kept internally so the engine computes correctly.
const ENGINE_COMPAT_DEFAULTS: Record<string, unknown> = {
  monthly_payment: CANONICAL_DEAL_TERM_DEFAULTS.monthly_payment,
  number_of_payments: CANONICAL_DEAL_TERM_DEFAULTS.number_of_payments,
  // v10 structural fields (engine internal — not part of v11 public interface)
  payback_window_start_year: 3,
  payback_window_end_year: 7,
  timing_factor_early: 1,
  timing_factor_late: 1,
  floor_multiple: 1.1,
  ceiling_multiple: 2.0,
  downside_mode: "HARD_FLOOR",
  contract_maturity_years: CANONICAL_DEAL_TERM_DEFAULTS.contract_maturity_years,
  liquidity_trigger_year: CANONICAL_DEAL_TERM_DEFAULTS.long_stop_year,
  minimum_hold_years: CANONICAL_DEAL_TERM_DEFAULTS.minimum_hold_years,
  // Canonical fee defaults
  setup_fee_pct: CANONICAL_DEAL_TERM_DEFAULTS.setup_fee_pct,
  setup_fee_floor: CANONICAL_DEAL_TERM_DEFAULTS.setup_fee_floor,
  setup_fee_cap: CANONICAL_DEAL_TERM_DEFAULTS.setup_fee_cap,
  servicing_fee_monthly: CANONICAL_DEAL_TERM_DEFAULTS.servicing_fee_monthly,
  payment_admin_fee: CANONICAL_DEAL_TERM_DEFAULTS.payment_admin_fee,
  exit_admin_fee_amount: CANONICAL_DEAL_TERM_DEFAULTS.exit_admin_fee_amount,
  first_extension_premium_pct: CANONICAL_DEAL_TERM_DEFAULTS.first_extension_premium_pct,
  second_extension_premium_pct: CANONICAL_DEAL_TERM_DEFAULTS.second_extension_premium_pct,
  // v10 legacy fee fields (zero — canonical fees are handled via v11 fields above)
  platform_fee: 0,
  exit_fee_pct: 0,
  // Realtor
  realtor_representation_mode: CANONICAL_DEAL_TERM_DEFAULTS.realtor_representation_mode,
  realtor_commission_pct: CANONICAL_DEAL_TERM_DEFAULTS.realtor_commission_pct,
  realtor_commission_payment_mode: "PER_PAYMENT_EVENT",
};

const SCENARIO_DEFAULTS: Record<string, unknown> = {
  annual_appreciation: CANONICAL_SCENARIO_DEFAULTS.annual_appreciation,
  closing_cost_pct: CANONICAL_SCENARIO_DEFAULTS.closing_cost_pct,
  exit_year: CANONICAL_SCENARIO_DEFAULTS.exit_year,
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
  const exit_year = num(
    inputs.scenario.exit_year ?? SCENARIO_DEFAULTS.exit_year,
  );

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

  // Merge: engine-compat defaults → canonical v11 caller-supplied terms (caller wins)
  const terms: Record<string, unknown> = {
    ...ENGINE_COMPAT_DEFAULTS,
    ...inputs.deal_terms,
    // Enforce payment mode to satisfy the engine
    realtor_commission_payment_mode: "PER_PAYMENT_EVENT",
  };

  const scenario: Record<string, unknown> = {
    ...SCENARIO_DEFAULTS,
    ...inputs.scenario,
  };

  let engineOutput: any;
  try {
    engineOutput = canonicalComputeDeal(terms as any, scenario as any);
  } catch (e: any) {
    return { ok: false, code: "ERROR", error: e?.message ?? String(e) };
  }

  // Pass through all engine results directly.
  // The engine is expected to return v11-shaped result fields.
  const computeVersion: string =
    typeof engineOutput.compute_version === "string"
      ? engineOutput.compute_version
      : COMPUTE_VERSION;

  return {
    ok: true,
    result: {
      compute_version: computeVersion,
      results: {
        ...(isObj(engineOutput) ? engineOutput : {}),
        compute_version: computeVersion,
      },
    },
  };
}

export const computeDealAdapter = computeDeal;
