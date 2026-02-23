import { CONTRACT_VERSION, computeScenario } from "fractpath-calculator-widget";

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

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function irrAnnual(invested: number, payout: number, years: number): number {
  if (!(invested > 0) || !(payout > 0) || !(years > 0)) return 0;
  return Math.pow(payout / invested, 1 / years) - 1;
}

/**
 * Canonical compute adapter (App repo).
 *
 * The widget package does not export computeDeal; it exports computeScenario.
 * So we derive canonical v10.2 KPI fields from computeScenario outputs.
 */
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

  // Required for KPI math
  const property_value = num(inputs.deal_terms.property_value);
  const upfront_payment = num(inputs.deal_terms.upfront_payment);
  const exit_year = num(inputs.scenario.exit_year);

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

  let scenarioOut: any;
  try {
    scenarioOut = computeScenario(inputs);
  } catch (e: any) {
    return { ok: false, code: "ERROR", error: e?.message ?? String(e) };
  }

  // computeScenario contract observed:
  // { normalizedInputs, series, settlements }
  const series: any[] = Array.isArray(scenarioOut?.series)
    ? scenarioOut.series
    : [];
  const normalized = isObj(scenarioOut?.normalizedInputs)
    ? scenarioOut.normalizedInputs
    : null;

  // Decide which month to evaluate: scenario.exit_year * 12
  const month = Math.max(0, Math.round(exit_year * 12));
  const row =
    series.find((r) => r && typeof r.month === "number" && r.month === month) ??
    null;

  // Fall back: if series is missing that month, use settlements.standard
  const std = isObj(scenarioOut?.settlements?.standard)
    ? scenarioOut.settlements.standard
    : null;

  const homeValueAtExit =
    num(row?.homeValue) ??
    num(std?.homeValueAtSettlement) ??
    // last resort: use property value as a baseline
    property_value;

  const equityPctAtExit =
    num(row?.equityPct) ??
    num(std?.equityPctAtSettlement) ??
    // last resort: 0 (forces conservative results)
    0;

  // Clamp payout using normalized floor/cap multiples if present.
  const floorMultiple = num(normalized?.floorMultiple) ?? 1;
  const capMultiple = num(normalized?.capMultiple) ?? 999;

  const rawPayout = homeValueAtExit * equityPctAtExit;
  const minPayout = upfront_payment * floorMultiple;
  const maxPayout = upfront_payment * capMultiple;
  const isaSettlement = clamp(rawPayout, minPayout, maxPayout);

  const invested_capital_total = upfront_payment;
  const investor_profit = isaSettlement - invested_capital_total;
  const investor_multiple =
    invested_capital_total > 0 ? isaSettlement / invested_capital_total : 0;
  const investor_irr_annual = irrAnnual(
    invested_capital_total,
    isaSettlement,
    exit_year,
  );

  // Canonical-ish extra fields that downstream UI commonly expects
  const projected_fmv = homeValueAtExit;
  const vested_equity_pct = equityPctAtExit;

  const results: Record<string, unknown> = {
    invested_capital_total,
    projected_fmv,
    isa_settlement: isaSettlement,
    investor_profit,
    investor_multiple,
    investor_irr_annual,
    vested_equity_pct,
  };

  return {
    ok: true,
    result: {
      compute_version: CONTRACT_VERSION,
      results,
    },
  };
}

// Route code imports computeDealAdapter as computeDeal(...)
export const computeDealAdapter = computeDeal;
