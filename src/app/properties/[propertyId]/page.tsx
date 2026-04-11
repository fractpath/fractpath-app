import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { AppHeader } from "@/components/layout/AppHeader";
import { PropertyDetailClient } from "@/components/properties/PropertyDetailClient";
import { toHomeownerProperty } from "@/lib/property/projections";
import type { HomeownerReviewRequest } from "@/components/properties/ReviewRequestPanel";
import type { PropertyWorkflowState } from "@/components/properties/PropertyDetailClient";
import type { LiveIneligiblePhase } from "@/components/properties/PropertyValuationSections";
import type { PropertyAuditEntry } from "@/components/properties/PropertyActivityTimeline";
import type { MashvisorImagesPayload } from "@/lib/mashvisor/types";
import type { EnrichedPreviewData, PropertyAvm } from "@/components/property/EnrichedPropertyPreview";
import type { NormalizedPropertyProfile } from "@/lib/property-review/providers/rentcast/types";
import {
  rentcastProfileToFacts,
  reviewedBasisFromProperty,
} from "@/lib/property/propertyFacts";
import type { PropertyRecord } from "@/lib/property/propertyRecord";
import { normalizedProfileToRecord } from "@/lib/property/propertyRecord";
import { PropertyRecordSections } from "@/components/property/PropertyRecordSections";
import { PropertyMediaSection } from "@/components/property/PropertyMediaSection";
import { PropertyPageHeader } from "@/components/property/PropertyPageHeader";
import { ValuationCashSection } from "@/components/property/ValuationCashSection";
import { OwnerPropertyEditControls } from "@/components/property/OwnerPropertyEditControls";
import type { OwnerPhoto, PropertyFactCorrection } from "@/lib/property/photos";
import {
  shouldShowOwnerVerifiedBadge,
  shouldShowVerifiedAppraisalValueBadge,
  isAppraisalBadgeExpired,
  isAppraisalBadgeUnderReview,
} from "@/lib/property/badges";
import { deriveValuationLane } from "@/lib/property/statusLanes";

export const runtime = "nodejs";

const OWNED_SELECT =
  "id, address_line1, address_line2, city, state, postal_code, status, ownership_status, is_private, owner_user_id, claimed_by_user_id, created_by_user_id, created_at, updated_at, has_secured_property_debt, secured_property_debt_amount, secured_debt_verification_status, secured_debt_fresh_until, ownership_type, occupancy_use, occupancy_use_other, major_condition_issue, major_condition_issue_details, known_liens_and_claims, total_known_debt_amount, total_known_debt_confidence, debt_statement_availability, title_claims_known, title_claims_details, owner_stated_fmv, owner_stated_fmv_confidence, owner_stated_fmv_source, owner_stated_fmv_source_other, willing_to_proceed_formal_review, proposal_interest_status, visibility_preference, proposal_preferences_acknowledged_at, property_review_status, escalation_deposit_status, escalation_avm_status, latest_verified_fmv, fmv_verified_at, fmv_verification_source, manual_appraisal_status, manual_appraisal_fmv, verified_at, property_review_expires_at, verification_state, owner_verification_removed_at, verified_appraisal_value_status, verified_appraisal_value_context_owner_id";

function formatAddress(row: any): string {
  return [
    row.address_line1,
    row.address_line2,
    row.city,
    row.state,
    row.postal_code,
  ]
    .filter(Boolean)
    .join(", ");
}

type PageProps = {
  params: Promise<{ propertyId: string }>;
};

