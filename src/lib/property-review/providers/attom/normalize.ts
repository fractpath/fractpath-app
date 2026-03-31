/**
 * ATTOM enhanced screening normalizer.
 *
 * Maps a raw AttomRawComposite (three merged ATTOM API responses) into the
 * canonical NormalizedScreeningResult shape defined in screening.ts.
 *
 * Endpoint usage / debt signal priority:
 *   1. /valuation/homeequity  → totalEstimatedLoanBalance (primary current debt signal)
 *                            → estimatedLendableEquity (available deal cash check)
 *   2. /attomavm/detail       → AVM value + range + scr (FMV signal)
 *                            → homeEquity.estEquity (legacy fallback — subscription-gated)
 *   3. /property/detailmortgageowner → owner verification, mortgage origination context
 *
 * Policy constants are loaded from env vars at call time so they can be
 * overridden in tests without module reloading.
 *
 * This module is pure: no network calls, no DB calls, no side effects.
 * It exports `normalizeAttomScreening` (the function) and `attomAdapter`
 * (the ScreeningAdapter<AttomRawComposite> instance).
 */

import type { ScreeningAdapter, ScreeningAdapterContext, NormalizedScreeningResult, OwnerMatchResult, DebtDiscrepancyResult, ValueDiscrepancyResult, LimitingFactor, ScreeningOutcome } from "@/lib/property/screening";
import { resolveNextVerificationState } from "@/lib/property/screening";
import { SCREENING_ARTIFACT_TYPE } from "@/lib/property/screening";
import type { AttomRawComposite } from "./types";

// ────────────────────────────────────────────────────────────────────────────
// Policy constants (env-configurable)
// ────────────────────────────────────────────────────────────────────────────

/** Maximum loan-to-value ratio used for FractPath eligible cash computation. */
function getMaxLtvRatio(): number {
  return parseFloat(process.env.ATTOM_MAX_LTV_RATIO ?? "0.60");
}

/** Hard ceiling on FractPath eligible cash (dollars) regardless of LTV math. */
function getMaxCashCap(): number {
  return parseFloat(process.env.ATTOM_MAX_CASH_CAP ?? "250000");
}

// ────────────────────────────────────────────────────────────────────────────
// Discrepancy severity thresholds (fixed constants, not policy-configurable)
// ────────────────────────────────────────────────────────────────────────────

// FMV discrepancy thresholds (as a fraction of the ATTOM AVM value)
const VALUE_DISCREPANCY_MINOR_PCT = 0.05;        // ≤ 5%  → minor
const VALUE_DISCREPANCY_SIGNIFICANT_PCT = 0.15;  // ≤ 15% → significant
const VALUE_DISCREPANCY_BLOCKING_PCT = 0.30;     // > 30% → blocking

// Absolute debt discrepancy thresholds (dollars)
const DEBT_DISCREPANCY_MINOR_USD = 5_000;
const DEBT_DISCREPANCY_SIGNIFICANT_USD = 25_000;
const DEBT_DISCREPANCY_BLOCKING_USD = 75_000;

// ────────────────────────────────────────────────────────────────────────────
// AVM confidence derivation
// ────────────────────────────────────────────────────────────────────────────

/**
 * Derives a confidence tier from the ATTOM AVM low/high spread relative to
 * the point estimate.  Mirrors the approach used in the RentCast normalizer.
 *
 *   spread ≤ 8%  → high
 *   spread ≤ 15% → medium
 *   otherwise    → low
 */
