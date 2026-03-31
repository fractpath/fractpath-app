/**
 * ATTOM enhanced screening normalizer.
 *
 * Maps a raw AttomRawComposite (two merged ATTOM API responses) into the
 * canonical NormalizedScreeningResult shape defined in screening.ts.
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
 * Uses ATTOM's homeEquity.estEquity field to derive an implied debt figure:
 *   impliedDebt = avmValue − estEquity
 *
 * This is a secondary signal (ATTOM's equity estimate, not a title search).
 * If homeEquity data is absent (subscription-gated), the comparison is skipped.
 */
function buildDebtDiscrepancyResult(
  raw: AttomRawComposite,
  context: ScreeningAdapterContext,
): DebtDiscrepancyResult {
  const reportedDebt = context.ownerDeclaredDebt;
  const avmValue = raw.avmDetail?.avm?.amount?.value ?? null;
  const estEquity = raw.avmDetail?.homeEquity?.estEquity ?? null;

  let screeningDebt: number | null = null;
  if (avmValue != null && estEquity != null && avmValue > 0) {
    screeningDebt = Math.max(0, avmValue - estEquity);
  }

  if (reportedDebt == null) {
    return {
      discrepancyFound: false,
      reportedDebt: null,
      screeningDebt,
      delta: null,
      severity: null,
      notes: "Owner has not declared secured debt; debt comparison skipped.",
    };
  }

  if (screeningDebt == null) {
    return {
      discrepancyFound: false,
      reportedDebt,
      screeningDebt: null,
      delta: null,
      severity: null,
      notes:
        "ATTOM home equity data unavailable (subscription tier or address not covered); debt comparison skipped.",
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

  return {
    discrepancyFound: severity !== "none",
    reportedDebt,
    screeningDebt,
    delta,
    severity,
    notes:
      severity === "none"
        ? "Declared debt is within tolerance of ATTOM equity-implied debt."
        : `ATTOM equity-implied debt (${Math.round(screeningDebt).toLocaleString()}) differs from declared debt (${Math.round(reportedDebt).toLocaleString()}) by $${Math.round(absDelta).toLocaleString()} (${severity}).`,
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
    reviewNotes: null,
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
