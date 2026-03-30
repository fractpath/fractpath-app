/**
 * Canonical server-side property verification read model.
 *
 * Single source of truth for resolving a property row into the structured
 * verification/badge/underwriting projection that admin and owner surfaces consume.
 *
 * Resolution rules (explicit):
 *
 *   verification_state (canonical)
 *     → `properties.verification_state`  (Phase 1 column, defaults 'intake_pending')
 *     NOT the same as `properties.status` ('unverified'/'under_review'/'verified'/'archived')
 *     which is the legacy admin pipeline status and is mapped separately as `legacyStatus`.
 *
 *   ownerVerifiedAt
 *     → `properties.verified_at`  (existing column, reused — no duplicate added)
 *
 *   verifiedAppraisalValueValidUntil
 *     → `properties.property_review_expires_at`  (existing column, reused)
 *     Full-detail FMV expiry is also available on `property_review_summary.fmv_expires_at`
 *     for admin surfaces that join the summary.
 *
 *   currentControllingValueSource
 *     → `properties.fmv_verification_source`  (existing column, reused; unconstrained — may
 *        contain legacy non-canonical values such as 'manual_appraisal_sim')
 *
 *   currentControllingFmv
 *     → `properties.latest_verified_fmv`  (existing column, reused)
 *
 *   currentRawAvailableCash
 *     → `properties.max_accessible_cash_current`  (existing column, reused)
 *
 *   All Phase 1 "current_*" columns (currentFractpathEligibleCashCap,
 *   currentEligibilityPosture, currentLimitingFactors) are admin-only underwriting
 *   outputs and MUST NOT appear in buyer-facing or owner-facing API responses.
 *
 * SELECT fragment usage:
 *   Owner-facing loaders: append PROPERTY_VERIFICATION_BASE_FIELDS to their SELECT.
 *   Admin-facing loaders: append PROPERTY_VERIFICATION_BASE_FIELDS + ", " +
 *                         PROPERTY_VERIFICATION_ADMIN_EXTRA_FIELDS.
 */

import {
  shouldShowOwnerVerifiedBadge,
  shouldShowVerifiedAppraisalValueBadge,
  isAppraisalBadgeExpired,
} from "./badges";

// ────────────────────────────────────────────────────────────────────────────
// SELECT fragment constants
// ────────────────────────────────────────────────────────────────────────────

/**
 * Supabase SELECT fragment covering the Phase 1 verification fields that are
 * safe for owner-facing queries.
 *
 * Includes: new Phase 1 columns + reused existing columns not already in most
 * existing SELECTs (verified_at, property_review_expires_at).
 *
 * Does NOT include admin-only underwriting outputs.
 */
export const PROPERTY_VERIFICATION_BASE_FIELDS =
  "verification_state, verified_at, owner_verification_removed_at, verified_appraisal_value_status, verified_appraisal_value_context_owner_id, property_review_expires_at";

/**
 * Additional Supabase SELECT fragment for admin-only Phase 1 verification fields.
 * Must be combined with PROPERTY_VERIFICATION_BASE_FIELDS:
 *
 *   `${existingSelect}, ${PROPERTY_VERIFICATION_BASE_FIELDS}, ${PROPERTY_VERIFICATION_ADMIN_EXTRA_FIELDS}`
 *
 * NEVER include these in owner-facing or buyer-facing queries.
 */
export const PROPERTY_VERIFICATION_ADMIN_EXTRA_FIELDS =
  "owner_verification_removed_reason, current_fractpath_eligible_cash_cap, current_eligibility_posture, current_limiting_factors_json";

// ────────────────────────────────────────────────────────────────────────────
// Canonical verification view type
// ────────────────────────────────────────────────────────────────────────────

/**
 * Canonical read model for property verification state, badge visibility, and
 * underwriting summary.  All fields are derived from persisted property row
 * columns using explicit resolution rules documented above.
 *
 * Consume via `toPropertyVerificationView(row)`.
 *
 * Admin-only fields (currentFractpathEligibleCashCap, currentEligibilityPosture,
 * currentLimitingFactors, ownerVerificationRemovedReason) will be null unless
 * the row was fetched with PROPERTY_VERIFICATION_ADMIN_EXTRA_FIELDS included.
 * They must never be forwarded to buyer-facing or owner-facing API responses.
 */
