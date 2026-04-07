"use client";

import { useState } from "react";
import Link from "next/link";
import { PropertyForm } from "@/components/properties/PropertyForm";
import { PropertyDocumentsPanel } from "@/components/properties/PropertyDocumentsPanel";
import {
  ReviewRequestPanel,
  type HomeownerReviewRequest,
} from "@/components/properties/ReviewRequestPanel";
import {
  PropertyValuationSections,
  type LiveIneligiblePhase,
} from "@/components/properties/PropertyValuationSections";
import {
  PropertyActivityTimeline,
  type PropertyAuditEntry,
} from "@/components/properties/PropertyActivityTimeline";
import type { HomeownerPropertyShape } from "@/lib/property/projections";
import {
  shouldShowOwnerVerifiedBadge,
  shouldShowVerifiedAppraisalValueBadge,
  isAppraisalBadgeExpired,
  isAppraisalBadgeUnderReview,
} from "@/lib/property/badges";
import {
  EnrichedPropertyPreview,
  type EnrichedPreviewData,
} from "@/components/property/EnrichedPropertyPreview";
import { PropertyStatusLanes } from "@/components/properties/PropertyStatusLanes";
import {
  deriveParticipationLane,
  deriveValuationLane,
  deriveClosingReadinessLane,
  valueLabelFromValuationLane,
} from "@/lib/property/statusLanes";

type LinkedDeal = {
  thread_id: string;
  thread_status: string;
  deal_id: string | null;
  deal_status: string | null;
  deal_title: string | null;
  deal_triage_status: string | null;
} | null;

export type PropertyWorkflowState = {
  propertyStatus: string | null;
  propertyReviewStatus: string | null;
  escalationDepositStatus: string | null;
  escalationAvmStatus: string | null;
  latestVerifiedFmv: number | null;
  fmvVerificationSource: string | null;
  rentcastFmv: number | null;
  rentcastProvider: string | null;
  /**
   * ATTOM-first ineligible deal phase for the linked deal.
   * - 'attom_required'    — ineligible under RentCast; ATTOM not yet complete; renegotiation blocked.
   * - 'void_renegotiable' — ATTOM complete; deal still ineligible; renegotiation + appraisal available.
   * - null               — no live ineligible deal or deal is eligible.
   */
  liveIneligiblePhase: LiveIneligiblePhase;
  /** Manual appraisal challenge status (exception branch, not happy-path). */
  manualAppraisalStatus: string | null;
  /** FMV result from completed manual appraisal (null until complete). */
  manualAppraisalFmv: number | null;
  /**
   * Whether the owner has already submitted an ATTOM enhanced valuation request.
   * Derived server-side from property_status_audit.
   */
  ownerAttemptedAttom: boolean;
  /**
   * ISO timestamp of when the most recent real ATTOM admin screening completed.
   * Null if no screening has been run. Used on the owner page to show
   * "enhanced review completed on [date]" without leaking internal details.
   */
  attomScreeningCompletedAt: string | null;
  /**
   * Debt discrepancy fields from ATTOM normalized screening payload.
   * Shown only when ATTOM has completed and flagged a non-trivial discrepancy.
   * All optional — the section is suppressed when not present.
   */
  attomEstimatedDebt?: number | null;
  ownerDeclaredDebt?: number | null;
  debtDiscrepancySeverity?: string | null;
  debtDiscrepancyDelta?: number | null;
};

type Props = {
  property: HomeownerPropertyShape;
  linkedDeal: LinkedDeal;
  reviewRequest?: HomeownerReviewRequest | null;
  workflowState?: PropertyWorkflowState | null;
  /** Audit entries from property_status_audit for the activity timeline */
  activityEntries?: PropertyAuditEntry[];
  /** Enriched property preview data — shown to owner when available */
  enrichment?: EnrichedPreviewData | null;
};

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; className: string; hint: string }> = {
  unverified: {
    label: "Unverified",
    className: "bg-yellow-100 text-yellow-800",
    hint: "Not yet reviewed by FractPath",
  },
  under_review: {
    label: "Under review",
    className: "bg-blue-100 text-blue-800",
    hint: "Being reviewed by FractPath",
  },
  verified: {
    label: "Verified ✓",
    className: "bg-green-100 text-green-800",
    hint: "Approved for participation",
  },
  archived: {
    label: "Archived",
    className: "bg-gray-100 text-gray-600",
    hint: "No longer active",
  },
};

