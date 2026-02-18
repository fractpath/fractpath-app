/**
 * FractPath calculator deterministic contract.
 * Keep this file stable; other modules (calc, chart, UI, lead payload) depend on it.
 */

export type SettlementTiming = "standard" | "early" | "late";

export type ScenarioInputs = {
  /** Current home value (FMV today) */
  homeValue: number;

  /** Initial Buy Amount (cash advanced to homeowner) */
  initialBuyAmount: number;

  /** Term in years */
  termYears: number;

  /** Expected annual home appreciation rate (g), e.g. 0.03 */
  annualGrowthRate: number;

  /** Transfer Fee rate for settlement timing (applies to payout amount), e.g. 0.035 */
  transferFeeRate_standard: number;
  transferFeeRate_early: number;
  transferFeeRate_late: number;

  /** Floor multiplier (FM): minimum payout = IBA * FM */
  floorMultiple: number;

  /** Cap multiplier (CM): maximum payout = IBA * CM */
  capMultiple: number;

  /**
   * Percent of equity "owned" by buyer over time.
   * Modeled as: upfront + monthly vesting (linear).
   */
  vesting: {
    /** Equity percentage immediately owned at close, e.g. 0.10 for 10% */
    upfrontEquityPct: number;
    /** Equity percentage added per month, e.g. 0.0025 for 0.25%/mo */
    monthlyEquityPct: number;
    /** Total months equity vests over; typically termYears * 12 */
    months: number;
  };

  /**
   * Cost/coverage inputs (CPW), modeled as a percent range of home value,
   * typically used for comparison/bands in the UI (not part of settlement math yet).
   */
  cpw: {
    startPct: number;
    endPct: number;
  };
};

export type TimePoint = {
  /** month index starting at 0 */
  month: number;
  /** year index as float (month / 12) */
  year: number;
  /** projected home value at this point */
  homeValue: number;
  /** cumulative vested equity percentage (0..1) */
  equityPct: number;
};

/**
 * Settlement outputs for a given timing.
 * Payout is clamped by floor/cap, then transfer fee applied to payout amount.
 */
export type SettlementResult = {
  timing: SettlementTiming;

  /** Settlement at month index (0..months) */
  settlementMonth: number;

  /** Home value at settlement */
  homeValueAtSettlement: number;

  /** Equity percent at settlement */
  equityPctAtSettlement: number;

  /** Raw payout before floor/cap and transfer fee: homeValueAtSettlement * equityPctAtSettlement */
  rawPayout: number;

  /** Payout after floor/cap clamp */
  clampedPayout: number;

  /** Transfer fee amount (rate * clampedPayout) */
  transferFeeAmount: number;

  /** Net payout to buyer after transfer fee */
  netPayout: number;

  /** Clamp metadata */
  clamp: {
    floor: number;
    cap: number;
    applied: "none" | "floor" | "cap";
  };

  /** Transfer fee rate used */
  transferFeeRate: number;
};

export type ScenarioOutputs = {
  /** Inputs echoed back after defaults normalization (calc will fill defaults) */
  normalizedInputs: ScenarioInputs;

  /** Vesting / home value time series */
  series: TimePoint[];

  /** Settlement results at three timings */
  settlements: {
    standard: SettlementResult;
    early: SettlementResult;
    late: SettlementResult;
  };
};