export type PropertyVerificationView = {
  // ── Canonical verification state machine ─────────────────────────────────
  /** Phase 1 verification workflow state. Source: properties.verification_state */
  verificationState: string;

  // ── Owner Verified badge ──────────────────────────────────────────────────
  /** Timestamp when owner was verified. Source: properties.verified_at (reused) */
  ownerVerifiedAt: string | null;
  /** Timestamp when Owner Verified badge was revoked, if ever. Source: properties.owner_verification_removed_at */
  ownerVerificationRemovedAt: string | null;
  /**
   * Admin reason for badge revocation. Source: properties.owner_verification_removed_reason
   * ADMIN-ONLY — must not be forwarded to owner or buyer surfaces.
   */
  ownerVerificationRemovedReason: string | null;
  /** Derived: true when Owner Verified public badge should be shown. */
  hasOwnerVerifiedBadge: boolean;

  // ── Verified Appraisal Value badge ────────────────────────────────────────
  /** Enum status. Source: properties.verified_appraisal_value_status */
  verifiedAppraisalValueStatus: string;
  /**
   * Expiry date of verified appraisal value.
   * Source: properties.property_review_expires_at (reused).
   * Full-detail FMV expiry also available on property_review_summary.fmv_expires_at
   * for admin surfaces that separately load the review summary.
   */
  verifiedAppraisalValueValidUntil: string | null;
  /** Owner context for the appraisal. Source: properties.verified_appraisal_value_context_owner_id */
  verifiedAppraisalValueContextOwnerId: string | null;
  /** Derived: true when Verified Appraisal Value public badge should be shown. */
  shouldShowVerifiedAppraisalValueBadge: boolean;
  /** Derived: true when the appraisal badge status is 'expired'. */
  isVerifiedAppraisalValueExpired: boolean;

  // ── Controlling value + underwriting ─────────────────────────────────────
  /** Controlling FMV data source. Source: properties.fmv_verification_source (reused, unconstrained) */
  currentControllingValueSource: string | null;
  /** Controlling FMV amount. Source: properties.latest_verified_fmv (reused) */
  currentControllingFmv: number | null;
  /** Raw LTV-minus-debt available cash. Source: properties.max_accessible_cash_current (reused) */
  currentRawAvailableCash: number | null;
  /**
   * Policy-adjusted eligible cash cap. Source: properties.current_fractpath_eligible_cash_cap
   * ADMIN-ONLY — null when loaded without PROPERTY_VERIFICATION_ADMIN_EXTRA_FIELDS.
   */
  currentFractpathEligibleCashCap: number | null;
  /**
   * Coarse eligibility posture. Source: properties.current_eligibility_posture
   * ADMIN-ONLY — null when loaded without PROPERTY_VERIFICATION_ADMIN_EXTRA_FIELDS.
   */
  currentEligibilityPosture: string | null;
  /**
   * Structured limiting factors list. Source: properties.current_limiting_factors_json
   * ADMIN-ONLY — null when loaded without PROPERTY_VERIFICATION_ADMIN_EXTRA_FIELDS.
   */
  currentLimitingFactors: unknown | null;

  // ── Legacy pipeline status ────────────────────────────────────────────────
  /**
   * Legacy admin pipeline status ('unverified' | 'under_review' | 'verified' | 'archived').
   * Source: properties.status.
   * NOT the same concept as verificationState — do not treat them as equivalent.
   */
  legacyStatus: string;
};

// ────────────────────────────────────────────────────────────────────────────
// Projection function
// ────────────────────────────────────────────────────────────────────────────

/**
 * Projects a raw properties DB row into the canonical PropertyVerificationView.
 *
 * Safe to call with any partial row — fields not present in the row default to
 * null or their appropriate zero-value.  Admin-only fields will be null unless
 * the row was fetched with PROPERTY_VERIFICATION_ADMIN_EXTRA_FIELDS.
 *
 * @param row  Raw properties row (any — typed as any because Supabase returns
 *             untyped rows and the column set varies by caller).
 */