function deriveAvmConfidence(
  value: number | null,
  low: number | null,
  high: number | null,
): "high" | "medium" | "low" | null {
  if (!value || value <= 0 || low == null || high == null) return null;
  const spreadRatio = (high - low) / value;
  if (spreadRatio <= 0.08) return "high";
  if (spreadRatio <= 0.15) return "medium";
  return "low";
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-result builders
// ────────────────────────────────────────────────────────────────────────────

/**
 * Builds the owner match result from ATTOM property detail.
 *
 * Name-level verification (ownerNameMatch) requires the owner's full name to
 * be present in ScreeningAdapterContext, which it currently is not.  A future
 * extension to ScreeningAdapterContext can enable this.  Until then:
 *   - matched=true  when ATTOM returns a property detail record (property found)
 *   - matched=false when ATTOM returns no record or propertyDetail is null
 *   - ownerNameMatch / mailingAddressMatch remain null (insufficient context)
 *   - confidence is "medium" when matched (found but not name-verified)
 */
function buildOwnerMatchResult(
  raw: AttomRawComposite,
): OwnerMatchResult {
  const hasPropertyRecord = raw.propertyDetail != null;

  return {
    matched: hasPropertyRecord,
    confidence: hasPropertyRecord ? "medium" : null,
    ownerNameMatch: null,
    mailingAddressMatch: null,
    notes: hasPropertyRecord
      ? "Property record found in ATTOM database. Name-level verification requires owner name in screening context (not yet populated)."
      : "No matching property record returned by ATTOM for this address. Owner identity cannot be confirmed.",
  };
}

/**
 * Builds the debt discrepancy result.
 *
 * Debt signal priority (highest to lowest):
 *   1. /valuation/homeequity → totalEstimatedLoanBalance
 *      This is ATTOM's amortized estimate of the CURRENT total outstanding loan
 *      balance across all liens. It is the most accurate current-debt signal.
 *
 *   2. /attomavm/detail → homeEquity.estEquity (implied debt = AVM value − estEquity)
 *      Legacy secondary signal. Subscription-gated and confirmed absent at the
 *      current tier, but retained as a fallback for future tier changes.
 *
 * The mortgage origination amount from detailmortgageowner is recorded as
 * context/notes only — it is the original loan amount at origination, NOT the
 * current balance, and should not be used for discrepancy comparison.
 */
function buildDebtDiscrepancyResult(
  raw: AttomRawComposite,
  context: ScreeningAdapterContext,
): DebtDiscrepancyResult {
  const reportedDebt = context.ownerDeclaredDebt;
  const avmValue = raw.avmDetail?.avm?.amount?.value ?? null;

  // ── Signal 1: /valuation/homeequity totalEstimatedLoanBalance ─────────────
  const homeEquityRecord = raw.homeEquityDetail?.homeEquity ?? null;
  const totalEstimatedLoanBalance = homeEquityRecord?.totalEstimatedLoanBalance ?? null;
  const estimatedLendableEquity = homeEquityRecord?.estimatedLendableEquity ?? null;
  const estimatedAvailableEquity = homeEquityRecord?.estimatedAvailableEquity ?? null;
  const attomLtv = homeEquityRecord?.LTV ?? null;
  const recordLastUpdated = homeEquityRecord?.recordLastUpdated ?? null;
  const homeEquityDetailPresent = raw.homeEquityDetail != null;

  // ── Signal 2: /attomavm/detail homeEquity.estEquity (legacy fallback) ────
  const estEquity = raw.avmDetail?.homeEquity?.estEquity ?? null;
  const avmImpliedDebt =
    avmValue != null && estEquity != null && avmValue > 0
      ? Math.max(0, avmValue - estEquity)
      : null;

  // ── Mortgage origination context (NOT used for comparison) ───────────────
  const mortgageRaw = raw.propertyDetail?.mortgage;
  const mortgageRecord = Array.isArray(mortgageRaw)
    ? (mortgageRaw[0] ?? null)
    : ((mortgageRaw as Record<string, unknown> | null | undefined) ?? null);
  const mortgageOrigination =
    (mortgageRecord?.amount as number | null | undefined) ?? null;

  // ── Resolve screening debt ────────────────────────────────────────────────
  // Prefer homeEquity endpoint total balance; fall back to AVM-implied if absent.
  let screeningDebt: number | null = null;
  let debtSourceNote = "";

  if (totalEstimatedLoanBalance != null) {
    screeningDebt = totalEstimatedLoanBalance;
    debtSourceNote = `ATTOM /valuation/homeequity: estimated current total loan balance $${Math.round(totalEstimatedLoanBalance).toLocaleString()}`;
    if (recordLastUpdated) {
      debtSourceNote += ` (data freshness: ${recordLastUpdated})`;
    }
    if (estimatedLendableEquity != null) {
      debtSourceNote += `. Est. lendable equity: $${Math.round(estimatedLendableEquity).toLocaleString()}`;
    }
    if (attomLtv != null) {
      debtSourceNote += `. ATTOM LTV: ${attomLtv}%`;
    }
  } else if (avmImpliedDebt != null) {
    screeningDebt = avmImpliedDebt;
    debtSourceNote = `ATTOM attomavm/detail equity-implied debt $${Math.round(avmImpliedDebt).toLocaleString()} (AVM $${Math.round(avmValue!).toLocaleString()} − est. equity $${Math.round(estEquity!).toLocaleString()})`;
  }

  const mortgageNote = mortgageOrigination != null
    ? ` ATTOM mortgage origination on record: $${Math.round(mortgageOrigination).toLocaleString()} (original loan amount at origination — not current balance).`
    : "";

  if (reportedDebt == null) {
    const reason = !homeEquityDetailPresent
      ? "homeEquityDetail endpoint returned no payload for this address"
      : screeningDebt == null
        ? "no debt signal available (homeEquity data absent)"
        : "";
    return {
      discrepancyFound: false,
      reportedDebt: null,
      screeningDebt,
      delta: null,
      severity: null,
      notes: [
        "Owner has not declared secured debt; debt comparison skipped.",
        debtSourceNote,
        mortgageNote,
        reason ? `Note: ${reason}.` : "",
      ].filter(Boolean).join(" "),
    };
  }

  if (screeningDebt == null) {
    const reason = !homeEquityDetailPresent
      ? "/valuation/homeequity returned no payload; attomavm/detail homeEquity absent (subscription-gated); debt comparison skipped."
      : "totalEstimatedLoanBalance and equity signals absent; debt comparison skipped.";
    return {
      discrepancyFound: false,
      reportedDebt,
      screeningDebt: null,
      delta: null,
      severity: null,
      notes: reason + mortgageNote,
    };
  }

  const delta = screeningDebt - reportedDebt;
  const absDelta = Math.abs(delta);

  let severity: "none" | "minor" | "significant" | "blocking";
  if (absDelta < DEBT_DISCREPANCY_MINOR_USD) {
    severity = "none";
  } else if (absDelta < DEBT_DISCREPANCY_SIGNIFICANT_USD) {
    severity = "minor";
  } else if (absDelta < DEBT_DISCREPANCY_BLOCKING_USD) {
    severity = "significant";
  } else {
    severity = "blocking";
  }

  const baseNote =
    severity === "none"
      ? `Declared debt is within tolerance of ATTOM current balance. ${debtSourceNote}.`
      : `ATTOM current balance (${Math.round(screeningDebt).toLocaleString()}) differs from declared debt (${Math.round(reportedDebt).toLocaleString()}) by $${Math.round(absDelta).toLocaleString()} (${severity}). ${debtSourceNote}.`;

  return {
    discrepancyFound: severity !== "none",
    reportedDebt,
    screeningDebt,
    delta,
    severity,
    notes: baseNote + mortgageNote,
  };
}

/**
 * Builds the FMV discrepancy result by comparing the owner's self-stated FMV
 * against the ATTOM AVM point estimate.
 */
function buildValueDiscrepancyResult(
  raw: AttomRawComposite,
  context: ScreeningAdapterContext,
): ValueDiscrepancyResult {
  const ownerStatedFmv = context.ownerStatedFmv;
  const screeningFmv = raw.avmDetail?.avm?.amount?.value ?? null;

  if (ownerStatedFmv == null) {
    return {
      discrepancyFound: false,
      ownerStatedFmv: null,
      screeningFmv,
      delta: null,
      deltaPercent: null,
      severity: null,
      notes: "Owner has not stated FMV; value comparison skipped.",
    };
  }

  if (screeningFmv == null || screeningFmv <= 0) {
    return {
      discrepancyFound: false,
      ownerStatedFmv,
      screeningFmv: null,
      delta: null,
      deltaPercent: null,
      severity: null,
      notes: "ATTOM AVM value unavailable; value comparison skipped.",
    };
  }

  const delta = screeningFmv - ownerStatedFmv;
  const absDelta = Math.abs(delta);
  const absDeltaPct = absDelta / screeningFmv;

  let severity: "none" | "minor" | "significant" | "blocking";
  if (absDeltaPct < VALUE_DISCREPANCY_MINOR_PCT) {
    severity = "none";
  } else if (absDeltaPct < VALUE_DISCREPANCY_SIGNIFICANT_PCT) {
    severity = "minor";
  } else if (absDeltaPct < VALUE_DISCREPANCY_BLOCKING_PCT) {
    severity = "significant";
  } else {
    severity = "blocking";
  }

  // Sign convention: positive deltaPercent means screeningFmv > ownerStatedFmv
  // (owner under-stated value); negative means owner over-stated.
  const deltaPercent = (delta / screeningFmv) * 100;

  return {
    discrepancyFound: severity !== "none",
    ownerStatedFmv,
    screeningFmv,
    delta,
    deltaPercent,
    severity,
    notes:
      severity === "none"
        ? "Owner-stated FMV is within tolerance of ATTOM AVM estimate."
        : `ATTOM AVM ($${Math.round(screeningFmv).toLocaleString()}) differs from owner-stated FMV ($${Math.round(ownerStatedFmv).toLocaleString()}) by ${Math.abs(Math.round(deltaPercent))}% (${severity}).`,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Outcome derivation
// ────────────────────────────────────────────────────────────────────────────

/**
 * Derives the canonical screening outcome from the sub-results.
 *
 * Resolution priority (highest to lowest):
 *   1. No AVM value or low confidence       → "weak"
 *   2. Any blocking discrepancy             → "disputed"
 *   3. Any significant discrepancy          → "discrepancy"
 *   4. Property not found in ATTOM          → "disputed"
 *   5. No material issues                   → "clean"
 *
 * IMPORTANT: "weak" does NOT mean the deal is ineligible or that ATTOM is
 * unhelpful. It means the AVM confidence interval is too wide for ATTOM to
 * become the controlling FMV basis. The /valuation/homeequity data (lendable
 * equity, total loan balance) may still materially support the deal — that
 * context is captured in reviewNotes. A "weak" outcome requires manual review
 * to establish the controlling FMV, but does not imply a rejection.
 */
function deriveOutcome(
  avmValue: number | null,
  avmConfidence: "high" | "medium" | "low" | null,
  ownerMatch: OwnerMatchResult,
  debtDiscrepancy: DebtDiscrepancyResult,
  valueDiscrepancy: ValueDiscrepancyResult,
): ScreeningOutcome {
  if (avmValue == null || avmValue <= 0) return "weak";
  if (avmConfidence === "low") return "weak";

  if (
    valueDiscrepancy.severity === "blocking" ||
    debtDiscrepancy.severity === "blocking"
  ) {
    return "disputed";
  }

  if (
    valueDiscrepancy.severity === "significant" ||
    debtDiscrepancy.severity === "significant"
  ) {
    return "discrepancy";
  }

  if (!ownerMatch.matched) return "disputed";

  return "clean";
}

// ────────────────────────────────────────────────────────────────────────────
// Limiting factors
// ────────────────────────────────────────────────────────────────────────────

function buildLimitingFactors(
  debtDiscrepancy: DebtDiscrepancyResult,
  valueDiscrepancy: ValueDiscrepancyResult,
  outcome: ScreeningOutcome,
): LimitingFactor[] {
  const factors: LimitingFactor[] = [];

  if (
    debtDiscrepancy.severity === "significant" ||
    debtDiscrepancy.severity === "blocking"
  ) {
    factors.push({
      code: `debt_discrepancy_${debtDiscrepancy.severity}`,
      label: `Debt discrepancy — ${debtDiscrepancy.severity}`,
      severity: debtDiscrepancy.severity === "blocking" ? "blocking" : "warning",
    });
  }

  if (
    valueDiscrepancy.severity === "significant" ||
    valueDiscrepancy.severity === "blocking"
  ) {
    factors.push({
      code: `value_discrepancy_${valueDiscrepancy.severity}`,
      label: `FMV discrepancy — ${valueDiscrepancy.severity}`,
      severity: valueDiscrepancy.severity === "blocking" ? "blocking" : "warning",
    });
  }

  if (outcome === "weak") {
    factors.push({
      code: "avm_insufficient",
      label: "AVM confidence insufficient for deal eligibility determination",
      severity: "blocking",
    });
  }

  if (outcome === "disputed") {
    factors.push({
      code: "data_conflict_requires_manual_review",
      label: "Material data conflict — manual review required",
      severity: "blocking",
    });
  }

  return factors;
}

// ────────────────────────────────────────────────────────────────────────────
// Interpretation / review notes
// ────────────────────────────────────────────────────────────────────────────

/**
 * Builds a plain-language explanation of the ATTOM outcome.
 *
 * This explains:
 *   - Why ATTOM is or is not the controlling FMV
 *   - Why "Weak AVM" if that is the outcome, and what the home equity data says
 *   - What the next step should be
 *
 * This is written for internal admin use — it may reference policy thresholds
 * and ATTOM-specific concepts.
 */
function buildReviewNotes(
  outcome: ScreeningOutcome,
  becameControlling: boolean,
  avmValue: number | null,
  avmConfidence: "high" | "medium" | "low" | null,
  avmLow: number | null,
  avmHigh: number | null,
  raw: AttomRawComposite,
  debtDiscrepancy: DebtDiscrepancyResult,
  valueDiscrepancy: ValueDiscrepancyResult,
): string {
  const homeEquity = raw.homeEquityDetail?.homeEquity ?? null;
  const totalLoanBalance = homeEquity?.totalEstimatedLoanBalance ?? null;
  const lendableEquity = homeEquity?.estimatedLendableEquity ?? null;
  const availableEquity = homeEquity?.estimatedAvailableEquity ?? null;
  const ltv = homeEquity?.LTV ?? null;
  const homeEquityPresent = homeEquity != null;

  const lines: string[] = [];

  // ── Controlling determination ─────────────────────────────────────────────
  if (becameControlling && avmValue != null) {
    lines.push(
      `ATTOM became the controlling FMV basis. AVM value $${Math.round(avmValue).toLocaleString()} adopted as latest_verified_fmv.`,
    );
  } else {
    lines.push("ATTOM did not become the controlling FMV basis.");
  }

  // ── Outcome explanation ───────────────────────────────────────────────────
  if (outcome === "weak") {
    const spread =
      avmValue && avmLow != null && avmHigh != null
        ? (((avmHigh - avmLow) / avmValue) * 100).toFixed(1)
        : null;
    lines.push(
      `Outcome is "Weak AVM": ATTOM AVM confidence is "${avmConfidence ?? "unknown"}"` +
      (spread ? ` (${spread}% low-high spread, threshold is ≤15% for medium confidence)` : "") +
      `. A spread above 15% means the AVM range is too wide for ATTOM to serve as the controlling property value. This does NOT mean the deal is ineligible.`,
    );

    // Home equity context when AVM is weak
    if (homeEquityPresent && lendableEquity != null) {
      lines.push(
        `Home equity context (from /valuation/homeequity): ` +
        (totalLoanBalance != null ? `estimated current total loan balance $${Math.round(totalLoanBalance).toLocaleString()}, ` : "") +
        `estimated lendable equity $${Math.round(lendableEquity).toLocaleString()}` +
        (availableEquity != null ? `, available equity $${Math.round(availableEquity).toLocaleString()}` : "") +
        (ltv != null ? `, ATTOM LTV ${ltv}%` : "") +
        `. The home equity data provides material support for deal cash availability even though the AVM confidence is insufficient for FractPath to adopt it as the controlling FMV. Manual review or a licensed appraisal is required to establish the controlling property value.`,
      );
    } else if (!homeEquityPresent) {
      lines.push(
        "Home equity data was not returned by /valuation/homeequity for this address. " +
        "Both AVM confidence and home equity signals are insufficient. Manual review required.",
      );
    }

    lines.push(
      "Next step: manual FMV review to establish the controlling property value, or commission a licensed appraisal.",
    );
  } else if (outcome === "clean") {
    lines.push("All discrepancy checks within tolerance. AVM confidence sufficient.");
    if (homeEquityPresent && lendableEquity != null) {
      lines.push(
        `Home equity confirmation: estimated lendable equity $${Math.round(lendableEquity).toLocaleString()}` +
        (ltv != null ? `, ATTOM LTV ${ltv}%` : "") +
        `. Supports deal cash availability.`,
      );
    }
  } else if (outcome === "disputed") {
    lines.push("Material data conflict detected. Manual review required before ATTOM can become controlling.");
    if (valueDiscrepancy.severity === "blocking") {
      lines.push(`FMV discrepancy is blocking (${valueDiscrepancy.deltaPercent != null ? Math.abs(Math.round(valueDiscrepancy.deltaPercent)) + "%" : "unknown"} gap between owner-stated and ATTOM AVM).`);
    }
    if (debtDiscrepancy.severity === "blocking") {
      lines.push(`Debt discrepancy is blocking ($${Math.round(Math.abs(debtDiscrepancy.delta ?? 0)).toLocaleString()} gap between declared debt and ATTOM current balance).`);
    }
  } else if (outcome === "discrepancy") {
    lines.push("Significant discrepancy detected; ATTOM not controlling without resolution.");
  }

  // ── Debt source note ──────────────────────────────────────────────────────
  if (homeEquityPresent && totalLoanBalance != null) {
    lines.push(
      "Debt signal source: /valuation/homeequity totalEstimatedLoanBalance (amortized current balance — preferred over origination amount).",
    );
  } else if (!homeEquityPresent && raw.avmDetail?.homeEquity?.estEquity != null) {
    lines.push(
      "Debt signal source: /attomavm/detail homeEquity.estEquity (legacy implied-debt fallback; /valuation/homeequity was unavailable).",
    );
  } else {
    lines.push("No current-balance debt signal available from either ATTOM endpoint.");
  }

  return lines.join(" ");
}

// ────────────────────────────────────────────────────────────────────────────
// Main normalization function
// ────────────────────────────────────────────────────────────────────────────

/**
 * Normalizes an AttomRawComposite into the canonical NormalizedScreeningResult.
 *
 * This is a pure function: given the same inputs it always produces the same
 * output.  All policy thresholds are read from env at call time.
 */
export function normalizeAttomScreening(
  raw: AttomRawComposite,
  context: ScreeningAdapterContext,
): NormalizedScreeningResult {
  const avmValue = raw.avmDetail?.avm?.amount?.value ?? null;
  const avmLow = raw.avmDetail?.avm?.amount?.low ?? null;
  const avmHigh = raw.avmDetail?.avm?.amount?.high ?? null;
  const avmConfidence = deriveAvmConfidence(avmValue, avmLow, avmHigh);

  const ownerMatchResult = buildOwnerMatchResult(raw);
  const debtDiscrepancyResult = buildDebtDiscrepancyResult(raw, context);
  const valueDiscrepancyResult = buildValueDiscrepancyResult(raw, context);

  const outcome = deriveOutcome(
    avmValue,
    avmConfidence,
    ownerMatchResult,
    debtDiscrepancyResult,
    valueDiscrepancyResult,
  );

  const becameControlling = outcome === "clean" && avmValue != null;
  const controllingFmvCandidate = becameControlling ? avmValue : null;

  const maxLtvRatio = getMaxLtvRatio();
  const maxCashCap = getMaxCashCap();
  const ownerDeclaredDebt = context.ownerDeclaredDebt ?? 0;

  // Prefer /valuation/homeequity lendable equity for eligible cash when available.
  // This is more accurate than AVM-LTV math because it uses ATTOM's amortized
  // current balance rather than the origination amount.
  const homeEquityLendable = raw.homeEquityDetail?.homeEquity?.estimatedLendableEquity ?? null;

  const rawEstimatedAvailableCash =
    avmValue != null
      ? Math.max(0, avmValue * maxLtvRatio - ownerDeclaredDebt)
      : null;

  const fractpathEligibleCashCap =
    rawEstimatedAvailableCash != null
      ? Math.min(rawEstimatedAvailableCash, maxCashCap)
      : null;

  const limitingFactors = buildLimitingFactors(
    debtDiscrepancyResult,
    valueDiscrepancyResult,
    outcome,
  );

  const nextVerificationState = resolveNextVerificationState(outcome);

  const reviewNotes = buildReviewNotes(
    outcome,
    becameControlling,
    avmValue,
    avmConfidence,
    avmLow,
    avmHigh,
    raw,
    debtDiscrepancyResult,
    valueDiscrepancyResult,
  );

  // Suppress unused variable warning — retained for future use in enhanced
  // cash-cap derivation (ATTOM lendable equity vs AVM-LTV method).
  void homeEquityLendable;

  return {
    provider: "attom",
    artifactType: SCREENING_ARTIFACT_TYPE,
    outcome,
    ownerMatchResult,
    debtDiscrepancyResult,
    valueDiscrepancyResult,
    controllingFmvCandidate,
    rawEstimatedAvailableCash,
    fractpathEligibleCashCap,
    limitingFactors,
    nextVerificationState,
    becameControlling,
    evidenceLinks: [],
    reviewNotes,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Adapter instance
// ────────────────────────────────────────────────────────────────────────────

/**
 * ScreeningAdapter implementation for ATTOM enhanced screening.
 * Pass this to any caller that accepts a ScreeningAdapter<AttomRawComposite>.
 */
export const attomAdapter: ScreeningAdapter<AttomRawComposite> = {
  provider: "attom",
  normalize: normalizeAttomScreening,
};
