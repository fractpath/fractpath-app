/**
 * Canonical enhanced property screening domain model.
 *
 * This module defines the normalized screening result shape that any screening
 * provider (ATTOM, admin-manual, future vendors) must produce.  It contains
 * zero network calls, zero DB calls, and zero side effects — pure types and
 * pure resolution functions only.
 *
 * Screening result lifecycle:
 *   1. A raw vendor payload arrives (ATTOM HTTP response, admin form, etc.)
 *   2. A provider-specific adapter normalizes it into NormalizedScreeningResult
 *   3. screeningPersistence.persistScreeningArtifact() writes it to property_review_runs
 *   4. screeningPersistence.applyScreeningResultToProperty() materializes it onto properties
 *
 * Outcome → verification_state resolution rules (canonical, immutable):
 *   clean        →  verified_for_deals
 *   discrepancy  →  owner_clarification_required
 *   disputed     →  manual_review_required
 *   weak         →  manual_review_required
 *   stale        →  manual_review_required
 *   unsupported  →  ineligible
 *
 * Outcome → current_eligibility_posture resolution rules (canonical):
 *   clean        →  eligible
 *   discrepancy  →  under_review
 *   disputed     →  requires_enhanced_review
 *   weak         →  requires_enhanced_review
 *   stale        →  requires_enhanced_review
 *   unsupported  →  ineligible
 */

import type { VerificationState, EligibilityPosture } from "./constants";

// ────────────────────────────────────────────────────────────────────────────
// Provider + artifact type identifiers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Screening providers.  "attom" is the ATTOM Data Solutions enhanced screening
 * product.  "admin_manual" is for admin-entered screening results without a
 * live vendor run.
 */
export type ScreeningProvider = "attom" | "admin_manual";

/** Artifact type tag written to property_review_runs.artifact_type. */
export const SCREENING_ARTIFACT_TYPE = "enhanced_screening" as const;
export type ScreeningArtifactType = typeof SCREENING_ARTIFACT_TYPE;

// ────────────────────────────────────────────────────────────────────────────
// Sub-result shapes
// ────────────────────────────────────────────────────────────────────────────

/**
 * Owner identity match result.
 * Did the screening provider's title/ownership data match the user on record?
 */
export type OwnerMatchResult = {
  /** True when the provider confirmed the owner identity. */
  matched: boolean;
  /** Confidence the screening provider assigned to the owner match. */
  confidence: "high" | "medium" | "low" | null;
  /** True when the provider's owner name matches the owner record. */
  ownerNameMatch: boolean | null;
  /** True when the provider's mailing address matches the owner record. */
  mailingAddressMatch: boolean | null;
  /** Free-text notes from the adapter explaining the match result. */
  notes: string | null;
};

/**
 * Debt discrepancy result.
 * Compares owner-declared debt against the screening provider's lien/debt data.
 */
export type DebtDiscrepancyResult = {
  /** True when a meaningful debt discrepancy was found. */
  discrepancyFound: boolean;
  /** Owner-declared secured property debt amount. */
  reportedDebt: number | null;
  /** Screening provider's estimate of outstanding secured debt. */
  screeningDebt: number | null;
  /** Absolute difference (screeningDebt − reportedDebt). Negative = owner over-reported. */
  delta: number | null;
  /**
   * Severity of the discrepancy.
   * none        — no meaningful difference
   * minor       — within tolerance thresholds; flag but do not block
   * significant — materially affects LTV math; requires owner clarification
   * blocking    — prevents eligibility determination
   */
  severity: "none" | "minor" | "significant" | "blocking" | null;
  /** Free-text notes from the adapter. */
  notes: string | null;
};

/**
 * FMV discrepancy result.
 * Compares owner-stated FMV against the screening provider's value estimate.
 */