// ── Label maps ────────────────────────────────────────────────────────────────

const OWNERSHIP_TYPE_LABELS: Record<string, string> = {
  sole: "Sole ownership",
  joint_married: "Joint (married)",
  joint_unmarried: "Joint (unmarried)",
  trust_estate: "Trust or estate",
  other: "Other",
};

const OCCUPANCY_USE_LABELS: Record<string, string> = {
  primary: "Primary residence",
  secondary: "Secondary / vacation home",
  rental: "Rental property",
  vacant: "Vacant",
  other: "Other",
};

const DEBT_CONFIDENCE_LABELS: Record<string, string> = {
  exact: "Exact",
  estimated: "Estimated",
  unknown: "Unknown",
};

const DEBT_AVAILABILITY_LABELS: Record<string, string> = {
  available: "Available",
  can_obtain: "Can obtain",
  unavailable: "Unavailable",
};

const FMV_CONFIDENCE_LABELS: Record<string, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

const FMV_SOURCE_LABELS: Record<string, string> = {
  appraisal: "Professional appraisal",
  zillow: "Online estimate (Zillow / similar)",
  agent: "Real estate agent opinion",
  personal: "Personal assessment",
  other: "Other",
};

const PROCEED_LABELS: Record<string, string> = {
  yes: "Yes",
  no: "No",
  not_sure: "Not sure",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function label(map: Record<string, string>, val: string | null | undefined): string | null {
  if (!val) return null;
  return map[val] ?? val;
}

function fmtMoney(n: number | null | undefined): string | null {
  if (n == null) return null;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function fmtDateShort(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  } catch {
    return null;
  }
}

function canEdit(status: string): boolean {
  return status === "unverified";
}

// ── Row ───────────────────────────────────────────────────────────────────────

function Row({ fieldLabel, value }: { fieldLabel: string; value: string | null | undefined }) {
  if (!value && value !== "0") return null;
  return (
    <div className="flex gap-3 py-2 border-b last:border-0">
      <span className="w-48 shrink-0 text-xs text-muted-foreground leading-5">{fieldLabel}</span>
      <span className="text-sm text-foreground leading-5">{value}</span>
    </div>
  );
}

// ── Simplified property status widget (non-escalation states only) ─────────────
// Escalation states (enhanced review, ATTOM, manual appraisal) are now handled by
// PropertyValuationSections below. This widget only handles early-stage status cards.

function PropertyWorkflowWidget({ state }: { state: PropertyWorkflowState }) {
  const {
    propertyStatus,
    propertyReviewStatus,
    rentcastProvider,
    escalationAvmStatus,
    manualAppraisalStatus,
  } = state;

  // Once ATTOM or manual appraisal has reached a resolved state, the rentcast-level
  // "Review in progress" card is superseded. PropertyValuationSections handles those states.
  const escalationResolved =
    escalationAvmStatus === "completed" || manualAppraisalStatus === "complete";

  // Verified check must come FIRST — property.status is the authoritative participation
  // state.  A stale property_review_status must not override it with "under review".
  if (propertyStatus === "verified") {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-emerald-900">Property verified</span>
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
            Verified
          </span>
        </div>
        <p className="text-xs text-emerald-800">
          Your property has been verified. Our team is continuing to review your file.
        </p>
      </div>
    );
  }

  if (
    !escalationResolved &&
    (propertyReviewStatus === "amv_complete" ||
      propertyReviewStatus === "property_review_complete")
  ) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-green-900">Market analysis complete</span>
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 border border-green-200">
            Review in progress
          </span>
        </div>
        <p className="text-xs text-green-800">
          {rentcastProvider
            ? `A ${rentcastProvider} market analysis has been completed for your property. `
            : "A market analysis has been completed for your property. "}
          Our team is reviewing the results and will notify you if anything further is needed.
        </p>
      </div>
    );
  }

  if (!escalationResolved && propertyReviewStatus) {
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-blue-900">Property under review</span>
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
            In review
          </span>
        </div>
        <p className="text-xs text-blue-800">
          Your property is currently being reviewed by our team. We will contact you if additional information is needed.
        </p>
      </div>
    );
  }

  return null;
}