export function toPropertyVerificationView(row: any): PropertyVerificationView {
  // ── Canonical Phase 1 verification state ──────────────────────────────────
  const verificationState: string =
    (row.verification_state as string | null) ?? "intake_pending";

  // ── Owner Verified badge ───────────────────────────────────────────────────
  // `verified_at` is the existing column reused as ownerVerifiedAt.
  const ownerVerifiedAt: string | null =
    (row.verified_at as string | null) ?? null;
  const ownerVerificationRemovedAt: string | null =
    (row.owner_verification_removed_at as string | null) ?? null;
  // admin-only; null when row fetched without PROPERTY_VERIFICATION_ADMIN_EXTRA_FIELDS
  const ownerVerificationRemovedReason: string | null =
    (row.owner_verification_removed_reason as string | null) ?? null;

  const hasOwnerVerifiedBadge = shouldShowOwnerVerifiedBadge(
    verificationState,
    ownerVerificationRemovedAt,
  );

  // ── Verified Appraisal Value badge ────────────────────────────────────────
  // `verified_appraisal_value_status` defaults 'none' per migration; treat null as 'none'.
  const verifiedAppraisalValueStatus: string =
    (row.verified_appraisal_value_status as string | null) ?? "none";

  // `property_review_expires_at` is the existing column reused for appraisal validity date.
  const verifiedAppraisalValueValidUntil: string | null =
    (row.property_review_expires_at as string | null) ?? null;

  const verifiedAppraisalValueContextOwnerId: string | null =
    (row.verified_appraisal_value_context_owner_id as string | null) ?? null;

  const _shouldShowVerifiedAppraisalValueBadge =
    shouldShowVerifiedAppraisalValueBadge(verifiedAppraisalValueStatus);
  const isVerifiedAppraisalValueExpired =
    isAppraisalBadgeExpired(verifiedAppraisalValueStatus);

  // ── Controlling value + underwriting ──────────────────────────────────────
  // Reused existing columns — no new columns for these.
  const currentControllingValueSource: string | null =
    (row.fmv_verification_source as string | null) ?? null;
  const currentControllingFmv: number | null =
    typeof row.latest_verified_fmv === "number" ? row.latest_verified_fmv : null;
  const currentRawAvailableCash: number | null =
    typeof row.max_accessible_cash_current === "number"
      ? row.max_accessible_cash_current
      : null;

  // Admin-only Phase 1 fields — null unless row includes PROPERTY_VERIFICATION_ADMIN_EXTRA_FIELDS.
  const currentFractpathEligibleCashCap: number | null =
    typeof row.current_fractpath_eligible_cash_cap === "number"
      ? row.current_fractpath_eligible_cash_cap
      : null;
  const currentEligibilityPosture: string | null =
    (row.current_eligibility_posture as string | null) ?? null;
  const currentLimitingFactors: unknown | null =
    row.current_limiting_factors_json ?? null;

  // ── Legacy status ──────────────────────────────────────────────────────────
  // `properties.status` is the existing admin pipeline status.  It is NOT
  // the same concept as `verification_state` and must not be conflated.
  const legacyStatus: string = (row.status as string | null) ?? "unverified";

  return {
    verificationState,
    ownerVerifiedAt,
    ownerVerificationRemovedAt,
    ownerVerificationRemovedReason,
    hasOwnerVerifiedBadge,
    verifiedAppraisalValueStatus,
    verifiedAppraisalValueValidUntil,
    verifiedAppraisalValueContextOwnerId,
    shouldShowVerifiedAppraisalValueBadge: _shouldShowVerifiedAppraisalValueBadge,
    isVerifiedAppraisalValueExpired,
    currentControllingValueSource,
    currentControllingFmv,
    currentRawAvailableCash,
    currentFractpathEligibleCashCap,
    currentEligibilityPosture,
    currentLimitingFactors,
    legacyStatus,
  };
}