export type ValueDiscrepancyResult = {
  /** True when a meaningful FMV discrepancy was found. */
  discrepancyFound: boolean;
  /** Owner's self-stated FMV at intake. */
  ownerStatedFmv: number | null;
  /** Screening provider's FMV estimate. */
  screeningFmv: number | null;
  /** Absolute difference (screeningFmv − ownerStatedFmv). */
  delta: number | null;
  /**
   * Delta as a percentage of screeningFmv.
   * Positive = owner over-stated; negative = owner under-stated.
   */
  deltaPercent: number | null;
  /**
   * Severity of the discrepancy.
   * none        — within tolerance
   * minor       — notable but not blocking
   * significant — materially affects FractPath eligible cash math
   * blocking    — FMV is too uncertain to proceed
   */
  severity: "none" | "minor" | "significant" | "blocking" | null;
  /** Free-text notes from the adapter. */
  notes: string | null;
};

/**
 * A structured reason that limits the property's eligibility or cash cap.
 * Written to current_limiting_factors_json as an array.
 */
export type LimitingFactor = {
  /** Machine-readable reason code (e.g. "debt_discrepancy_significant"). */
  code: string;
  /** Human-readable label for admin display. */
  label: string;
  /**
   * warning          = reduces cap but does not block deal eligibility
   * blocking         = prevents deal eligibility; hard stop
   * review_required  = admin review signal; does not auto-block; drives documentation/discretion workflow
   */
  severity: "warning" | "blocking" | "review_required";
};

/**
 * A reference to a piece of evidence that supports the screening result.
 */
export type EvidenceLink = {
  /** Display label for the link. */
  label: string;
  /** URL to view the evidence (may be null for offline evidence). */
  url: string | null;
  /** Type tag (e.g. "property_review_run", "document", "admin_note"). */
  artifactType: string;
  /** Run ID from property_review_runs, if applicable. */
  runId: string | null;
};

// ────────────────────────────────────────────────────────────────────────────
// Screening outcome enum
// ────────────────────────────────────────────────────────────────────────────

/**
 * Canonical screening outcome values.  Every normalized screening result must
 * resolve to exactly one of these.  The outcome drives both verification_state
 * and current_eligibility_posture.
 *
 * clean        — no material discrepancy; property is eligible for deals
 * discrepancy  — a correctable discrepancy exists; owner can clarify
 * disputed     — provider data conflicts with owner data beyond self-correction
 * weak         — provider data confidence is too low to rely on
 * stale        — provider data is present but past its validity window
 * unsupported  — property is fundamentally ineligible (type, title, policy, etc.)
 */
export type ScreeningOutcome =
  | "clean"
  | "discrepancy"
  | "disputed"
  | "weak"
  | "stale"
  | "unsupported";

// ────────────────────────────────────────────────────────────────────────────
// Canonical normalized screening result
// ────────────────────────────────────────────────────────────────────────────

/**
 * The canonical shape every screening provider adapter must produce.
 * Stored verbatim in property_review_runs.normalized_payload.
 * Drives materialisation onto properties via applyScreeningResultToProperty().
 */
export type NormalizedScreeningResult = {
  /** Screening data provider. */
  provider: ScreeningProvider;
  /** Always "enhanced_screening". */
  artifactType: ScreeningArtifactType;
  /** Canonical outcome. Drives state + eligibility posture. */
  outcome: ScreeningOutcome;

  /** Owner identity match signal. */
  ownerMatchResult: OwnerMatchResult;
  /** Debt vs owner-declared comparison. */
  debtDiscrepancyResult: DebtDiscrepancyResult;
  /** FMV vs owner-stated comparison. */
  valueDiscrepancyResult: ValueDiscrepancyResult;

  /**
   * The FMV amount the screening result recommends as the new controlling value.
   * Null if the screening result does not provide a reliable FMV (e.g. weak/stale).
   */
  controllingFmvCandidate: number | null;

  /**
   * Raw LTV-minus-declared-debt available cash, pre-policy-overlay.
   * Mirrors the concept of max_accessible_cash_current before policy caps.
   */
  rawEstimatedAvailableCash: number | null;

  /**
   * Policy-adjusted eligible cash cap after all policy overlays and limiting factors.
   * Written to current_fractpath_eligible_cash_cap when this result is applied.
   */
  fractpathEligibleCashCap: number | null;

  /** Ordered list of factors that limit eligibility or the cash cap. */
  limitingFactors: LimitingFactor[];

  /**
   * The verification_state to transition the property to after applying this result.
   * Derived from outcome via resolveNextVerificationState(); included here for
   * observability and audit trail in the stored run payload.
   */
  nextVerificationState: VerificationState;

  /**
   * True when this result should replace the current controlling FMV on the
   * property.  When true, latest_verified_fmv / fmv_verification_source /
   * max_accessible_cash_current will all be overwritten during materialisation.
   * False when the result is informational only (e.g. a weak/stale AVM that
   * should not demote an existing verified controlling value).
   */
  becameControlling: boolean;

  /** Supporting evidence references. */
  evidenceLinks: EvidenceLink[];

  /** Adapter-level free-text notes (not shown to end-users). */
  reviewNotes: string | null;
};

