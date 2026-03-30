/**
 * Canonical property policy constants.
 *
 * This is the single source of truth for:
 *   - Property verification state machine values
 *   - Verified Appraisal Value badge statuses
 *   - Controlling value source enum
 *
 * IMPORTANT — field mapping (reused existing columns):
 *   Phase 1 concept                 Existing DB column
 *   ──────────────────────────────  ─────────────────────────────────
 *   owner_verified_at               properties.verified_at
 *   current_controlling_fmv         properties.latest_verified_fmv
 *   current_raw_available_cash      properties.max_accessible_cash_current
 *   current_controlling_value_src   properties.fmv_verification_source  (unconstrained;
 *                                   existing code writes 'manual_appraisal_sim')
 *   verified_appraisal_value_valid_until  properties.property_review_expires_at
 *
 * Do NOT use this module for the legacy properties.status values
 * ('unverified', 'under_review', 'verified', 'archived').  Those are the
 * admin-pipeline lifecycle states and remain unchanged.
 */

// ────────────────────────────────────────────────────────────────────────────
// Property verification state machine
// ────────────────────────────────────────────────────────────────────────────

/**
 * Canonical values for properties.verification_state.
 *
 * Transitions (happy path):
 *   intake_pending
 *     → owner_verified          (owner completes identity + property attestation)
 *     → screening_in_progress   (admin initiates formal screening)
 *     → manual_review_required  (screening raised flags needing human review)
 *     → owner_clarification_required  (admin needs more info from owner)
 *     → verified_for_deals      (property fully cleared for deal execution)
 *     → ineligible              (property cannot proceed; admin determination)
 *
 * The Owner Verified public badge is shown for:
 *   owner_verified, screening_in_progress, owner_clarification_required,
 *   manual_review_required, verified_for_deals
 * and HIDDEN when owner_verification_removed_at is set.
 */
export const PROPERTY_VERIFICATION_STATES = [
  "intake_pending",
  "owner_verified",
  "screening_in_progress",
  "owner_clarification_required",
  "manual_review_required",
  "verified_for_deals",
  "ineligible",
] as const;

export type VerificationState = (typeof PROPERTY_VERIFICATION_STATES)[number];

export function isVerificationState(v: unknown): v is VerificationState {
  return PROPERTY_VERIFICATION_STATES.includes(v as VerificationState);
}

// ────────────────────────────────────────────────────────────────────────────
// Verified Appraisal Value badge statuses
// ────────────────────────────────────────────────────────────────────────────

/**
 * Canonical values for properties.verified_appraisal_value_status.
 *
 * none         — No appraisal value has been verified yet.
 * active       — A verified appraisal value is in effect and not expired.
 * expired      — The verified appraisal value's validity window has passed.
 * under_review — An appraisal review is in progress; previous value may still apply.
 */
export const VERIFIED_APPRAISAL_VALUE_STATUSES = [
  "none",
  "active",
  "expired",
  "under_review",
] as const;

export type VerifiedAppraisalValueStatus =
  (typeof VERIFIED_APPRAISAL_VALUE_STATUSES)[number];

export function isVerifiedAppraisalValueStatus(
  v: unknown,
): v is VerifiedAppraisalValueStatus {
  return VERIFIED_APPRAISAL_VALUE_STATUSES.includes(
    v as VerifiedAppraisalValueStatus,
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Controlling value source enum
// ────────────────────────────────────────────────────────────────────────────

/**
 * Canonical values for properties.fmv_verification_source
 * (persisted field; Phase 1 logical name: current_controlling_value_source).
 *
 * Priority order (highest to lowest confidence):
 *   title_findings        — Value derived from title search / lien findings
 *   manual_appraisal      — Licensed appraiser-provided value
 *   admin_adjusted        — Admin-entered manual override
 *   attom                 — ATTOM enhanced AVM
 *   rentcast              — RentCast automated AVM
 *   owner_estimate        — Owner's self-reported estimate (lowest confidence)
 *
 * NOTE: Existing code may write 'manual_appraisal_sim' (simulation only).
 * That is a non-canonical value used during development; real production writes
 * should use 'manual_appraisal'.  A DB constraint is NOT added to
 * fmv_verification_source because it would reject the legacy sim value.
 */
export const CONTROLLING_VALUE_SOURCES = [
  "owner_estimate",
  "rentcast",
  "attom",
  "manual_appraisal",
  "admin_adjusted",
  "title_findings",
] as const;

export type ControllingValueSource =
  (typeof CONTROLLING_VALUE_SOURCES)[number];

export function isControllingValueSource(
  v: unknown,
): v is ControllingValueSource {
  return CONTROLLING_VALUE_SOURCES.includes(v as ControllingValueSource);
}

// ────────────────────────────────────────────────────────────────────────────
// Eligibility posture values
// ────────────────────────────────────────────────────────────────────────────

/**
 * Canonical values for properties.current_eligibility_posture.
 */
export const ELIGIBILITY_POSTURES = [
  "eligible",
  "ineligible",
  "under_review",
  "requires_enhanced_review",
  "blocked",
] as const;

export type EligibilityPosture = (typeof ELIGIBILITY_POSTURES)[number];

export function isEligibilityPosture(v: unknown): v is EligibilityPosture {
  return ELIGIBILITY_POSTURES.includes(v as EligibilityPosture);
}

// ────────────────────────────────────────────────────────────────────────────
// States that carry the Owner Verified badge
// ────────────────────────────────────────────────────────────────────────────

/**
 * verification_state values for which the "Owner Verified" public badge is shown,
 * provided owner_verification_removed_at is null.
 */
export const OWNER_VERIFIED_BADGE_STATES: ReadonlySet<VerificationState> = new Set<VerificationState>([
  "owner_verified",
  "screening_in_progress",
  "owner_clarification_required",
  "manual_review_required",
  "verified_for_deals",
]);