// ── Main component ────────────────────────────────────────────────────────────

export function PropertyDetailClient({
  property,
  linkedDeal,
  reviewRequest,
  workflowState,
  activityEntries = [],
  enrichment = null,
}: Props) {
  const [editOpen, setEditOpen] = useState(false);

  const badge = STATUS_BADGE[property.status] ?? STATUS_BADGE.unverified;

  const showOwnerVerifiedBadge = shouldShowOwnerVerifiedBadge(
    property.verification_state ?? null,
    property.owner_verification_removed_at ?? null,
  );
  const showVerifiedAppraisalBadge = shouldShowVerifiedAppraisalValueBadge(
    property.verified_appraisal_value_status ?? null,
  );
  const appraisalExpired = isAppraisalBadgeExpired(
    property.verified_appraisal_value_status ?? null,
  );
  const appraisalUnderReview = isAppraisalBadgeUnderReview(
    property.verified_appraisal_value_status ?? null,
  );

  const hasAnyIntake =
    property.ownership_type ||
    property.occupancy_use ||
    property.major_condition_issue ||
    (property.known_liens_and_claims && property.known_liens_and_claims.length > 0) ||
    property.total_known_debt_amount != null ||
    property.debt_statement_availability ||
    property.title_claims_known ||
    property.owner_stated_fmv != null ||
    property.willing_to_proceed_formal_review;

  // Three-lane status derivation
  const ownerParticipationLane = deriveParticipationLane(property.status);
  const ownerValuationLane = workflowState
    ? deriveValuationLane({
        manualAppraisalStatus: workflowState.manualAppraisalStatus,
        escalationAvmStatus: workflowState.escalationAvmStatus,
        fmvVerificationSource: workflowState.fmvVerificationSource,
        latestVerifiedFmv: workflowState.latestVerifiedFmv,
      })
    : deriveValuationLane({
        manualAppraisalStatus: null,
        escalationAvmStatus: null,
        fmvVerificationSource: null,
        latestVerifiedFmv: null,
      });
  const ownerClosingReadinessLane = deriveClosingReadinessLane({
    hasAcceptedDeal: linkedDeal?.thread_status === "accepted",
    propertyReviewStatus: workflowState?.propertyReviewStatus ?? null,
  });

  return (
    <div className="space-y-6">
      {/* Back link */}
      <div>
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground underline"
        >
          ← Back to dashboard
        </Link>
      </div>

      {/* Early-stage property review status (before escalation/AVM) */}
      {workflowState && <PropertyWorkflowWidget state={workflowState} />}

      {/* Property valuations — distinct RentCast / ATTOM / Manual Appraisal sections */}
      {workflowState &&
        (workflowState.rentcastFmv != null ||
          workflowState.escalationDepositStatus ||
          workflowState.escalationAvmStatus ||
          workflowState.ownerAttemptedAttom ||
          workflowState.manualAppraisalStatus ||
          workflowState.liveIneligiblePhase !== null ||
          workflowState.fmvVerificationSource === "attom") && (
          <PropertyValuationSections
            propertyId={property.id}
            rentcastFmv={workflowState.rentcastFmv}
            rentcastProvider={workflowState.rentcastProvider}
            escalationDepositStatus={workflowState.escalationDepositStatus}
            escalationAvmStatus={workflowState.escalationAvmStatus}
            ownerAttemptedAttom={workflowState.ownerAttemptedAttom}
            manualAppraisalStatus={workflowState.manualAppraisalStatus}
            manualAppraisalFmv={workflowState.manualAppraisalFmv}
            latestVerifiedFmv={workflowState.latestVerifiedFmv}
            fmvVerificationSource={workflowState.fmvVerificationSource}
            liveIneligiblePhase={workflowState.liveIneligiblePhase}
            linkedDealId={linkedDeal?.deal_id ?? null}
            attomScreeningCompletedAt={workflowState.attomScreeningCompletedAt}
            attomEstimatedDebt={workflowState.attomEstimatedDebt}
            ownerDeclaredDebt={workflowState.ownerDeclaredDebt}
            debtDiscrepancySeverity={workflowState.debtDiscrepancySeverity}
            debtDiscrepancyDelta={workflowState.debtDiscrepancyDelta}
          />
        )}

      {/* Property summary */}
      <div className="rounded-lg border p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg font-semibold leading-tight">
            {property.address_display || property.address_line1}
          </h1>
          {canEdit(property.status) && (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="shrink-0 text-sm underline text-muted-foreground hover:text-foreground"
            >
              Edit
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
          >
            {badge.label}
          </span>
          <span className="text-xs text-muted-foreground">{badge.hint}</span>

          {showOwnerVerifiedBadge && (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                <path fillRule="evenodd" d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm3.844 4.574a.75.75 0 0 1 .082 1.058l-3.5 4a.75.75 0 0 1-1.09.058L5.086 8.44a.75.75 0 0 1 1.08-1.043l1.696 1.753 2.96-3.385a.75.75 0 0 1 1.022-.19Z" clipRule="evenodd" />
              </svg>
              Owner Verified
            </span>
          )}

          {showVerifiedAppraisalBadge && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border ${
              appraisalUnderReview
                ? "bg-blue-50 text-blue-800 border-blue-200"
                : "bg-violet-100 text-violet-800 border-violet-200"
            }`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                <path d="M6.5 9a2.5 2.5 0 1 1 5 0 2.5 2.5 0 0 1-5 0Z" />
                <path fillRule="evenodd" d="M1.5 1A1.5 1.5 0 0 0 0 2.5v11A1.5 1.5 0 0 0 1.5 15h13a1.5 1.5 0 0 0 1.5-1.5v-11A1.5 1.5 0 0 0 14.5 1h-13Zm1 3a.5.5 0 0 1 .5-.5H5a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5Zm.5 2.5a.5.5 0 0 0 0 1h1a.5.5 0 0 0 0-1H3Zm5.5 4.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" clipRule="evenodd" />
              </svg>
              {appraisalUnderReview
                ? "Appraisal under review"
                : ownerValuationLane.label === "Appraised"
                  ? "Appraised value"
                  : "Reviewed valuation basis"}
            </span>
          )}

          {appraisalExpired && (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200">
              Appraisal expired
            </span>
          )}

          {/* Valid-until hint — only when badge is active (not under review, not expired) */}
          {showVerifiedAppraisalBadge && !appraisalUnderReview && !appraisalExpired &&
            property.property_review_expires_at &&
            fmtDateShort(property.property_review_expires_at) && (
            <span className="text-xs text-muted-foreground">
              Valid until {fmtDateShort(property.property_review_expires_at)}
            </span>
          )}
        </div>

        {property.ownership_status && (
          <div className="text-xs text-muted-foreground">
            Ownership status: {property.ownership_status}
          </div>
        )}
      </div>

      {/* Three-lane status block */}
      <PropertyStatusLanes
        participation={ownerParticipationLane}
        valuation={ownerValuationLane}
        closingReadiness={ownerClosingReadinessLane}
      />

      {/* Enriched property preview — shown to owner when enrichment is available */}
      {enrichment && (
        <div className="rounded-lg border overflow-hidden">
          <div className="bg-muted/40 px-4 py-2 border-b">
            <span className="text-sm font-medium">Property Preview</span>
          </div>
          <div className="p-4">
            <EnrichedPropertyPreview
              audience="owner"
              enrichment={enrichment}
              valuationLabel={valueLabelFromValuationLane(ownerValuationLane.label)}
            />
          </div>
        </div>
      )}

      {/* Valuation confirmed card — plain-language trust signal when appraisal badge is active */}
      {showVerifiedAppraisalBadge && !appraisalUnderReview && !appraisalExpired && (
        <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 space-y-1.5">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-violet-700 shrink-0">
              <path fillRule="evenodd" d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm3.844 4.574a.75.75 0 0 1 .082 1.058l-3.5 4a.75.75 0 0 1-1.09.058L5.086 8.44a.75.75 0 0 1 1.08-1.043l1.696 1.753 2.96-3.385a.75.75 0 0 1 1.022-.19Z" clipRule="evenodd" />
            </svg>
            <span className="text-sm font-semibold text-violet-900">
              {ownerValuationLane.label === "Appraised" ? "Appraised value" : "Reviewed valuation basis"}
            </span>
          </div>
          <p className="text-xs text-violet-800">
            {ownerValuationLane.label === "Appraised"
              ? "Your property's value has been independently appraised and is on file for your deal."
              : "A reviewed valuation basis has been adopted for your property through our review process. This basis is active and on file for your deal."}
          </p>
          {property.property_review_expires_at && fmtDateShort(property.property_review_expires_at) && (
            <p className="text-xs text-violet-700">
              This verification is valid through{" "}
              <span className="font-medium">{fmtDateShort(property.property_review_expires_at)}</span>.
            </p>
          )}
        </div>
      )}

      {/* Submitted property details */}
      {hasAnyIntake ? (
        <div className="rounded-lg border p-5 space-y-1">
          <h2 className="text-sm font-semibold mb-3">Submitted property details</h2>

          <Row
            fieldLabel="Ownership type"
            value={label(OWNERSHIP_TYPE_LABELS, property.ownership_type)}
          />
          <Row
            fieldLabel="How you use this property"
            value={
              property.occupancy_use === "other" && property.occupancy_use_other
                ? `Other — ${property.occupancy_use_other}`
                : label(OCCUPANCY_USE_LABELS, property.occupancy_use)
            }
          />
          <Row
            fieldLabel="Known major condition issues"
            value={
              property.major_condition_issue === "yes"
                ? `Yes${property.major_condition_issue_details ? ` — ${property.major_condition_issue_details}` : ""}`
                : property.major_condition_issue === "no"
                  ? "No"
                  : null
            }
          />
          <Row
            fieldLabel="Known liens and claims"
            value={
              property.known_liens_and_claims &&
              property.known_liens_and_claims.length > 0
                ? property.known_liens_and_claims.join(", ")
                : null
            }
          />
          <Row
            fieldLabel="Total known debt"
            value={fmtMoney(property.total_known_debt_amount)}
          />
          {property.total_known_debt_confidence && (
            <Row
              fieldLabel="Debt estimate confidence"
              value={label(DEBT_CONFIDENCE_LABELS, property.total_known_debt_confidence)}
            />
          )}
          <Row
            fieldLabel="Debt statement availability"
            value={label(DEBT_AVAILABILITY_LABELS, property.debt_statement_availability)}
          />
          <Row
            fieldLabel="Title claims"
            value={
              property.title_claims_known === "yes"
                ? `Yes${property.title_claims_details ? ` — ${property.title_claims_details}` : ""}`
                : property.title_claims_known === "no"
                  ? "No"
                  : null
            }
          />
          <Row
            fieldLabel="Estimated market value"
            value={fmtMoney(property.owner_stated_fmv)}
          />
          {property.owner_stated_fmv != null && (
            <>
              <Row
                fieldLabel="Estimate confidence"
                value={label(FMV_CONFIDENCE_LABELS, property.owner_stated_fmv_confidence)}
              />
              <Row
                fieldLabel="How you estimated value"
                value={
                  property.owner_stated_fmv_source === "other" &&
                  property.owner_stated_fmv_source_other
                    ? `Other — ${property.owner_stated_fmv_source_other}`
                    : label(FMV_SOURCE_LABELS, property.owner_stated_fmv_source)
                }
              />
            </>
          )}
          <Row
            fieldLabel="Willing to proceed with formal review"
            value={label(PROCEED_LABELS, property.willing_to_proceed_formal_review)}
          />
        </div>
      ) : (
        <div className="rounded-lg border p-5">
          <h2 className="text-sm font-semibold mb-2">Submitted property details</h2>
          <p className="text-sm text-muted-foreground">
            No intake details have been submitted yet.{" "}
            {canEdit(property.status) && (
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="underline hover:text-foreground"
              >
                Edit property
              </button>
            )}
          </p>
        </div>
      )}

      {/* Proposal preferences */}
      <div className="rounded-lg border p-5 space-y-1">
        <h2 className="text-sm font-semibold mb-3">Proposal preferences</h2>
        {property.proposal_interest_status === "interested_after_verification" ? (
          <>
            <Row
              fieldLabel="Proposals"
              value="Enabled after verification"
            />
            <Row
              fieldLabel="Visibility"
              value={
                property.visibility_preference === "public"
                  ? "Public"
                  : property.visibility_preference === "matched"
                    ? "Matched buyers only"
                    : "Private"
              }
            />
            <Row
              fieldLabel="Terms acknowledgment"
              value={
                property.proposal_preferences_acknowledged_at
                  ? "Accepted"
                  : "Pending"
              }
            />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            You have not enabled proposals for this property.{" "}
            {canEdit(property.status) && (
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="underline hover:text-foreground"
              >
                Edit property
              </button>
            )}{" "}
            to update your preferences.
          </p>
        )}
      </div>

      {/* Review request panel */}
      {reviewRequest && (reviewRequest.status === "open" || reviewRequest.status === "submitted") && (
        <ReviewRequestPanel
          request={reviewRequest}
          propertyId={property.id}
          onOpenEdit={() => setEditOpen(true)}
        />
      )}

      {/* Documents */}
      <PropertyDocumentsPanel
        propertyId={property.id}
        onOpenEdit={() => setEditOpen(true)}
        editAllowed={canEdit(property.status)}
      />

      {/* Linked deal */}
      {linkedDeal?.deal_id && (
        <div className="rounded-lg border p-5 space-y-2">
          <h2 className="text-sm font-semibold">Linked deal</h2>
          {linkedDeal.deal_title && (
            <p className="text-sm text-foreground">{linkedDeal.deal_title}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Thread status:{" "}
            <span className="font-medium capitalize">
              {linkedDeal.thread_status.replace(/_/g, " ")}
            </span>
          </p>
          {linkedDeal.deal_triage_status && (
            <p className="text-xs text-muted-foreground">
              Deal status:{" "}
              <span className="font-medium capitalize">
                {linkedDeal.deal_triage_status.replace(/_/g, " ")}
              </span>
            </p>
          )}
          <Link
            href={`/deal/${linkedDeal.deal_id}`}
            className="inline-block text-sm underline hover:text-foreground"
          >
            View deal →
          </Link>
        </div>
      )}

      {/* Property activity timeline */}
      {activityEntries.length > 0 && (
        <PropertyActivityTimeline entries={activityEntries} />
      )}

      {/* Actions */}
      <div className="flex gap-3 flex-wrap">
        {canEdit(property.status) && (
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            Edit property details
          </button>
        )}
        <Link
          href="/dashboard"
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted/40"
        >
          Back to dashboard
        </Link>
      </div>

      {/* Edit modal */}
      {editOpen && (
        <PropertyForm
          open={true}
          onClose={() => setEditOpen(false)}
          onSuccess={() => {
            setEditOpen(false);
            window.location.reload();
          }}
          context="profile"
          editPrefill={{
            propertyId: property.id,
            address_line1: property.address_line1,
            address_line2: property.address_line2 ?? "",
            city: property.city ?? "",
            state: property.state,
            postal_code: property.postal_code,
            ownership_type: property.ownership_type,
            occupancy_use: property.occupancy_use,
            occupancy_use_other: property.occupancy_use_other,
            major_condition_issue: property.major_condition_issue,
            major_condition_issue_details: property.major_condition_issue_details,
            known_liens_and_claims: property.known_liens_and_claims,
            total_known_debt_amount: property.total_known_debt_amount,
            total_known_debt_confidence: property.total_known_debt_confidence,
            debt_statement_availability: property.debt_statement_availability,
            title_claims_known: property.title_claims_known,
            title_claims_details: property.title_claims_details,
            owner_stated_fmv: property.owner_stated_fmv,
            owner_stated_fmv_confidence: property.owner_stated_fmv_confidence,
            owner_stated_fmv_source: property.owner_stated_fmv_source,
            owner_stated_fmv_source_other: property.owner_stated_fmv_source_other,
            willing_to_proceed_formal_review: property.willing_to_proceed_formal_review,
          }}
        />
      )}
    </div>
  );
}
