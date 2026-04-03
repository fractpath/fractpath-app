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
 * When the engine result IS available, prefer that value.
 *
 * NOTE: The base is contracted deal size, NOT property value.
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

// ─── Monthly buyout series ────────────────────────────────────────────────────

export type BuyoutPoint = { month: number; buyout: number };

/**
 * Build a monthly projected buyout series from month 0 through
 * `longStopYear × 12`, using month-by-month funding progression.
 *
 * Formula for month m:
 *   fundedToDate(m)     = upfront_payment + monthly_payment × min(m, number_of_payments)
 *   years               = m / 12
 *   FMV(m)              = property_value × (1 + annual_appreciation)^years
 *   appreciationGain(m) = max(0, FMV(m) − property_value)
 *   buyout(m)           = fundedToDate(m) + appreciationShare × appreciationGain(m)
 *
 * appreciationShare ← scheduled_buyer_appreciation_share (v11 results, 0–1).
 * This fraction is fixed at the contracted level and does not change monthly.
 *
 * Correction vs. previous implementation:
 *   - Old: used a constant baseFunding (= total_scheduled_buyer_funding) at every month.
 *   - New: uses fundedToDate(m) so the principal component grows as installments
 *     are paid, reflecting the modeled payment schedule correctly.
 */
export function buildMonthlyBuyoutSeries(
  propertyValue: number,
  annualAppreciation: number,
  upfrontPayment: number,
  monthlyPayment: number,
  numberOfPayments: number,
  appreciationShare: number,
  longStopYear: number,
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
    pts.push({ month: m, buyout: funded + appreciationShare * gain });
  }
  return pts;
}

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
