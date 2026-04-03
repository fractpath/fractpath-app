/**
 * Shared buyout projection helpers.
 *
 * These functions derive projected buyout values from accepted agreement
 * economics. They are intentionally app-side projections — they model
 * scheduled payment assumptions, not reconciled payment history.
 *
 * Both DraftDealProjectionPanel and AcceptedDealStatusPanel import from here.
 */

// ─── Setup fee ────────────────────────────────────────────────────────────────

/**
 * App-side setup fee computation: percent-based with floor and cap.
 *
 *   setupFee = clamp( propertyValue × feePct, feeFloor, feeCap )
 *
 * Used as an app-side derivation when the engine result field
 * `fractpath_setup_fee_amount` is not populated (e.g. pre-compute drafts).
 * When the engine result IS available, prefer that value.
 */
export function computeSetupFee(
  propertyValue: number,
  feePct: number,
  feeFloor: number,
  feeCap: number,
): number {
  const raw = propertyValue * feePct;
  return Math.min(Math.max(raw, feeFloor), feeCap);
}

// ─── Monthly buyout series ────────────────────────────────────────────────────

export type BuyoutPoint = { month: number; buyout: number };

/**
 * Build a monthly projected buyout series from month 0 through
 * `longStopYear × 12`.
 *
 * Formula for month m:
 *   years           = m / 12
 *   FMV(m)          = propertyValue × (1 + annualAppreciation)^years
 *   appreciationGain = max(0, FMV(m) − propertyValue)
 *   buyout(m)        = baseFunding + appreciationShare × appreciationGain
 *
 * baseFunding       ← total_scheduled_buyer_funding  (v11 results)
 * appreciationShare ← scheduled_buyer_appreciation_share  (v11 results, 0–1)
 */
export function buildMonthlyBuyoutSeries(
  propertyValue: number,
  annualAppreciation: number,
  baseFunding: number,
  appreciationShare: number,
  longStopYear: number,
): BuyoutPoint[] {
  const totalMonths = Math.max(Math.round(longStopYear * 12), 12);
  const pts: BuyoutPoint[] = [];
  for (let m = 0; m <= totalMonths; m++) {
    const years = m / 12;
    const fmv = propertyValue * Math.pow(1 + annualAppreciation, years);
    const gain = Math.max(0, fmv - propertyValue);
    pts.push({ month: m, buyout: baseFunding + appreciationShare * gain });
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
  const clamped = Math.min(Math.max(fractionalMonth, 0), series[series.length - 1].month);
  const lo = series[Math.floor(clamped)];
  const hi = series[Math.min(Math.ceil(clamped), series.length - 1)];
  if (!lo || !hi) return null;
  const t = clamped - Math.floor(clamped);
  return lo.buyout + t * (hi.buyout - lo.buyout);
}
