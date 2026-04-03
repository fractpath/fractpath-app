/**
 * Shared buyout projection helpers.
 *
 * These functions derive projected buyout values from accepted agreement
 * economics. They are intentionally app-side projections — they model
 * scheduled payment assumptions, not reconciled payment history.
 *
 * Both DraftDealProjectionPanel and AcceptedDealStatusPanel import from here.
 */

// ─── Contracted deal size ─────────────────────────────────────────────────────

/**
 * Contracted deal size: the total capital commitment under the agreement.
 *
 *   contractedDealSize = upfront_payment + (monthly_payment × number_of_payments)
 *
 * This is the correct base for setup fee calculation — not property value.
 */
export function computeContractedDealSize(
  upfrontPayment: number,
  monthlyPayment: number,
  numberOfPayments: number,
): number {
  return upfrontPayment + monthlyPayment * numberOfPayments;
}

// ─── Setup fee ────────────────────────────────────────────────────────────────

/**
 * App-side setup fee computation: percent of contracted deal size, with
 * floor and cap.
 *
 *   contractedDealSize = upfront_payment + (monthly_payment × number_of_payments)
 *   setupFeeAmount     = clamp( contractedDealSize × feePct, feeFloor, feeCap )
 *
 * Used as an app-side derivation when the engine result field
 * `fractpath_setup_fee_amount` is not populated (e.g. pre-compute drafts).
 * When the engine result IS available and > 0, prefer that value.
 *
 * NOTE: The base is contracted deal size (total deal cash), NOT property value.
 */
export function computeSetupFee(
  contractedDealSize: number,
  feePct: number,
  feeFloor: number,
  feeCap: number,
): number {
  const raw = contractedDealSize * feePct;
  return Math.min(Math.max(raw, feeFloor), feeCap);
}

// ─── Modeled funding to date ──────────────────────────────────────────────────

/**
 * Modeled buyer funding to date at month m under scheduled payment assumptions.
 *
 *   fundedToDate(m) = upfront_payment + monthly_payment × min(m, number_of_payments)
 *
 * Month 0: upfront only.
 * Months 1…number_of_payments: adds one monthly installment per month.
 * Months > number_of_payments: no additional payments — funding is complete.
 *
 * This models scheduled payments, NOT actual posted payment history.
 */
export function modeledFundingToDate(
  upfrontPayment: number,
  monthlyPayment: number,
  numberOfPayments: number,
  month: number,
): number {
  return upfrontPayment + monthlyPayment * Math.min(month, numberOfPayments);
}

// ─── Extension window identification ─────────────────────────────────────────

/**
 * Extension window configuration — all year values are fractional.
 * null start/end means that extension period is not explicitly configured.
 */
export type ExtensionWindowConfig = {
  minimumHoldYears: number;
  targetExitStart: number;
  targetExitEnd: number;
  firstExtStart: number | null;
  firstExtEnd: number | null;
  firstExtPremiumPct: number;
  secondExtStart: number | null;
  secondExtEnd: number | null;
  secondExtPremiumPct: number;
  longStopYear: number;
};

/** Identifies which contract window a given year falls in and the applicable premium. */
function identifyContractWindow(
  yearF: number,
  cfg: ExtensionWindowConfig,
): { label: string; premiumPct: number } {
  if (yearF < cfg.minimumHoldYears) {
    return { label: "Minimum hold", premiumPct: 0 };
  }
  if (yearF >= cfg.targetExitStart && yearF <= cfg.targetExitEnd) {
    return { label: "Target exit window", premiumPct: 0 };
  }
  if (
    cfg.firstExtStart !== null &&
    cfg.firstExtEnd !== null &&
    yearF > cfg.firstExtStart &&
    yearF <= cfg.firstExtEnd
  ) {
    return { label: "First extension", premiumPct: cfg.firstExtPremiumPct };
  }
  if (
    cfg.secondExtStart !== null &&
    cfg.secondExtEnd !== null &&
    yearF > cfg.secondExtStart &&
    yearF <= cfg.secondExtEnd
  ) {
    return { label: "Second extension", premiumPct: cfg.secondExtPremiumPct };
  }
  return { label: "Outside exit window", premiumPct: 0 };
}

// ─── Monthly buyout series ────────────────────────────────────────────────────

export type BuyoutPoint = {
  month: number;
  /** Base buyout before any extension premium. */
  baseBuyout: number;
  /** Extension premium fraction at this month (0 when no premium applies). */
  extensionPremiumPct: number;
  /**
   * Adjusted buyout = baseBuyout × (1 + extensionPremiumPct).
   * Equals baseBuyout when no premium applies.
   */
  buyout: number;
  /** Human-readable contract window label for this month. */
  windowLabel: string;
};

