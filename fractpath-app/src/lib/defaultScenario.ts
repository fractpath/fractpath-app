// src/lib/defaultScenario.ts
import type { DealTerms, ScenarioAssumptions } from "@fractpath/compute";

type CanonicalInputs = {
  deal_terms: DealTerms;
  scenario: ScenarioAssumptions;
};

type AnyRecord = Record<string, unknown>;

function isRecord(v: unknown): v is AnyRecord {
  return v !== null && typeof v === "object" && Array.isArray(v) === false;
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim().length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  return null;
}

function pickNumber(obj: AnyRecord, ...keys: string[]): number | null {
  for (const k of keys) {
    if (k in obj) {
      const n = toNum(obj[k]);
      if (n !== null) return n;
    }
  }
  return null;
}

function pickString(obj: AnyRecord, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

export function getDefaultScenario(): ScenarioAssumptions {
  // Keep these “realistic but tame” so a brand-new deal always computes cleanly.
  return {
    annual_appreciation: 0.03,
    closing_cost_pct: 0.06,
    exit_year: 5,
  };
}


export function getDefaultDealTerms(): DealTerms {
  // Important constraint: property_value must be > 0 for canonical compute (division in vesting).
  // Keep monthly_payment / number_of_payments at 0 by default to avoid accidental “payment-plan” dynamics.
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

    // Optional v10 DYF fields (explicitly set for stable JSON + clear intent)
    duration_yield_floor_enabled: false,
    duration_yield_floor_start_year: null,
    duration_yield_floor_min_multiple: null,
  };
}

/**
 * Canonical envelope normalizer.
 *
 * Goals:
 * - Always return { deal_terms, scenario } where both are objects.
 * - Fill missing fields with v10 defaults.
 * - (Best-effort) map known legacy key aliases into canonical v10 keys.
 *
 * Non-goals:
 * - No math here.
 * - No silent schema drift: we only map a small, explicit alias set.
 */
