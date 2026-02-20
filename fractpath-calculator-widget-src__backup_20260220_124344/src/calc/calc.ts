import type {
  ScenarioInputs,
  ScenarioOutputs,
  SettlementResult,
  SettlementTiming,
  TimePoint
} from "./types.js";

import { DEFAULT_INPUTS } from "./constants.js";
import { computeDeal } from "@fractpath/compute";

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * Normalize inputs:
 * - fills missing fields from DEFAULT_INPUTS
 * - ensures vesting.months = termYears * 12
 */
export function normalizeInputs(partial: Partial<ScenarioInputs>): ScenarioInputs {
  const merged: ScenarioInputs = {
    ...DEFAULT_INPUTS,
    ...partial,
    vesting: {
      ...DEFAULT_INPUTS.vesting,
      ...(partial.vesting ?? {}),
    },
    cpw: {
      ...DEFAULT_INPUTS.cpw,
      ...(partial.cpw ?? {}),
    }
  };

  const months = Math.max(0, Math.round(merged.termYears * 12));
  merged.vesting.months = months;

  return merged;
}

function projectHomeValue(homeValue0: number, annualGrowthRate: number, month: number): number {
  const years = month / 12;
  // continuous-ish monthly compounding via fractional exponent
  return homeValue0 * Math.pow(1 + annualGrowthRate, years);
}

function equityPctAtMonth(upfront: number, monthly: number, month: number): number {
  // linear vesting; clamp to [0, 1]
  return clamp(upfront + monthly * month, 0, 1);
}

function buildSeries(inputs: ScenarioInputs, maxMonth: number): TimePoint[] {
  const series: TimePoint[] = [];
  for (let m = 0; m <= maxMonth; m++) {
    const hv = projectHomeValue(inputs.homeValue, inputs.annualGrowthRate, m);
    const eq = equityPctAtMonth(
      inputs.vesting.upfrontEquityPct,
      inputs.vesting.monthlyEquityPct,
      m
    );

    series.push({
      month: m,
      year: m / 12,
      homeValue: hv,
      equityPct: eq
    });
  }
  return series;
}

function settlementMonthForTiming(inputs: ScenarioInputs, timing: SettlementTiming): number {
  const termMonths = inputs.vesting.months;

  if (timing === "standard") return termMonths;

  // Placeholder per MVP (replace with frozen spec when available)
  if (timing === "early") return Math.min(36, termMonths); // 3 years or earlier if shorter term

  // "late": term + 24 months (2 years) — requires extending the series
  if (timing === "late") return termMonths + 24;

  return termMonths;
}

/**
 * Adapter: map current widget inputs (ScenarioInputs) into canonical compute DealTerms.
 *
 * NOTE: The current widget UI does not collect payment schedule inputs yet.
 * For wiring, we treat initialBuyAmount as an upfront_payment and set monthly_payment=0.
 * This makes settlements canonical (compute) without expanding UI surface area in the same step.
 */
function toDealTerms(inputs: ScenarioInputs) {
  const termMonths = Math.max(0, Math.round(inputs.termYears * 12));

  return {
    property_value: inputs.homeValue,
    upfront_payment: inputs.initialBuyAmount,
    monthly_payment: inputs.vesting.monthlyEquityPct * inputs.homeValue,
    number_of_payments: inputs.vesting.months,

    // Payback window + timing factors:
    // The legacy widget had TF as a transfer fee rate; canonical compute uses timing factor multipliers.
    // Until UI collects these, we default to neutral (1) and place window across the term.
    payback_window_start_year: Math.max(0, Math.floor(inputs.termYears / 3)),
    payback_window_end_year: Math.max(1, Math.ceil((inputs.termYears * 2) / 3)),
    timing_factor_early: 1,
    timing_factor_late: 1,

    floor_multiple: inputs.floorMultiple,
    ceiling_multiple: inputs.capMultiple,

    downside_mode: "HARD_FLOOR" as const,

    // Not currently modeled in widget UI; keep deterministic defaults.
    contract_maturity_years: 30,
    liquidity_trigger_year: 13,
    minimum_hold_years: 2,
    platform_fee: 0,
    servicing_fee_monthly: 0,
    exit_fee_pct: 0,

    // DYF defaults (disabled)
    duration_yield_floor_enabled: false,
    duration_yield_floor_start_year: null,
    duration_yield_floor_min_multiple: null,
  };
}

function toSettlementResult(
  inputs: ScenarioInputs,
  timing: SettlementTiming
): SettlementResult {
  const month = settlementMonthForTiming(inputs, timing);
  const exitYear = month / 12;

  const terms = toDealTerms(inputs);
  const results = computeDeal(terms, {
    annual_appreciation: inputs.annualGrowthRate,
    closing_cost_pct: 0,
    exit_year: exitYear,
  });

  const applied: "none" | "floor" | "cap" =
    results.isa_settlement === results.isa_pre_floor_cap
      ? "none"
      : results.isa_settlement === results.floor_amount
        ? "floor"
        : results.isa_settlement === results.ceiling_amount
          ? "cap"
          : "none";

  // Legacy contract includes "transfer fee" applied to payout.
  // Canonical compute does not model transfer fees yet, so we set them to 0 for now.
  const transferFeeRate = 0;
  const transferFeeAmount = 0;
  const netPayout = results.isa_settlement;

  return {
    timing,
    settlementMonth: month,
    homeValueAtSettlement: results.projected_fmv,
    equityPctAtSettlement: results.vested_equity_percentage,
    rawPayout: results.isa_pre_floor_cap,
    clampedPayout: results.isa_settlement,
    transferFeeAmount,
    netPayout,
    clamp: { floor: results.floor_amount, cap: results.ceiling_amount, applied },
    transferFeeRate,
  };
}

/**
 * Main deterministic engine.
 * Now delegates settlement math to @fractpath/compute (single source of truth).
 */
export function computeScenario(partialInputs: Partial<ScenarioInputs> = {}): ScenarioOutputs {
  const inputs = normalizeInputs(partialInputs);

  // Ensure series covers the furthest settlement month
  const maxMonth = Math.max(
    settlementMonthForTiming(inputs, "standard"),
    settlementMonthForTiming(inputs, "early"),
    settlementMonthForTiming(inputs, "late")
  );

  const series = buildSeries(inputs, maxMonth);

  const standard = toSettlementResult(inputs, "standard");
  const early = toSettlementResult(inputs, "early");
  const late = toSettlementResult(inputs, "late");

  return {
    normalizedInputs: inputs,
    series,
    settlements: { standard, early, late }
  };
}
