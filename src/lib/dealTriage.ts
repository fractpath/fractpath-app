/**
 * Deterministic Sprint 16 triage evaluator.
 *
 * Reads homeowner intake fields from an accepted deal's linked property and
 * returns an internal triage outcome. All rules are pure and deterministic —
 * no AI, no external APIs, no RentCast.
 *
 * Internal routing:
 *   A = ready_for_deposit      (straight-through)
 *   B = triage_in_progress     (manual review needed)
 *   C = more_info_needed       (critical gap in intake)
 *   D = ineligible             (hard stop)
 *
 * NEVER expose A/B/C/D labels to end users. User-facing copy is handled by
 * the UI layer and maps to: "Accepted – pending review", "Additional
 * information required", "Review deposit required", "Formal review in progress".
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TriageStatus =
  | "ready_for_deposit"
  | "triage_in_progress"
  | "more_info_needed"
  | "ineligible";

export type FmvPlausibilityFlag = "green" | "yellow" | "red";

export type TriageReasonTag =
  | "co_owner"
  | "trust_estate"
  | "debt_unclear"
  | "lien_risk"
  | "value_confidence_low"
  | "condition_issue"
  | "taxes_or_judgment_disclosed"
  | "unusual_property"
  | "missing_information"
  | "hard_stop";

export interface TriageIntakeFields {
  ownership_type?: string | null;
  occupancy_use?: string | null;
  occupancy_use_other?: string | null;
  major_condition_issue?: string | null;
  major_condition_issue_details?: string | null;
  known_liens_and_claims?: string[] | null;
  total_known_debt_amount?: number | null;
  total_known_debt_confidence?: string | null;
  debt_statement_availability?: string | null;
  title_claims_known?: string | null;
  title_claims_details?: string | null;
  owner_stated_fmv?: number | null;
  owner_stated_fmv_confidence?: string | null;
  owner_stated_fmv_source?: string | null;
  owner_stated_fmv_source_other?: string | null;
  willing_to_proceed_formal_review?: string | null;
}

export interface TriageResult {
  triage_status: TriageStatus;
  triage_reason_tags: TriageReasonTag[];
  fmv_plausibility_flag: FmvPlausibilityFlag;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STRONG_FMV_SOURCES = new Set(["appraisal", "realtor_cma"]);
const WEAK_FMV_SOURCES = new Set(["personal"]);
const STRONG_FMV_CONFIDENCE = new Set(["very_confident", "somewhat"]);
const WEAK_FMV_CONFIDENCE = new Set(["low", "not_sure"]);

const COMPLEX_OWNERSHIP = new Set(["co_owner", "trust", "estate"]);
const TRUST_ESTATE_OWNERSHIP = new Set(["trust", "estate"]);
const UNUSUAL_OCCUPANCY = new Set(["vacant", "second_home", "other", "rental"]);

const HIGH_RISK_LIEN_TYPES = new Set(["tax_lien", "judgment"]);
const NON_LIEN_ANSWERS = new Set(["none_known", "not_sure"]);

// ---------------------------------------------------------------------------
// FMV plausibility
// ---------------------------------------------------------------------------

function evaluateFmvPlausibility(
  intake: TriageIntakeFields,
): FmvPlausibilityFlag {
  const source = intake.owner_stated_fmv_source ?? null;
  const confidence = intake.owner_stated_fmv_confidence ?? null;

  // No FMV stated at all — treat as yellow (unassessable, not red)
  if (intake.owner_stated_fmv == null) return "yellow";

  const isStrongSource = source !== null && STRONG_FMV_SOURCES.has(source);
  const isWeakSource = source === null || WEAK_FMV_SOURCES.has(source);
  const isStrongConfidence =
    confidence !== null && STRONG_FMV_CONFIDENCE.has(confidence);
  const isWeakConfidence =
    confidence === null || WEAK_FMV_CONFIDENCE.has(confidence);

  // Red: weak source AND weak confidence
  if (isWeakSource && isWeakConfidence) return "red";

  // Green: strong source AND strong confidence AND no condition issue
  if (
    isStrongSource &&
    isStrongConfidence &&
    intake.major_condition_issue !== "yes"
  ) {
    return "green";
  }

  // Everything else: yellow
  return "yellow";
}

// ---------------------------------------------------------------------------
// Tag helpers
// ---------------------------------------------------------------------------

function addTag(tags: TriageReasonTag[], tag: TriageReasonTag): void {
  if (!tags.includes(tag)) tags.push(tag);
}

// ---------------------------------------------------------------------------
// Main evaluator
// ---------------------------------------------------------------------------

/**
 * Deterministically evaluates triage outcome from Sprint 16 intake fields.
 *
 * Evaluation order: D → C → B → A
 * The first matching tier wins.
 */