export default async function PropertyDetailPage({ params }: PageProps) {
  const { propertyId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `/login?returnTo=${encodeURIComponent(`/properties/${propertyId}`)}`,
    );
  }

  const svc = createServiceClient();

  const { data: row, error } = await (svc.from("properties") as any)
    .select(OWNED_SELECT)
    .eq("id", propertyId)
    .or(
      `owner_user_id.eq.${user.id},created_by_user_id.eq.${user.id},claimed_by_user_id.eq.${user.id}`,
    )
    .maybeSingle();

  if (error || !row) {
    notFound();
  }

  const address_display = formatAddress(row);
  const property = toHomeownerProperty(row, {
    address_display,
    visibility: "owned",
  });

  // Fetch AVM summary for the property (non-fatal)
  let rentcastFmv: number | null = null;
  let rentcastProvider: string | null = null;
  let rentcastAvm: PropertyAvm | null = null;
  try {
    const { data: summary } = await (svc.from("property_review_summary") as any)
      .select("fmv_provider, fmv_amount, fmv_low, fmv_high, fmv_confidence, fmv_fetched_at")
      .eq("property_id", propertyId)
      .maybeSingle();
    if (summary) {
      rentcastFmv = summary.fmv_amount ?? null;
      rentcastProvider = summary.fmv_provider ?? null;
      if (summary.fmv_amount != null) {
        rentcastAvm = {
          estimate: summary.fmv_amount,
          low: summary.fmv_low ?? null,
          high: summary.fmv_high ?? null,
          confidence: summary.fmv_confidence ?? null,
          fetchedAt: summary.fmv_fetched_at ?? null,
        };
      }
    }
  } catch {
    // non-fatal
  }

  // Fetch most recent deal thread linked to this property
  let linkedDeal: {
    thread_id: string;
    thread_status: string;
    deal_id: string | null;
    deal_status: string | null;
    deal_title: string | null;
    deal_triage_status: string | null;
  } | null = null;

  try {
    const { data: threadRow } = await (svc.from("deal_threads") as any)
      .select("id, status, deal_id")
      .eq("property_id", propertyId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (threadRow?.deal_id) {
      const { data: dealRow } = await (svc.from("deals") as any)
        .select("id, status, title, triage_status")
        .eq("id", threadRow.deal_id)
        .maybeSingle();

      linkedDeal = {
        thread_id: threadRow.id,
        thread_status: threadRow.status,
        deal_id: threadRow.deal_id,
        deal_status: dealRow?.status ?? null,
        deal_title: dealRow?.title ?? null,
        deal_triage_status: dealRow?.triage_status ?? null,
      };
    } else if (threadRow) {
      linkedDeal = {
        thread_id: threadRow.id,
        thread_status: threadRow.status,
        deal_id: null,
        deal_status: null,
        deal_title: null,
        deal_triage_status: null,
      };
    }
  } catch {
    // non-fatal — proceed without linked deal
  }

  // Fetch property activity audit entries + ownerAttemptedAttom flag (non-fatal)
  let activityEntries: PropertyAuditEntry[] = [];
  let ownerAttemptedAttom = false;
  try {
    const { data: auditRows } = await (svc.from("property_status_audit") as any)
      .select("id, notes, actor_type, from_status, to_status, created_at")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (auditRows) {
      activityEntries = (auditRows as any[]).map((r) => ({
        id: r.id,
        notes: r.notes ?? null,
        actor_type: r.actor_type ?? null,
        from_status: r.from_status ?? null,
        to_status: r.to_status ?? null,
        created_at: r.created_at,
      }));
      ownerAttemptedAttom = activityEntries.some(
        (e) =>
          typeof e.notes === "string" &&
          /ATTOM enhanced valuation requested by owner/i.test(e.notes),
      );
    }
  } catch {
    // non-fatal — proceed without activity
  }

  // Fetch most recent real ATTOM admin screening — completion timestamp + debt discrepancy (non-fatal)
  let attomScreeningCompletedAt: string | null = null;
  let attomEstimatedDebt: number | null = null;
  let ownerDeclaredDebt: number | null = null;
  let debtDiscrepancySeverity: string | null = null;
  let debtDiscrepancyDelta: number | null = null;
  try {
    const { data: attomRun } = await (svc.from("property_review_runs") as any)
      .select("requested_at, normalized_payload")
      .eq("property_id", propertyId)
      .eq("provider", "attom")
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    attomScreeningCompletedAt = attomRun?.requested_at ?? null;
    if (attomRun?.normalized_payload) {
      const ddr = (attomRun.normalized_payload as any)?.debtDiscrepancyResult ?? null;
      if (ddr) {
        attomEstimatedDebt = (ddr.screeningDebt as number | null) ?? null;
        ownerDeclaredDebt = (ddr.reportedDebt as number | null) ?? null;
        debtDiscrepancySeverity = (ddr.severity as string | null) ?? null;
        debtDiscrepancyDelta = (ddr.delta as number | null) ?? null;
      }
    }
  } catch {
    // non-fatal — proceed without screening data
  }

  const workflowState: PropertyWorkflowState = {
    propertyStatus: row.status ?? null,
    propertyReviewStatus: row.property_review_status ?? null,
    escalationDepositStatus: row.escalation_deposit_status ?? null,
    escalationAvmStatus: row.escalation_avm_status ?? null,
    latestVerifiedFmv: row.latest_verified_fmv ?? null,
    fmvVerificationSource: row.fmv_verification_source ?? null,
    rentcastFmv,
    rentcastProvider,
    liveIneligiblePhase: (() => {
      const triageStatus = linkedDeal?.deal_triage_status ?? null;
      const avmStatus = row.escalation_avm_status ?? null;
      const fmvSource = row.fmv_verification_source ?? null;
      // ATTOM is "complete" via either the escalation simulation path
      // (escalation_avm_status === "completed") OR the real ATTOM admin
      // screening path (fmv_verification_source === "attom" / "manual_appraisal_sim").
      // Per policy, once ATTOM-or-stronger is controlling, renegotiation and
      // manual appraisal challenge are both available.
      const attomOrStrongerComplete =
        avmStatus === "completed" ||
        fmvSource === "attom" ||
        fmvSource === "manual_appraisal_sim" ||
        fmvSource === "escalated_sim";
      if (triageStatus !== "ineligible") return null;
      return attomOrStrongerComplete ? "void_renegotiable" : "attom_required";
    })() satisfies LiveIneligiblePhase,
    manualAppraisalStatus: row.manual_appraisal_status ?? null,
    manualAppraisalFmv: row.manual_appraisal_fmv ?? null,
    ownerAttemptedAttom,
    attomScreeningCompletedAt,
    attomEstimatedDebt,
    ownerDeclaredDebt,
    debtDiscrepancySeverity,
    debtDiscrepancyDelta,
  };

  // Fetch open/submitted review request for the linked deal + this property
  let reviewRequest: HomeownerReviewRequest | null = null;
  if (linkedDeal?.deal_id) {
    try {
      const { data: reqRow } = await (svc.from("deal_review_requests") as any)
        .select("id, status, requested_items, admin_note, submitted_at")
        .eq("deal_id", linkedDeal.deal_id)
        .eq("property_id", propertyId)
        .in("status", ["open", "submitted"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (reqRow) {
        reviewRequest = {
          id: reqRow.id,
          status: reqRow.status,
          requested_items: reqRow.requested_items ?? [],
          admin_note: reqRow.admin_note ?? null,
          submitted_at: reqRow.submitted_at ?? null,
        };
      }
    } catch {
      // non-fatal
    }
  }

  // Fetch current RentCast property profile.
  // normalized_payload is the sole product-facing source of truth.
  // raw_payload is stored for auditability only and is not used for rendering.
  let rentcastProfileFacts = null as ReturnType<typeof rentcastProfileToFacts> | null;
  let ownerPropertyRecord: PropertyRecord | null = null;
  try {
    const { data: profileRun } = await (svc.from("property_review_runs") as any)
      .select("normalized_payload, requested_at")
      .eq("property_id", propertyId)
      .eq("provider", "rentcast")
      .eq("artifact_type", "property_profile")
      .eq("is_current", true)
      .eq("status", "completed")
      .maybeSingle();
    if (profileRun?.normalized_payload) {
      const profile = profileRun.normalized_payload as NormalizedPropertyProfile;
      rentcastProfileFacts = rentcastProfileToFacts(profile, profileRun.requested_at ?? null);
      ownerPropertyRecord = normalizedProfileToRecord(profile, profileRun.requested_at ?? null);
    }
  } catch {
    // non-fatal — proceed without RentCast facts
  }

  // Build reviewed/controlling basis for the preview card
  const ownerReviewedBasis = reviewedBasisFromProperty(
    row.latest_verified_fmv ?? null,
    row.fmv_verification_source ?? null,
  );

  // Fetch Mashvisor enrichment for images (non-fatal — images go to hero; facts/AVM go to compact preview)
  let ownerEnrichment: EnrichedPreviewData | null = null;
  let heroImages: MashvisorImagesPayload | null = null;
  try {
    const { data: enrichmentRow } = await (svc.from("property_enrichments") as any)
      .select("summary_payload, images_payload, fetched_at")
      .eq("property_id", propertyId)
      .eq("provider", "mashvisor")
      .eq("is_current", true)
      .eq("status", "completed")
      .maybeSingle();

    const images = enrichmentRow?.images_payload as MashvisorImagesPayload | null ?? null;
    heroImages = images;

    if (rentcastProfileFacts || rentcastAvm || images) {
      ownerEnrichment = {
        summary: enrichmentRow?.summary_payload ?? null,
        // Images are intentionally omitted here — they appear in the hero instead.
        // This prevents gallery duplication between the hero slot and the compact preview.
        images: null,
        fetchedAt: enrichmentRow?.fetched_at ?? null,
        facts: rentcastProfileFacts ?? undefined,
        avm: rentcastAvm,
        reviewedBasis: ownerReviewedBasis,
      };
    }
  } catch {
    // non-fatal — proceed without enrichment
  }

  // If Mashvisor query failed but we have RentCast facts/AVM, still show them
  if (!ownerEnrichment && (rentcastProfileFacts || rentcastAvm)) {
    ownerEnrichment = {
      facts: rentcastProfileFacts ?? undefined,
      avm: rentcastAvm,
      reviewedBasis: ownerReviewedBasis,
    };
  }

  // Fetch owner photos (non-fatal)
  let ownerPhotos: OwnerPhoto[] = [];
  try {
    const { data: photoRows } = await (svc.from("property_photos") as any)
      .select("*")
      .eq("property_id", propertyId)
      .is("removed_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    ownerPhotos = photoRows ?? [];
  } catch {
    // non-fatal
  }

  // Fetch owner corrections (non-fatal)
  let ownerCorrections: PropertyFactCorrection[] = [];
  try {
    const { data: corrRows } = await (svc.from("property_fact_corrections") as any)
      .select("*")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false });
    ownerCorrections = corrRows ?? [];
  } catch {
    // non-fatal
  }

  // Build canonical values for the correction modal from normalized record
  const canonicalValues: Record<string, string | number | null> = {
    bedrooms: ownerPropertyRecord?.beds ?? null,
    bathrooms: ownerPropertyRecord?.baths ?? null,
    sqft_living: ownerPropertyRecord?.sqft ?? null,
    lot_sqft: ownerPropertyRecord?.lotSize ?? null,
    year_built: ownerPropertyRecord?.yearBuilt ?? null,
    owner_occupied: row.occupancy_use ?? null,
  };

  // Coordinates from normalized property record (for hero map fallback)
  const heroLat = ownerPropertyRecord?.latitude ?? null;
  const heroLng = ownerPropertyRecord?.longitude ?? null;
  const heroAddress = ownerPropertyRecord?.formattedAddress ?? address_display ?? null;

  // ── Badge computation for PropertyPageHeader ─────────────────────────────
  const ownerValuationLaneForBadge = deriveValuationLane({
    manualAppraisalStatus: workflowState.manualAppraisalStatus,
    escalationAvmStatus: workflowState.escalationAvmStatus,
    fmvVerificationSource: workflowState.fmvVerificationSource,
    latestVerifiedFmv: workflowState.latestVerifiedFmv,
  });
  const showOwnerVerified = shouldShowOwnerVerifiedBadge(
    row.verification_state ?? null,
    row.owner_verification_removed_at ?? null,
  );
  const showAppraisalBadge = shouldShowVerifiedAppraisalValueBadge(
    row.verified_appraisal_value_status ?? null,
  );
  const appraisalExpired = isAppraisalBadgeExpired(
    row.verified_appraisal_value_status ?? null,
  );
  const appraisalUnderReview = isAppraisalBadgeUnderReview(
    row.verified_appraisal_value_status ?? null,
  );
  const appraisalBadgeLabel =
    appraisalUnderReview
      ? "Appraisal under review"
      : ownerValuationLaneForBadge.label === "Appraised"
        ? "Appraised value"
        : "Reviewed valuation basis";

  return (
    <div>
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 pb-12 pt-6 space-y-6">
        {/* ── A. Header — address H1 + badge row with tooltips ── */}
        <PropertyPageHeader
          address={heroAddress ?? address_display}
          propertyStatus={row.status ?? null}
          showOwnerVerified={showOwnerVerified}
          showAppraisalBadge={showAppraisalBadge}
          appraisalUnderReview={appraisalUnderReview}
          appraisalExpired={appraisalExpired}
          appraisalBadgeLabel={appraisalBadgeLabel}
          expiresAt={row.property_review_expires_at ?? null}
          isParticipationApproved={row.status === "verified"}
        />

        {/* ── B. Hero media — owner photos first, vendor fallback, then map ── */}
        <PropertyMediaSection
          propertyId={propertyId}
          initialPhotos={ownerPhotos}
          images={heroImages}
          lat={heroLat}
          lng={heroLng}
          address={heroAddress}
          audience="owner"
          canManagePhotos={row.status !== "archived"}
        />

        {/* ── B2. Owner property edit controls (settings + corrections) ── */}
        <OwnerPropertyEditControls
          propertyId={propertyId}
          currentVisibility={row.visibility_preference ?? "private"}
          currentProposalStatus={row.proposal_interest_status ?? "not_interested"}
          initialCorrections={ownerCorrections}
          canonicalValues={canonicalValues}
          propertyStatus={row.status ?? ""}
        />

        {/* ── C. Valuation & cash position — consolidated section with tabs ── */}
        {(workflowState.rentcastFmv != null ||
          workflowState.escalationDepositStatus ||
          workflowState.escalationAvmStatus ||
          workflowState.ownerAttemptedAttom ||
          workflowState.manualAppraisalStatus ||
          workflowState.liveIneligiblePhase !== null ||
          workflowState.fmvVerificationSource === "attom") && (
          <ValuationCashSection
            audience="owner"
            avm={rentcastAvm}
            securedDebt={row.secured_property_debt_amount ?? null}
            propertyReviewExpiresAt={row.property_review_expires_at ?? null}
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

        {/* ── D. Secured debt summary — owner only ── */}
        {row.has_secured_property_debt === true && (
          <div className="rounded-lg border overflow-hidden">
            <div className="bg-muted/40 px-4 py-3 border-b">
              <h2 className="text-sm font-semibold">Secured debt</h2>
            </div>
            <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <div className="text-muted-foreground text-xs">Secured debt declared</div>
                <div className="font-medium">Yes</div>
              </div>
              {row.secured_property_debt_amount != null && (
                <div>
                  <div className="text-muted-foreground text-xs">Outstanding balance</div>
                  <div className="font-medium">
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                      maximumFractionDigits: 0,
                    }).format(row.secured_property_debt_amount)}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── E. Base property data (normalized from RentCast) ── */}
        {ownerPropertyRecord && (
          <PropertyRecordSections record={ownerPropertyRecord} audience="owner" />
        )}

        {/* ── E. Owner information & documents (workflow, deal, docs, intake) ── */}
        <PropertyDetailClient
          property={property}
          linkedDeal={linkedDeal}
          reviewRequest={reviewRequest}
          workflowState={workflowState}
          activityEntries={activityEntries}
          enrichment={ownerEnrichment}
          hideAddressCard
          hideWorkflowWidget
          hideValuationCards
        />
      </main>
    </div>
  );
}