/**
 * Build a monthly projected buyout series from month 0 through
 * `longStopYear × 12`, using month-by-month funding progression.
 *
 * Formula for each month m:
 *   fundedToDate(m)      = upfront_payment + monthly_payment × min(m, number_of_payments)
 *   years                = m / 12
 *   FMV(m)               = property_value × (1 + annual_appreciation)^years
 *   appreciationGain(m)  = max(0, FMV(m) − property_value)
 *   baseBuyout(m)        = fundedToDate(m) + appreciationShare × appreciationGain(m)
 *   premiumPct(m)        = extension premium for the window at year m/12 (0 if no extension config)
 *   adjustedBuyout(m)    = baseBuyout(m) × (1 + premiumPct(m))
 *
 * appreciationShare ← scheduled_buyer_appreciation_share (v11 results, 0–1).
 * This fraction is fixed at the contracted level and does not change monthly.
 *
 * The optional `extensionConfig` enables extension-adjusted buyout values.
 * Without it, baseBuyout = adjustedBuyout (no premium at any month).
 */
export function buildMonthlyBuyoutSeries(
  propertyValue: number,
  annualAppreciation: number,
  upfrontPayment: number,
  monthlyPayment: number,
  numberOfPayments: number,
  appreciationShare: number,
  longStopYear: number,
  extensionConfig?: ExtensionWindowConfig,
): BuyoutPoint[] {
  const totalMonths = Math.max(Math.round(longStopYear * 12), 12);
  const pts: BuyoutPoint[] = [];
  for (let m = 0; m <= totalMonths; m++) {
    const funded = modeledFundingToDate(
      upfrontPayment,
      monthlyPayment,
      numberOfPayments,
      m,
    );
    const years = m / 12;
    const fmv = propertyValue * Math.pow(1 + annualAppreciation, years);
    const gain = Math.max(0, fmv - propertyValue);
    const baseBuyout = funded + appreciationShare * gain;

    let extensionPremiumPct = 0;
    let windowLabel = "";
    if (extensionConfig) {
      const win = identifyContractWindow(years, extensionConfig);
      extensionPremiumPct = win.premiumPct;
      windowLabel = win.label;
    }

    pts.push({
      month: m,
      baseBuyout,
      extensionPremiumPct,
      buyout: baseBuyout * (1 + extensionPremiumPct),
      windowLabel,
    });
  }
  return pts;
}

// ─── Model A realtor fee helpers ─────────────────────────────────────────────

/**
 * Projected total realtor fee under Model A.
 *
 * Realtor commission is applied to each funding disbursement event, not to FMV
 * or appreciation. The projected total is therefore:
 *
 *   projectedRealtorFeeTotal = contractedDealSize × realtor_commission_pct
 *
 * where contractedDealSize = upfront_payment + (monthly_payment × number_of_payments).
 * This should be called with the result of computeContractedDealSize().
 */
export function computeRealtorProjectedTotal(
  contractedDealSize: number,
  commissionPct: number,
): number {
  return contractedDealSize * commissionPct;
}

/**
 * Modeled realtor fee paid to date under Model A at a given month.
 *
 * The realtor is paid at each disbursement event proportional to the funding
 * disbursed. The modeled fee paid to date at month m is:
 *
 *   modeledPaidToDate(m) = fundedToDate(m) × realtor_commission_pct
 *
 * This is modeled from accepted agreement and scheduled payments —
 * not actual servicer-posted payment history.
 */
export function computeRealtorPaidToDate(
  upfrontPayment: number,
  monthlyPayment: number,
  numberOfPayments: number,
  month: number,
  commissionPct: number,
): number {
  return (
    modeledFundingToDate(upfrontPayment, monthlyPayment, numberOfPayments, month) *
    commissionPct
  );
}

// ─── Buyout interpolation ─────────────────────────────────────────────────────

/**
 * Linear interpolation of buyout at a fractional month position.
 * Used for placing the "current position" marker on accepted-deal charts.
 */
export function interpolateBuyoutAtMonth(
  series: BuyoutPoint[],
  fractionalMonth: number,
): number | null {
  if (series.length === 0) return null;
  const clamped = Math.min(
    Math.max(fractionalMonth, 0),
    series[series.length - 1].month,
  );
  const lo = series[Math.floor(clamped)];
  const hi = series[Math.min(Math.ceil(clamped), series.length - 1)];
  if (!lo || !hi) return null;
  const t = clamped - Math.floor(clamped);
  return lo.buyout + t * (hi.buyout - lo.buyout);
}