// ────────────────────────────────────────────────────────────────────────────
// Stubbed adapter interface
// ────────────────────────────────────────────────────────────────────────────

/**
 * Contract for a future ATTOM (or other vendor) normalization adapter.
 *
 * Implementations receive the raw vendor payload and the property's current
 * state context, and must return a fully-resolved NormalizedScreeningResult.
 *
 * Network calls, API authentication, and retry logic live in the adapter
 * implementation — NOT in this interface.
 */
export interface ScreeningAdapter<TRawPayload = unknown> {
  /** Provider identifier this adapter produces results for. */
  readonly provider: ScreeningProvider;

  /**
   * Normalize a raw vendor payload into the canonical screening result.
   *
   * @param raw       The raw vendor API response payload.
   * @param context   Property context needed for discrepancy calculations.
   */
  normalize(
    raw: TRawPayload,
    context: ScreeningAdapterContext,
  ): NormalizedScreeningResult;
}

/**
 * Property context passed into every screening adapter's normalize() call.
 * Provides the owner-declared values needed for discrepancy calculations
 * without giving adapters direct database access.
 */
export type ScreeningAdapterContext = {
  propertyId: string;
  /** Owner-declared secured debt amount (for debt discrepancy comparison). */
  ownerDeclaredDebt: number | null;
  /** Owner-stated FMV at intake (for value discrepancy comparison). */
  ownerStatedFmv: number | null;
  /** Current best available FMV, if any (e.g. from a prior AVM run). */
  currentControllingFmv: number | null;
  /** Owner user ID (for setting verified_appraisal_value_context_owner_id). */
  ownerUserId: string | null;
};

// ────────────────────────────────────────────────────────────────────────────
// Pure resolution helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Maps a screening outcome to the canonical next verification_state.
 *
 * Resolution rules (immutable):
 *   clean        →  verified_for_deals
 *   discrepancy  →  owner_clarification_required
 *   disputed     →  manual_review_required
 *   weak         →  manual_review_required
 *   stale        →  manual_review_required
 *   unsupported  →  ineligible
 */
export function resolveNextVerificationState(
  outcome: ScreeningOutcome,
): VerificationState {
  switch (outcome) {
    case "clean":
      return "verified_for_deals";
    case "discrepancy":
      return "owner_clarification_required";
    case "disputed":
    case "weak":
    case "stale":
      return "manual_review_required";
    case "unsupported":
      return "ineligible";
  }
}

/**
 * Maps a screening outcome to the canonical current_eligibility_posture.
 *
 * Resolution rules (immutable):
 *   clean        →  eligible
 *   discrepancy  →  under_review
 *   disputed     →  requires_enhanced_review
 *   weak         →  requires_enhanced_review
 *   stale        →  requires_enhanced_review
 *   unsupported  →  ineligible
 */
export function resolveEligibilityPosture(
  outcome: ScreeningOutcome,
): EligibilityPosture {
  switch (outcome) {
    case "clean":
      return "eligible";
    case "discrepancy":
      return "under_review";
    case "disputed":
    case "weak":
    case "stale":
      return "requires_enhanced_review";
    case "unsupported":
      return "ineligible";
  }
}