export function ensureScenario(inputs: unknown): CanonicalInputs {
  const defaults: CanonicalInputs = {
    deal_terms: getDefaultDealTerms(),
    scenario: getDefaultScenario(),
  };

  if (!isRecord(inputs)) return defaults;

  const inObj = inputs as AnyRecord;

  const rawDealTerms = isRecord(inObj.deal_terms)
    ? (inObj.deal_terms as AnyRecord)
    : isRecord(inObj.inputs) && isRecord((inObj.inputs as AnyRecord).deal_terms)
      ? ((inObj.inputs as AnyRecord).deal_terms as AnyRecord)
      : null;
  const rawScenario = isRecord(inObj.scenario)
    ? (inObj.scenario as AnyRecord)
    : isRecord(inObj.inputs) && isRecord((inObj.inputs as AnyRecord).scenario)
      ? ((inObj.inputs as AnyRecord).scenario as AnyRecord)
      : isRecord((inObj as AnyRecord).assumptions)
        ? ((inObj as AnyRecord).assumptions as AnyRecord)
        : null;

  const dtSrc: AnyRecord =
    rawDealTerms ??
    (isRecord(inObj.deal_terms) ? (inObj.deal_terms as AnyRecord) : {});
  const scSrc: AnyRecord = rawScenario ?? {};

  // ---- DealTerms (v10) ----
  // Legacy aliases we’ve seen:
  // - home_value -> property_value
  // - investment_amount -> upfront_payment
  // - term_years -> contract_maturity_years
  // You can extend this list, but keep it explicit.
  const property_value =
    pickNumber(dtSrc, "property_value", "home_value", "fmv", "homePrice") ??
    defaults.deal_terms.property_value;

  const upfront_payment =
    pickNumber(
      dtSrc,
      "upfront_payment",
      "investment_amount",
      "upfront",
      "initial_investment",
    ) ?? defaults.deal_terms.upfront_payment;

  const monthly_payment =
    pickNumber(dtSrc, "monthly_payment", "monthly", "payment_monthly") ??
    defaults.deal_terms.monthly_payment;

  const number_of_payments =
    pickNumber(dtSrc, "number_of_payments", "payments", "num_payments") ??
    defaults.deal_terms.number_of_payments;

  const payback_window_start_year =
    pickNumber(dtSrc, "payback_window_start_year", "payback_start_year") ??
    defaults.deal_terms.payback_window_start_year;

  const payback_window_end_year =
    pickNumber(dtSrc, "payback_window_end_year", "payback_end_year") ??
    defaults.deal_terms.payback_window_end_year;

  const timing_factor_early =
    pickNumber(dtSrc, "timing_factor_early") ??
    defaults.deal_terms.timing_factor_early;

  const timing_factor_late =
    pickNumber(dtSrc, "timing_factor_late") ??
    defaults.deal_terms.timing_factor_late;

  const floor_multiple =
    pickNumber(dtSrc, "floor_multiple") ?? defaults.deal_terms.floor_multiple;

  const ceiling_multiple =
    pickNumber(dtSrc, "ceiling_multiple") ??
    defaults.deal_terms.ceiling_multiple;

  const downside_modeRaw =
    pickString(dtSrc, "downside_mode") ?? defaults.deal_terms.downside_mode;
  const downside_mode: DealTerms["downside_mode"] =
    downside_modeRaw === "NO_FLOOR" ? "NO_FLOOR" : "HARD_FLOOR";

  const contract_maturity_years =
    pickNumber(
      dtSrc,
      "contract_maturity_years",
      "term_years",
      "duration_years",
    ) ?? defaults.deal_terms.contract_maturity_years;

  const liquidity_trigger_year =
    pickNumber(dtSrc, "liquidity_trigger_year") ??
    defaults.deal_terms.liquidity_trigger_year;

  const minimum_hold_years =
    pickNumber(dtSrc, "minimum_hold_years") ??
    defaults.deal_terms.minimum_hold_years;

  const platform_fee =
    pickNumber(dtSrc, "platform_fee") ?? defaults.deal_terms.platform_fee;

  const servicing_fee_monthly =
    pickNumber(dtSrc, "servicing_fee_monthly") ??
    defaults.deal_terms.servicing_fee_monthly;

  const exit_fee_pct =
    pickNumber(dtSrc, "exit_fee_pct") ?? defaults.deal_terms.exit_fee_pct;

  const duration_yield_floor_enabled = (toBool(
    dtSrc.duration_yield_floor_enabled,
  ) ?? defaults.deal_terms.duration_yield_floor_enabled) as boolean;

  const duration_yield_floor_start_year =
    dtSrc.duration_yield_floor_start_year === null
      ? null
      : (pickNumber(dtSrc, "duration_yield_floor_start_year") ??
        defaults.deal_terms.duration_yield_floor_start_year ??
        null);

  const duration_yield_floor_min_multiple =
    dtSrc.duration_yield_floor_min_multiple === null
      ? null
      : (pickNumber(dtSrc, "duration_yield_floor_min_multiple") ??
        defaults.deal_terms.duration_yield_floor_min_multiple ??
        null);

  const deal_terms: DealTerms = {
    property_value,
    upfront_payment,
    monthly_payment,
    number_of_payments,
    payback_window_start_year: Math.max(0, payback_window_start_year),
    payback_window_end_year: Math.max(0, payback_window_end_year),
    timing_factor_early,
    timing_factor_late,
    floor_multiple,
    ceiling_multiple,
    downside_mode,
    contract_maturity_years: Math.max(0, contract_maturity_years),
    liquidity_trigger_year: Math.max(0, liquidity_trigger_year),
    minimum_hold_years: Math.max(0, minimum_hold_years),
    platform_fee,
    servicing_fee_monthly,
    exit_fee_pct,
    duration_yield_floor_enabled,
    duration_yield_floor_start_year,
    duration_yield_floor_min_multiple,
  };

  // ---- Scenario (v10) ----
  const annual_appreciation =
    pickNumber(
      scSrc,
      "annual_appreciation",
      "appreciation",
      "appreciation_rate",
    ) ?? defaults.scenario.annual_appreciation;

  const closing_cost_pct =
    pickNumber(
      scSrc,
      "closing_cost_pct",
      "closing_costs_pct",
      "closing_cost",
    ) ?? defaults.scenario.closing_cost_pct;

  const exit_year =
    pickNumber(scSrc, "exit_year", "exitYear", "hold_years", "hold_year") ??
    defaults.scenario.exit_year;

  const fmv_override =
    scSrc.fmv_override === null
      ? null
      : (pickNumber(scSrc, "fmv_override", "fmvOverride") ??
        defaults.scenario.fmv_override ??
        null);

  const scenario: ScenarioAssumptions = {
    annual_appreciation,
    closing_cost_pct,
    exit_year,
    fmv_override: (fmv_override ?? undefined),
  };

  return { deal_terms, scenario };
}
