/**
 * Maps a valuation lane label to a user-facing value label for numeric values.
 *
 * Used by EnrichedPropertyPreview and any surface that shows the Mashvisor
 * value_estimate with a label that matches the active valuation confidence level.
 *
 * - "Source value"       — raw owner-provided / third-party estimate, not reviewed
 * - "Reviewed value"     — automated valuation or ATTOM-reviewed basis
 * - "Appraised value"    — manual appraisal on file
 */
export function valueLabelFromValuationLane(laneLabel: string): string {
  if (laneLabel === "Appraised") return "Appraised value";
  if (laneLabel === "Valuation reviewed") return "Reviewed value";
  return "Source value";
}

/**
 * Three-lane property status derivation.
 *
 * Participation  — eligibility / ownership verification
 * Valuation      — confidence in the property value
 * Closing readiness — underwriting / pre-closing workflow
 *
 * These are PRESENTATION-only helpers.  They map existing DB fields to
 * consistent labels; they do not mutate any state.
 */

export type LaneVariant =
  | "emerald"
  | "blue"
  | "amber"
  | "violet"
  | "gray"
  | "red";

export type StatusLane = {
  label: string;
  tooltip: string;
  variant: LaneVariant;
};

export type ThreeLaneStatus = {
  participation: StatusLane;
  valuation: StatusLane;
  closingReadiness: StatusLane;
};

// ─── Participation ────────────────────────────────────────────────────────────

/**
 * Derived from properties.status.
 * "Verified" means the owner's claim has been reviewed enough to participate.
 * It does NOT imply valuation accuracy.
 */
export function deriveParticipationLane(status: string | null): StatusLane {
  if (status === "verified") {
    return {
      label: "Verified",
      tooltip:
        "The owner's identity and property claim have been reviewed enough to participate in FractPath negotiations. This does not mean the property value has been professionally appraised.",
      variant: "emerald",
    };
  }
  if (status === "under_review") {
    return {
      label: "Under review",
      tooltip: "The property is currently being reviewed for participation eligibility.",
      variant: "blue",
    };
  }
  return {
    label: "Unverified",
    tooltip: "This property has not yet completed verification.",
    variant: "gray",
  };
}

// ─── Valuation ────────────────────────────────────────────────────────────────

export type ValuationLaneInput = {
  manualAppraisalStatus: string | null;
  escalationAvmStatus: string | null;
  fmvVerificationSource: string | null;
  latestVerifiedFmv: number | null;
};

/**
 * Derived from AVM / ATTOM / appraisal presence.
 *
 * Appraised       — manual appraisal complete and controlling
 * Valuation reviewed — AVM / ATTOM run and accepted as controlling
 * Source value    — owner-provided or third-party data only
 */
export function deriveValuationLane(opts: ValuationLaneInput): StatusLane {
  if (opts.manualAppraisalStatus === "complete") {
    return {
      label: "Appraised",
      tooltip:
        "A professional appraisal is on file and is being used as the controlling valuation for this property.",
      variant: "violet",
    };
  }
  if (
    opts.escalationAvmStatus === "completed" ||
    opts.fmvVerificationSource === "attom" ||
    opts.fmvVerificationSource === "manual_appraisal_sim" ||
    opts.fmvVerificationSource === "escalated_sim" ||
    opts.latestVerifiedFmv != null
  ) {
    return {
      label: "Valuation reviewed",
      tooltip:
        "An automated valuation has been reviewed for this property. This supports underwriting but is not the same as a manual appraisal.",
      variant: "blue",
    };
  }
  return {
    label: "Source value",
    tooltip:
      "This value is based on owner-provided or third-party source data and has not yet been professionally confirmed.",
    variant: "amber",
  };
}

// ─── Closing readiness ────────────────────────────────────────────────────────

export type ClosingReadinessInput = {
  /** True only when a deal thread with status='accepted' exists for this property */
  hasAcceptedDeal: boolean;
  /** properties.property_review_status */
  propertyReviewStatus: string | null;
  /** properties.closing_review_status — admin-only, optional */
  closingReviewStatus?: string | null;
};

/**
 * Closing readiness is always "Not started" before a deal is accepted.
 * "Under review" must not appear pre-acceptance.
 */
export function deriveClosingReadinessLane(opts: ClosingReadinessInput): StatusLane {
  if (!opts.hasAcceptedDeal) {
    return {
      label: "Not started",
      tooltip:
        "Underwriting and closing review have not started. This begins after a deal is accepted.",
      variant: "gray",
    };
  }

  // closing_review_status takes precedence when present
  if (
    opts.closingReviewStatus === "complete" ||
    opts.closingReviewStatus === "approved"
  ) {
    return {
      label: "Ready for closing",
      tooltip: "All checks are complete. The deal is ready to proceed to closing.",
      variant: "emerald",
    };
  }
  if (
    opts.closingReviewStatus === "blocked" ||
    opts.closingReviewStatus === "issue_found"
  ) {
    return {
      label: "Issue found",
      tooltip: "A blocker has been identified that must be resolved before closing.",
      variant: "red",
    };
  }

  // Fall back to property_review_status
  if (opts.propertyReviewStatus === "property_review_complete") {
    return {
      label: "Ready for closing",
      tooltip: "All checks are complete. The deal is ready to proceed to closing.",
      variant: "emerald",
    };
  }
  if (opts.propertyReviewStatus === "information_requested") {
    return {
      label: "Issue found",
      tooltip: "A blocker has been identified that must be resolved before closing.",
      variant: "red",
    };
  }

  return {
    label: "Under review",
    tooltip:
      "FractPath is reviewing valuation, debt, and documentation to prepare for closing.",
    variant: "blue",
  };
}
