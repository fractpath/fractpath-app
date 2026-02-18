import type { ScenarioInputs } from "./types.js";

/**
 * Default constants (MVP).
 * Replace these values with the frozen spec numbers from marketing-homepage-spec.md
 * when you wire the engine to the canonical spec.
 */

// Growth rate (g)
export const DEFAULT_ANNUAL_GROWTH_RATE = 0.03;

// Transfer fee rates (TF) by settlement timing
export const DEFAULT_TF_STANDARD = 0.035;
export const DEFAULT_TF_EARLY = 0.045;
export const DEFAULT_TF_LATE = 0.025;

// Floor/Cap multiples
export const DEFAULT_FLOOR_MULTIPLE = 1.10;
export const DEFAULT_CAP_MULTIPLE = 2.00;

// CPW range (percent of home value)
export const DEFAULT_CPW_START_PCT = 0.01;
export const DEFAULT_CPW_END_PCT = 0.03;

// Vesting defaults (equity over time)
export const DEFAULT_UPFRONT_EQUITY_PCT = 0.10;
export const DEFAULT_MONTHLY_EQUITY_PCT = 0.0025;

/**
 * Minimal baseline inputs for immediate render in the widget.
 * The UI can override these; calc.ts will normalize if callers pass partials later.
 */
export const DEFAULT_INPUTS: ScenarioInputs = {
  homeValue: 600_000,
  initialBuyAmount: 100_000,
  termYears: 10,
  annualGrowthRate: DEFAULT_ANNUAL_GROWTH_RATE,

  transferFeeRate_standard: DEFAULT_TF_STANDARD,
  transferFeeRate_early: DEFAULT_TF_EARLY,
  transferFeeRate_late: DEFAULT_TF_LATE,

  floorMultiple: DEFAULT_FLOOR_MULTIPLE,
  capMultiple: DEFAULT_CAP_MULTIPLE,

  vesting: {
    upfrontEquityPct: DEFAULT_UPFRONT_EQUITY_PCT,
    monthlyEquityPct: DEFAULT_MONTHLY_EQUITY_PCT,
    months: 10 * 12
  },

  cpw: {
    startPct: DEFAULT_CPW_START_PCT,
    endPct: DEFAULT_CPW_END_PCT
  }
};