export function evaluateDealTriage(intake: TriageIntakeFields): TriageResult {
  const tags: TriageReasonTag[] = [];
  const fmv = evaluateFmvPlausibility(intake);

  const liens = intake.known_liens_and_claims ?? [];
  const realLiens = liens.filter((v) => !NON_LIEN_ANSWERS.has(v));
  const hasUncertainLiens = liens.includes("not_sure");
  const hasHighRiskLiens = realLiens.some((v) => HIGH_RISK_LIEN_TYPES.has(v));
  const hasAnyRealLien = realLiens.length > 0;

  // -------------------------------------------------------------------------
  // D — Hard stop (ineligible)
  // -------------------------------------------------------------------------

  // 1. Explicit unwillingness
  if (intake.willing_to_proceed_formal_review === "no") {
    addTag(tags, "hard_stop");
    return { triage_status: "ineligible", triage_reason_tags: tags, fmv_plausibility_flag: fmv };
  }

  // 2. FMV plausibility red — stated value not credible
  if (fmv === "red") {
    addTag(tags, "value_confidence_low");
    addTag(tags, "hard_stop");
    return { triage_status: "ineligible", triage_reason_tags: tags, fmv_plausibility_flag: fmv };
  }

  // -------------------------------------------------------------------------
  // C — Missing critical facts (more_info_needed)
  // -------------------------------------------------------------------------

  const missingInfo: string[] = [];

  if (intake.ownership_type === "not_sure") {
    missingInfo.push("ownership_type_unknown");
    addTag(tags, "missing_information");
  }

  if (hasAnyRealLien && intake.total_known_debt_amount == null) {
    missingInfo.push("liens_without_debt_amount");
    addTag(tags, "debt_unclear");
  }

  if (liens.includes("other_claim") && !intake.title_claims_details?.trim()) {
    missingInfo.push("other_claim_no_explanation");
    addTag(tags, "missing_information");
  }

  if (
    intake.title_claims_known === "yes" &&
    !intake.title_claims_details?.trim()
  ) {
    missingInfo.push("title_claims_no_details");
    addTag(tags, "missing_information");
  }

  if (
    intake.major_condition_issue === "yes" &&
    !intake.major_condition_issue_details?.trim()
  ) {
    missingInfo.push("condition_issue_no_details");
    addTag(tags, "missing_information");
  }

  if (
    intake.owner_stated_fmv != null &&
    !intake.owner_stated_fmv_source
  ) {
    missingInfo.push("fmv_no_source");
    addTag(tags, "value_confidence_low");
  }

  if (intake.willing_to_proceed_formal_review === "maybe") {
    missingInfo.push("willingness_maybe");
    addTag(tags, "missing_information");
  }

  if (hasUncertainLiens) {
    missingInfo.push("debt_uncertainty_flagged");
    addTag(tags, "debt_unclear");
  }

  if (missingInfo.length > 0) {
    return { triage_status: "more_info_needed", triage_reason_tags: tags, fmv_plausibility_flag: fmv };
  }

  // -------------------------------------------------------------------------
  // B — Manual review (triage_in_progress)
  // -------------------------------------------------------------------------

  const reviewReasons: string[] = [];

  if (intake.ownership_type === "co_owner") {
    reviewReasons.push("co_owner");
    addTag(tags, "co_owner");
  }

  if (TRUST_ESTATE_OWNERSHIP.has(intake.ownership_type ?? "")) {
    reviewReasons.push("trust_or_estate");
    addTag(tags, "trust_estate");
  }

  if (UNUSUAL_OCCUPANCY.has(intake.occupancy_use ?? "")) {
    reviewReasons.push("unusual_occupancy");
    addTag(tags, "unusual_property");
  }

  if (intake.major_condition_issue === "yes") {
    reviewReasons.push("condition_issue");
    addTag(tags, "condition_issue");
  }

  if (
    intake.total_known_debt_confidence === "not_sure" ||
    intake.debt_statement_availability === "no" ||
    intake.debt_statement_availability === "partially"
  ) {
    reviewReasons.push("debt_unclear");
    addTag(tags, "debt_unclear");
  }

  if (intake.title_claims_known === "yes") {
    reviewReasons.push("title_or_lien_claims");
    addTag(tags, "taxes_or_judgment_disclosed");
  }

  if (hasHighRiskLiens) {
    reviewReasons.push("high_risk_liens");
    addTag(tags, "taxes_or_judgment_disclosed");
  }

  if (hasAnyRealLien) {
    reviewReasons.push("liens_present");
    addTag(tags, "lien_risk");
  }

  if (fmv === "yellow") {
    reviewReasons.push("fmv_yellow");
    addTag(tags, "value_confidence_low");
  }

  if (COMPLEX_OWNERSHIP.has(intake.ownership_type ?? "")) {
    // Catch any complex ownership type not already tagged
    if (!tags.includes("co_owner") && !tags.includes("trust_estate")) {
      reviewReasons.push("complex_ownership");
      addTag(tags, "co_owner");
    }
  }

  if (reviewReasons.length > 0) {
    return { triage_status: "triage_in_progress", triage_reason_tags: tags, fmv_plausibility_flag: fmv };
  }

  // -------------------------------------------------------------------------
  // A — Straight-through (ready_for_deposit)
  // All guards passed, no risk signals detected.
  // -------------------------------------------------------------------------
  return {
    triage_status: "ready_for_deposit",
    triage_reason_tags: [],
    fmv_plausibility_flag: fmv,
  };
}
