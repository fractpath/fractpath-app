/**
 * Pure property badge derivation helpers.
 *
 * These functions derive badge visibility from persisted field values only.
 * They do NOT query the database.  Pass the relevant property row fields directly.
 *
 * Public badges:
 *   - Owner Verified
 *   - Verified Appraisal Value
 *
 * Buyer-facing rule: these are the ONLY two badges that may ever be surfaced on
 * buyer/public-facing UI.  Raw FMV amounts, mortgage balances, admin override
 * reasons, and manual appraisal detail must never accompany these badges.
 */

import { OWNER_VERIFIED_BADGE_STATES } from "./constants";

// ────────────────────────────────────────────────────────────────────────────
// Owner Verified badge
// ────────────────────────────────────────────────────────────────────────────

/**
 * Returns true when the "Owner Verified" public badge should be shown.
 *
 * Rules:
 *   1. verification_state must be in the badge-carrying set
 *      (owner_verified, screening_in_progress, owner_clarification_required,
 *       manual_review_required, verified_for_deals)
 *   2. owner_verification_removed_at must be null (badge has not been revoked)
 *
 * @param verificationState  properties.verification_state — null treated as intake_pending
 * @param ownerVerificationRemovedAt  properties.owner_verification_removed_at — null means not revoked
 */
export function shouldShowOwnerVerifiedBadge(
  verificationState: string | null,
  ownerVerificationRemovedAt: string | null,
): boolean {
  if (!verificationState) return false;
  if (ownerVerificationRemovedAt != null) return false;
  return OWNER_VERIFIED_BADGE_STATES.has(verificationState as any);
}

// ────────────────────────────────────────────────────────────────────────────
// Verified Appraisal Value badge
// ────────────────────────────────────────────────────────────────────────────

/**
 * Returns true when the "Verified Appraisal Value" public badge should be shown.
 *
 * The badge is visible when the status is 'active' or 'under_review'.
 * - 'active'      — badge is live and valid
 * - 'under_review'— a new appraisal review is in flight; badge remains visible
 *                   so the owner knows the process is ongoing
 * - 'none'        — no appraisal has been verified; badge is hidden
 * - 'expired'     — previous appraisal lapsed; badge is hidden (show expired UI instead)
 *
 * @param verifiedAppraisalValueStatus  properties.verified_appraisal_value_status
 */
export function shouldShowVerifiedAppraisalValueBadge(
  verifiedAppraisalValueStatus: string | null,
): boolean {
  return (
    verifiedAppraisalValueStatus === "active" ||
    verifiedAppraisalValueStatus === "under_review"
  );
}

/**
 * Returns true when the appraisal badge has expired.
 *
 * Used to show a distinct "expired" affordance rather than simply hiding the badge,
 * so owners and admins understand why a previously verified value is no longer active.
 *
 * @param verifiedAppraisalValueStatus  properties.verified_appraisal_value_status
 */
export function isAppraisalBadgeExpired(
  verifiedAppraisalValueStatus: string | null,
): boolean {
  return verifiedAppraisalValueStatus === "expired";
}

/**
 * Returns true when an appraisal review is currently in progress.
 * Useful for showing "review in progress" affordances separately from the badge.
 *
 * @param verifiedAppraisalValueStatus  properties.verified_appraisal_value_status
 */
export function isAppraisalBadgeUnderReview(
  verifiedAppraisalValueStatus: string | null,
): boolean {
  return verifiedAppraisalValueStatus === "under_review";
}
