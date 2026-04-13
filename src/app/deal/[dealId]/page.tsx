import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { AppHeader } from "@/components/layout/AppHeader";
import { DealPageShell } from "@/components/deal/DealPageShell";
import { DealDetailWidgetPanel } from "@/components/deal/DealDetailWidgetPanel";
import { DealActivityFeed } from "@/components/deal/DealActivityFeed";
import { NegotiationSection } from "@/components/deal/NegotiationSection";
import { AcceptedPendingReviewBanner } from "@/components/deal/AcceptedPendingReviewBanner";
import { WaitingBanner } from "@/components/deal/WaitingBanner";
import { RecomputeSnapshotButton } from "@/components/deal/RecomputeSnapshotButton";
import { SignatureCard } from "@/components/deal/SignatureCard";
import type {
  SignaturePacketView,
  SignatureRecipientView,
} from "@/components/deal/SignatureCard";
import { DealMilestoneTracker } from "@/components/deal/DealMilestoneTracker";
import {
  resolveCanonicalLifecycle,
  isTerminalWorkflowStage,
  type WorkflowStateInput,
} from "@/lib/workflow/milestones";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getArtifactSignedUrls } from "@/lib/signature/artifacts";
import {
  IneligibleDealOwnerBlock,
  IneligibleDealBuyerBlock,
  AttomRequiredDealOwnerBlock,
  AttomRequiredDealBuyerBlock,
  PropertyReviewBlockedOwnerBanner,
} from "@/components/deal/IneligibleDealBlock";
import {
  resolveControllingFmv,
  computeAvmEligibility,
  extractAvmDealTerms,
  DEFAULT_LTV_RATIO,
  type AvmEligibilityResult,
} from "@/lib/avmEligibility";
import { EnrichedPropertyPreview } from "@/components/property/EnrichedPropertyPreview";
import type { EnrichedPreviewData } from "@/components/property/EnrichedPropertyPreview";
import type {
  MashvisorNormalizedSummary,
  MashvisorImagesPayload,
} from "@/lib/mashvisor/types";
import { PropertyHeroMedia } from "@/components/property/PropertyHeroMedia";
import { PropertyRecordSections } from "@/components/property/PropertyRecordSections";
import type { OwnerPhoto } from "@/lib/property/photos";
import type { NormalizedPropertyProfile } from "@/lib/property-review/providers/rentcast/types";
import type { PropertyRecord } from "@/lib/property/propertyRecord";
import { normalizedProfileToRecord } from "@/lib/property/propertyRecord";

type PageProps = {
  params: Promise<{ dealId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type AnyRecord = Record<string, unknown>;

function safeRecord(v: unknown): AnyRecord | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as AnyRecord)
    : null;
}

function toEffectiveSnapshot(
  proposalTermsSnapshot: AnyRecord | null,
  fallbackSnapshot: AnyRecord | null,
): AnyRecord | null {
  const proposal = safeRecord(proposalTermsSnapshot);
  const fallback = safeRecord(fallbackSnapshot);

  if (!proposal) return fallback;

  const proposalInputs = safeRecord((proposal as any).inputs);
  if (proposalInputs) {
    return {
      ...proposal,
      schema_version:
        (proposal as any).schema_version ??
        (fallback as any)?.schema_version ??
        "1",
      compute_version:
        (proposal as any).compute_version ??
        (fallback as any)?.compute_version ??
        null,
    };
  }

  const topLevelDealTerms = safeRecord((proposal as any).deal_terms);
  const topLevelScenario = safeRecord((proposal as any).scenario);

  if (topLevelDealTerms || topLevelScenario) {
    return {
      inputs: {
        deal_terms: topLevelDealTerms ?? {},
        scenario: topLevelScenario ?? {},
      },
      outputs: {
        results: null,
      },
      schema_version: (fallback as any)?.schema_version ?? "1",
      compute_version: (fallback as any)?.compute_version ?? null,
    } as AnyRecord;
  }

  return fallback;
}

async function loadNegotiationState(
  svc: ReturnType<typeof createServiceClient>,
  effectiveThread: any,
  userId: string,
) {
  if (!effectiveThread) {
    return {
      currentProposal: null,
      previousProposal: null,
      isResponder: false,
      isSender: false,
      isBuyer: false,
      isOwnerSide: false,
    };
  }

  const { data: proposals } = await (svc.from("deal_proposals") as any)
    .select("id, status, created_by_user_id, terms_snapshot, created_at")
    .eq("thread_id", effectiveThread.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const all = proposals ?? [];
  const currentProposal =
    all.find((p: any) => p.status === "submitted" || p.status === "accepted") ??
    null;

  const currentIdx = currentProposal
    ? all.findIndex((p: any) => p.id === currentProposal.id)
    : -1;

  const previousProposal =
    currentIdx >= 0
      ? (all.slice(currentIdx + 1).find((p: any) => !!p?.terms_snapshot) ??
        null)
      : null;

  const isBuyer = effectiveThread.buyer_user_id === userId;
  const isSender = currentProposal?.created_by_user_id === userId;
  const isResponder =
    !!currentProposal && !isSender && effectiveThread.status !== "accepted";

  return {
    currentProposal,
    previousProposal,
    isResponder,
    isSender,
    isBuyer,
    isOwnerSide: !isBuyer,
  };
}

// ============================================================
// Signature data helper
// ============================================================

type SignatureData = {
  packet: SignaturePacketView | null;
  recipients: SignatureRecipientView[];
  execAgreementUrl: string | null;
  certificateUrl: string | null;
};

async function loadSignatureData(
  svc: ReturnType<typeof createServiceClient>,
  dealId: string,
): Promise<SignatureData> {
  try {
    const { data: packet } = await (svc.from("deal_signature_packets") as any)
      .select(
        "id, status, provider, sent_at, completed_at, voided_at, declined_at, " +
          "executed_document_path, certificate_document_path",
      )
      .eq("deal_id", dealId)
      .order("packet_version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!packet)
      return {
        packet: null,
        recipients: [],
        execAgreementUrl: null,
        certificateUrl: null,
      };

    const { data: recipRows } = await (
      svc.from("deal_signature_recipients") as any
    )
      .select("role, display_name, email, provider_status, signed_at")
      .eq("packet_id", packet.id)
      .order("routing_order", { ascending: true });

    const recipients: SignatureRecipientView[] = (recipRows ?? []).map(
      (r: any) => ({
        role: r.role,
        display_name: r.display_name ?? null,
        email: r.email ?? null,
        provider_status: r.provider_status ?? null,
        signed_at: r.signed_at ?? null,
      }),
    );

    let execAgreementUrl: string | null = null;
    let certificateUrl: string | null = null;

    if (packet.status === "completed") {
      try {
        const urls = await getArtifactSignedUrls(
          packet.executed_document_path ?? null,
          packet.certificate_document_path ?? null,
        );
        execAgreementUrl = urls.executed_agreement_url;
        certificateUrl = urls.certificate_url;
      } catch {
        // non-fatal
      }
    }

    return {
      packet: {
        id: packet.id,
        status: packet.status,
        provider: packet.provider ?? "docusign",
        sent_at: packet.sent_at ?? null,
        completed_at: packet.completed_at ?? null,
        voided_at: packet.voided_at ?? null,
        declined_at: packet.declined_at ?? null,
        executed_document_path: packet.executed_document_path ?? null,
        certificate_document_path: packet.certificate_document_path ?? null,
      },
      recipients,
      execAgreementUrl,
      certificateUrl,
    };
  } catch {
    return {
      packet: null,
      recipients: [],
      execAgreementUrl: null,
      certificateUrl: null,
    };
  }
}

export default async function DealPage(ctx: PageProps) {
  const { dealId } = await ctx.params;
  const searchParams = (await Promise.resolve(ctx.searchParams)) ?? {};
  const debug =
    (typeof searchParams.debug === "string"
      ? searchParams.debug
      : undefined) === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?returnTo=${encodeURIComponent(`/deal/${dealId}`)}`);
  }

  // --- Primary path: load deal via RLS (buyer/participant with grants) ---
  const { data: deal } = await supabase
    .from("deals")
    .select(
      "id, owner_user_id, created_by_user_id, user_id, status, created_at, archived_at, triage_status, servicing_status, renegotiation_status",
    )
    .eq("id", dealId)
    .maybeSingle();

  if (deal && (deal as any).archived_at) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-3xl p-6 space-y-6">
          <h1 className="text-xl font-semibold">
            This deal has been archived.
          </h1>
          <p className="text-sm text-muted-foreground">
            Archived deals are no longer accessible. Records are retained for
            compliance.
          </p>
          <Link className="underline text-sm" href="/dashboard">
            Back to dashboard
          </Link>
        </main>
      </div>
    );
  }

  if (deal) {
    const { data: grant } = await supabase
      .from("deal_access_grants")
      .select("role")
      .eq("deal_id", dealId)
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .maybeSingle();

    const userRole = grant?.role ?? null;
    const isOwner =
      userRole === "OWNER" ||
      (deal as any).owner_user_id === user.id ||
      (deal as any).created_by_user_id === user.id ||
      (deal as any).user_id === user.id;

    const svc = createServiceClient();

    const { data: headerEv } = await (svc.from("deal_events") as any)
      .select("payload")
      .eq("deal_id", dealId)
      .eq("event_type", "DEAL_HEADER_UPDATED")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const headerPayload = headerEv?.payload ?? {};

    const { data: latestSnap } = await supabase
      .from("deal_snapshots")
      .select("id, snapshot_json, contract_version, schema_version")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const snapJson = (latestSnap as any)?.snapshot_json ?? null;
    const snapHeader = snapJson?.meta?.header ?? {};
    const headerTitle = headerPayload.title ?? snapHeader.title ?? null;
    let resolvedPropertyId: string | null =
      headerPayload.property_id ?? snapHeader.property_id ?? null;

    // Thread property_id fallback: if no property_id in the header event or snapshot
    // (common for deals created before DEAL_HEADER_UPDATED was introduced), resolve
    // property linkage directly from the most recent deal thread.
    if (!resolvedPropertyId) {
      const { data: threadProp } = await (svc.from("deal_threads") as any)
        .select("property_id")
        .eq("deal_id", dealId)
        .not("property_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      resolvedPropertyId = (threadProp as any)?.property_id ?? null;
    }

    let livePropertyStatus: string | null = null;
    let liveOwnershipStatus: string | null = null;
    let liveClosingReviewStatus: string | null = null;
    let liveEscalationDepositStatus: string | null = null;
    let liveEscalationAvmStatus: string | null = null;
    let livePropertyReviewStatus: string | null = null;
    let liveManualAppraisalStatus: string | null = null;
    // Controlling-FMV basis fields (needed for live eligibility recomputation)
    let liveManualAppraisalFmv: number | null = null;
    let liveLatestVerifiedFmv: number | null = null;
    let liveFmvVerificationSource: string | null = null;
    let liveSecuredDebt: number | null = null;

    if (resolvedPropertyId) {
      const { data: liveProp } = await (svc.from("properties") as any)
        .select(
          "status, ownership_status, closing_review_status, escalation_deposit_status, escalation_avm_status, property_review_status, manual_appraisal_status, manual_appraisal_fmv, latest_verified_fmv, fmv_verification_source, secured_property_debt_amount",
        )
        .eq("id", resolvedPropertyId)
        .maybeSingle();

      if (liveProp) {
        livePropertyStatus = liveProp.status ?? null;
        liveOwnershipStatus = liveProp.ownership_status ?? null;
        liveClosingReviewStatus = liveProp.closing_review_status ?? null;
        liveEscalationDepositStatus =
          liveProp.escalation_deposit_status ?? null;
        liveEscalationAvmStatus = liveProp.escalation_avm_status ?? null;
        livePropertyReviewStatus = liveProp.property_review_status ?? null;
        liveManualAppraisalStatus = liveProp.manual_appraisal_status ?? null;
        liveManualAppraisalFmv = liveProp.manual_appraisal_fmv ?? null;
        liveLatestVerifiedFmv = liveProp.latest_verified_fmv ?? null;
        liveFmvVerificationSource = liveProp.fmv_verification_source ?? null;
        liveSecuredDebt = liveProp.secured_property_debt_amount ?? null;
      }
    }

    const headerProperty = resolvedPropertyId
      ? {
          property_id: resolvedPropertyId,
          display_address:
            headerPayload.display_address ?? snapHeader.display_address ?? "",
          property_status:
            livePropertyStatus ??
            headerPayload.property_status ??
            snapHeader.property_status ??
            null,
          ownership_status:
            liveOwnershipStatus ??
            headerPayload.ownership_status ??
            snapHeader.ownership_status ??
            null,
        }
      : null;

    // Enrichment for this deal's linked property — non-fatal, audience-gated in JSX
    let dealPropertyEnrichment: EnrichedPreviewData | null = null;
    if (resolvedPropertyId) {
      try {
        const { data: enrichmentRow } = await (svc.from("property_enrichments") as any)
          .select("summary_payload, images_payload, fetched_at")
          .eq("property_id", resolvedPropertyId)
          .eq("provider", "mashvisor")
          .eq("is_current", true)
          .eq("status", "completed")
          .maybeSingle();

        if (enrichmentRow) {
          const summary = enrichmentRow.summary_payload as MashvisorNormalizedSummary | null;
          const images = enrichmentRow.images_payload as MashvisorImagesPayload | null;
          if (summary && images) {
            dealPropertyEnrichment = {
              summary,
              images,
              fetchedAt: enrichmentRow.fetched_at ?? summary.fetched_at ?? null,
            };
          }
        }
      } catch {
        // non-fatal
      }
    }

    // Owner photos for linked property — sourced from property record, never copied into deal
    let dealPropertyOwnerPhotos: OwnerPhoto[] = [];
    if (resolvedPropertyId) {
      try {
        const { data: photoRows } = await (svc.from("property_photos") as any)
          .select("id, property_id, uploaded_by, storage_path, storage_bucket, public_url, sort_order, is_hero, caption, removed_at, created_at, updated_at")
          .eq("property_id", resolvedPropertyId)
          .is("removed_at", null)
          .order("sort_order", { ascending: true });
        if (Array.isArray(photoRows)) {
          dealPropertyOwnerPhotos = photoRows.map((r: any) => ({
            id: r.id,
            property_id: r.property_id,
            uploaded_by: r.uploaded_by,
            storage_path: r.storage_path,
            storage_bucket: r.storage_bucket,
            public_url: r.public_url,
            sort_order: r.sort_order ?? 0,
            is_hero: r.is_hero ?? false,
            caption: r.caption ?? null,
            removed_at: r.removed_at ?? null,
            created_at: r.created_at,
            updated_at: r.updated_at,
          }));
        }
      } catch {
        // non-fatal
      }
    }

    // RentCast property record — sourced from property_review_runs, not copied into deal
    let dealPropertyRecord: PropertyRecord | null = null;
    if (resolvedPropertyId) {
      try {
        const { data: rentcastRow } = await (svc.from("property_review_runs") as any)
          .select("normalized_payload")
          .eq("property_id", resolvedPropertyId)
          .eq("provider", "rentcast")
          .eq("artifact_type", "property_profile")
          .eq("status", "completed")
          .eq("is_current", true)
          .maybeSingle();
        if (rentcastRow?.normalized_payload) {
          dealPropertyRecord = normalizedProfileToRecord(
            rentcastRow.normalized_payload as NormalizedPropertyProfile,
          );
        }
      } catch {
        // non-fatal
      }
    }

    const { data: candidateThreads } = await (svc.from("deal_threads") as any)
      .select("id, status, buyer_user_id, owner_user_id, created_at")
      .eq("deal_id", dealId)
      .in("status", ["pending_owner", "negotiating", "accepted", "closed"])
      .order("created_at", { ascending: false })
      .limit(5);

    const allCandidateThreads: any[] = candidateThreads ?? [];

    const effectiveThread =
      allCandidateThreads.find((t) =>
        ["pending_owner", "negotiating", "accepted"].includes(t.status),
      ) ?? null;

    const threadStatusForMilestone: string | null =
      allCandidateThreads[0]?.status ?? null;

    const negState = await loadNegotiationState(svc, effectiveThread, user.id);

    let editingLocked =
      !!effectiveThread &&
      ["pending_owner", "negotiating", "accepted"].includes(
        effectiveThread.status,
      );

    const showNegotiationUi =
      !!effectiveThread &&
      ["pending_owner", "negotiating"].includes(effectiveThread.status);

    const effectiveSnapshot = toEffectiveSnapshot(
      negState.currentProposal?.terms_snapshot ?? null,
      snapJson,
    );

    const effectiveSnapshotRecord = safeRecord(effectiveSnapshot);
    const effectiveOutputs = safeRecord(
      (effectiveSnapshotRecord as any)?.outputs,
    );

    const inputs = safeRecord((effectiveSnapshotRecord as any)?.inputs);
    const results = safeRecord((effectiveOutputs as any)?.results);

    // ── Live eligibility recomputation from controlling FMV basis ─────────────
    // Prevents stale triage_status from persisting as the sole gate for the
    // ineligible owner/buyer deal blocks after the controlling FMV basis changes
    // (e.g. manual appraisal completes and its FMV supersedes the ATTOM result).
    const rawTriageIneligible = (deal as any).triage_status === "ineligible";
    let liveEligibilityResult: AvmEligibilityResult | null = null;
    let controllingFmvValue: number | null = null;
    let controllingFmvSource: string | null = null;
    if (rawTriageIneligible) {
      const { fmv: cFmv, source: cSrc } = resolveControllingFmv({
        latestVerifiedFmv: liveLatestVerifiedFmv,
        fmvVerificationSource: liveFmvVerificationSource,
        manualAppraisalFmv: liveManualAppraisalFmv,
        manualAppraisalStatus: liveManualAppraisalStatus,
      });
      controllingFmvValue = cFmv;
      controllingFmvSource = cSrc;
      if (cFmv != null) {
        const { upfront_payment, property_value } = extractAvmDealTerms(
          effectiveSnapshotRecord,
        );
        const card = computeAvmEligibility({
          verifiedFmv: cFmv,
          fmvProvider: cSrc,
          fmvFetchedAt: null,
          fmvExpiresAt: null,
          proposedFmv: property_value,
          securedDebt: liveSecuredDebt ?? 0,
          ltvRatio: DEFAULT_LTV_RATIO,
          requestedCash: upfront_payment,
        });
        liveEligibilityResult = card.result;
      }
    }
    // Show ineligible block only when the deal is historically ineligible AND the
    // fresh check under the current controlling basis also shows not-eligible.
    // If controlling FMV is unavailable (cFmv=null), fall back to raw triage alone.
    // Suppress when thread is already negotiating: revised terms have been submitted,
    // so the void/ineligible informational copy is stale — the negotiation flow takes over.
    const showIneligibleBlock =
      rawTriageIneligible &&
      (liveEligibilityResult === null ||
        liveEligibilityResult !== "eligible") &&
      effectiveThread?.status !== "negotiating";
    // When the deal is live-ineligible, it is void/non-executable.
    // Unlock editing so the owner can counter or revise terms — no admin reopen needed.
    if (showIneligibleBlock) editingLocked = false;
    // Contextual description prefilled where we can; fallback to canonicalResult
    // exceptionDescription is applied below after canonicalResult is declared.
    let ineligibleDescription: string | null =
      showIneligibleBlock &&
      controllingFmvSource === "manual_appraisal_sim" &&
      controllingFmvValue != null
        ? `Based on the licensed appraisal value ($${Math.round(controllingFmvValue).toLocaleString("en-US")}), the current deal terms still exceed the eligible threshold. You can propose revised terms or contact our team.`
        : null;

    const { data: events } = await (svc.from("deal_events") as any)
      .select("id, deal_id, event_type, payload, created_by, created_at")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(50);

    // Derive the acceptance timestamp from deal_events.
    // Preferred: OFFER_ACCEPTED (written by /api/proposals/[id]/owner-decision).
    // Fallback: DEAL_ACCEPTED (written by /api/deals/[id]/accept).
    // If neither exists: null — panel renders without time-based contract year/status.
    const primaryAcceptedAt: string | null =
      (events as any[] | null)?.find(
        (e: any) => e.event_type === "OFFER_ACCEPTED",
      )?.created_at ??
      (events as any[] | null)?.find(
        (e: any) => e.event_type === "DEAL_ACCEPTED",
      )?.created_at ??
      null;

    const [sigData, adminResult] = await Promise.all([
      loadSignatureData(svc, dealId),
      requireAdmin(),
    ]);
    const isAdmin = adminResult.ok;

    const workflowStateInput: WorkflowStateInput = {
      propertyStatus: livePropertyStatus,
      propertyReviewStatus: livePropertyReviewStatus,
      escalationDepositStatus: liveEscalationDepositStatus,
      escalationAvmStatus: liveEscalationAvmStatus,
      closingReviewStatus: liveClosingReviewStatus,
      avmEligibilityResult: null,
      triageStatus: (deal as any).triage_status ?? null,
      threadStatus: threadStatusForMilestone,
      packetStatus: sigData.packet?.status ?? null,
      servicingStatus: (deal as any).servicing_status ?? null,
      manualAppraisalStatus: liveManualAppraisalStatus,
      liveIneligible: showIneligibleBlock,
      renegotiationStatus: (deal as any).renegotiation_status ?? null,
    };
    const canonicalResult = resolveCanonicalLifecycle(workflowStateInput);
    const currentStage = canonicalResult.stage;
    const currentStageMeta = canonicalResult.meta;
    // Terminal stages (agreement_signed, deal_closed, servicing_active, servicing_issue)
    // occur after the thread is closed, so thread.status is no longer "accepted" and the
    // earlier editingLocked check misses them.  Apply the terminal lock here where the
    // canonical stage is known — this is the single authoritative terminal-read-only rule.
    if (isTerminalWorkflowStage(currentStage)) editingLocked = true;
    // Fallback description: use canonical exception copy when not manual-appraisal basis.
    if (showIneligibleBlock && ineligibleDescription === null) {
      ineligibleDescription = canonicalResult.exceptionDescription ?? null;
    }

    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-5xl p-6 space-y-6">
          <DealPageShell
            dealId={dealId}
            isOwner={isOwner}
            locked={editingLocked}
            activeThread={effectiveThread}
            initialTitle={headerTitle}
            initialProperty={headerProperty}
            effectiveSnapshot={effectiveSnapshotRecord}
            isPropertyOwner={negState.isOwnerSide}
            isBuyer={negState.isBuyer}
            ownerProposalId={negState.currentProposal?.id ?? null}
            ownerProposalStatus={negState.currentProposal?.status ?? null}
            ownerTermsSnapshot={negState.currentProposal?.terms_snapshot ?? null}
            currentUserId={user.id}
          />

          {/* Linked property — hero + gallery sourced from property record by property_id */}
          {resolvedPropertyId && (dealPropertyOwnerPhotos.length > 0 || dealPropertyEnrichment) && (
            <div className="rounded-lg border overflow-hidden">
              <div className="bg-muted/40 px-4 py-2 border-b">
                <span className="text-sm font-medium">Linked Property</span>
              </div>
              <PropertyHeroMedia
                images={dealPropertyEnrichment?.images ?? null}
                lat={dealPropertyRecord?.latitude ?? null}
                lng={dealPropertyRecord?.longitude ?? null}
                address={headerProperty?.display_address ?? null}
                audience={isAdmin ? "admin" : isOwner ? "owner" : "buyer"}
                ownerPhotos={dealPropertyOwnerPhotos}
              />
            </div>
          )}

          {canonicalResult.isExceptionState && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-amber-600 dark:text-amber-400 flex-shrink-0">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-4 h-4"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                    {canonicalResult.exceptionLabel}
                  </p>
                  {canonicalResult.exceptionDescription && (
                    <p className="text-xs text-amber-800 dark:text-amber-200">
                      {canonicalResult.exceptionDescription}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {!canonicalResult.isExceptionState &&
            effectiveThread?.status === "accepted" &&
            !canonicalResult.customerHeroLabel &&
            canonicalResult.meta.stageNumber <= 2 && (
              <AcceptedPendingReviewBanner />
            )}

          {!canonicalResult.isExceptionState &&
            canonicalResult.customerHeroLabel && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-blue-600 dark:text-blue-400 flex-shrink-0">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-4 h-4"
                    >
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </span>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                      {canonicalResult.customerHeroLabel}
                    </p>
                    {canonicalResult.customerHeroDescription && (
                      <p className="text-xs text-blue-800 dark:text-blue-200">
                        {canonicalResult.customerHeroDescription}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

          {/* Property review blocked-state cue — primary path.
              Shown when an accepted deal is waiting on property-side information
              that the owner specifically needs to supply. Only fires when:
                - viewer is the owner
                - thread is accepted (deal live, not just under review pre-acceptance)
                - property is linked
                - admin has issued an explicit information_requested status */}
          {isOwner &&
            effectiveThread?.status === "accepted" &&
            resolvedPropertyId &&
            livePropertyReviewStatus === "information_requested" && (
              <PropertyReviewBlockedOwnerBanner
                propertyId={resolvedPropertyId}
              />
            )}

          {/* Ineligible deal action block — primary path.
              Gated on showIneligibleBlock (live FMV recomputation), NOT raw triage_status.
              Block type is dispatched on canonicalResult.stage:
                attom_required → ATTOM-first blocks (renegotiation not yet available)
                else            → Standard ineligible blocks (ATTOM complete; renegotiate/challenge) */}
          {showIneligibleBlock &&
            isOwner &&
            currentStage === "attom_required" && (
              <AttomRequiredDealOwnerBlock propertyId={resolvedPropertyId} />
            )}
          {showIneligibleBlock &&
            isOwner &&
            currentStage !== "attom_required" && (
              <IneligibleDealOwnerBlock
                dealId={dealId}
                propertyId={resolvedPropertyId}
                manualAppraisalStatus={liveManualAppraisalStatus}
                exceptionDescription={ineligibleDescription}
                renegotiationAlreadyRequested={
                  currentStage === "renegotiation_requested"
                }
                proposalId={negState.currentProposal?.id}
                currentTerms={negState.currentProposal?.terms_snapshot ?? null}
              />
            )}

          {showIneligibleBlock &&
            !isOwner &&
            currentStage === "attom_required" && (
              <AttomRequiredDealBuyerBlock />
            )}
          {showIneligibleBlock &&
            !isOwner &&
            currentStage !== "attom_required" &&
            currentStage !== "renegotiation_requested" && (
              <IneligibleDealBuyerBlock
                manualAppraisalStatus={liveManualAppraisalStatus}
                renegotiationRequested={false}
              />
            )}

          {showNegotiationUi && negState.isSender && effectiveThread && (
            <WaitingBanner
              threadId={effectiveThread.id}
              isBuyer={negState.isBuyer}
            />
          )}

          {showNegotiationUi &&
            negState.isResponder &&
            negState.currentProposal &&
            effectiveThread && (
              <NegotiationSection
                threadId={effectiveThread.id}
                proposalId={negState.currentProposal.id}
                proposalStatus={negState.currentProposal.status}
                currentTerms={negState.currentProposal.terms_snapshot ?? null}
                previousTerms={
                  negState.previousProposal?.terms_snapshot ?? null
                }
                isOwnerSide={negState.isOwnerSide}
              />
            )}

          {sigData.packet && (
            <SignatureCard
              dealId={dealId}
              threadStatus={effectiveThread?.status ?? null}
              packet={sigData.packet}
              recipients={sigData.recipients}
              isAdmin={isAdmin}
              execAgreementUrl={sigData.execAgreementUrl}
              certificateUrl={sigData.certificateUrl}
            />
          )}

          {currentStage === "servicing_active" ? (
            <div className="rounded-lg border bg-emerald-50/50 p-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-sm font-semibold text-emerald-800">
                  Deal active
                </span>
              </div>
              <p className="mt-2 text-sm text-emerald-700">
                Your agreement is complete and active. Signed documents are
                available for reference in the section above.
              </p>
            </div>
          ) : currentStageMeta.customerLabel ? (
            <DealMilestoneTracker
              currentStage={currentStage}
              stageNote={null}
            />
          ) : null}

          {/*
           * TODO(fmv-badge): Shared FMV badge for homeowner/investor visibility.
           * Should only appear AFTER the stronger ATTOM-style valuation review is
           * completed and admin writes back a verified fmv_amount to
           * property_review_summary. Do NOT expose RentCast AVM detail here.
           * Keyed off property_review_summary.fmv_provider and fmv_expires_at.
           */}
          <DealDetailWidgetPanel
            dealId={dealId}
            initialSnapshot={effectiveSnapshotRecord}
            inputs={inputs}
            results={results}
            computeVersion={
              typeof (effectiveSnapshotRecord as any)?.compute_version ===
              "string"
                ? (effectiveSnapshotRecord as any).compute_version
                : null
            }
            canEdit={isOwner && !editingLocked}
            persona="homeowner"
            isAccepted={["accepted", "closed"].includes(
              threadStatusForMilestone ?? "",
            )}
            canonicalStage={currentStage}
            acceptedAt={primaryAcceptedAt}
          />

          {isOwner && !editingLocked && snapJson && (
            <RecomputeSnapshotButton
              dealId={dealId}
              initialInputs={snapJson?.inputs ?? null}
            />
          )}

          {/* Property details — sourced from linked property record by property_id, not copied into deal */}
          {dealPropertyRecord && resolvedPropertyId && (
            <section>
              <h2 className="text-base font-semibold mb-3">Property Details</h2>
              <PropertyRecordSections
                record={dealPropertyRecord}
                audience={isAdmin ? "admin" : isOwner ? "owner" : "buyer"}
              />
            </section>
          )}

          {events && events.length > 0 && (
            <section>
              <h2 className="text-base font-semibold mb-3">Activity</h2>
              <DealActivityFeed
                items={events.map((e: any) => ({
                  id: e.id,
                  event_type: e.event_type,
                  payload: e.payload,
                  created_at: e.created_at,
                  created_by_user_id: e.created_by ?? null,
                }))}
              />
            </section>
          )}

          {debug && (
            <section className="rounded-lg border p-4 bg-muted/30 space-y-2">
              <h2 className="font-medium">Debug</h2>
              <pre className="text-xs overflow-auto">
                {JSON.stringify(
                  {
                    dealId,
                    auth: { userId: user.id, email: user.email },
                    deal,
                    userRole,
                    headerPayload,
                    snapHeader,
                    effectiveThread,
                    negState: {
                      isResponder: negState.isResponder,
                      isSender: negState.isSender,
                      isBuyer: negState.isBuyer,
                      isOwnerSide: negState.isOwnerSide,
                      currentProposalId: negState.currentProposal?.id ?? null,
                      previousProposalId: negState.previousProposal?.id ?? null,
                    },
                  },
                  null,
                  2,
                )}
              </pre>
            </section>
          )}
        </main>
      </div>
    );
  }

  // --- Owner fallback path (bypass RLS, prove entitlement via thread+property) ---
  const svc = createServiceClient();

  const { data: offerEv, error: offerEvErr } = await svc
    .from("deal_events")
    .select("id,deal_id,event_type,payload,created_at")
    .eq("deal_id", dealId)
    .eq("event_type", "offer_submitted")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const threadId =
    (offerEv as any)?.payload?.thread_id &&
    typeof (offerEv as any).payload.thread_id === "string"
      ? (offerEv as any).payload.thread_id
      : null;

  let ownerMatches = false;
  let thread: any = null;
  let property: any = null;
  let resolvedThreadId: string | null = threadId ?? null;

  if (resolvedThreadId) {
    const { data: t } = await (svc.from("deal_threads") as any)
      .select("id,status,property_id,buyer_user_id,owner_user_id,deal_id")
      .eq("id", resolvedThreadId)
      .maybeSingle();

    thread = t ?? null;
  }

  if (!thread) {
    const { data: inferredThread } = await (svc.from("deal_threads") as any)
      .select("id,status,property_id,buyer_user_id,owner_user_id,deal_id")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (inferredThread) {
      thread = inferredThread;
      resolvedThreadId = inferredThread.id;
    }
  }

  const offerPayload: any =
    offerEv && typeof offerEv === "object" && "payload" in (offerEv as any)
      ? (offerEv as any).payload
      : null;

  if (!thread && offerPayload) {
    const payloadThreadId =
      offerPayload?.thread_id ?? offerPayload?.threadId ?? null;

    if (payloadThreadId) {
      const { data: eventThread } = await (svc.from("deal_threads") as any)
        .select("id,status,property_id,buyer_user_id,owner_user_id,deal_id")
        .eq("id", payloadThreadId)
        .maybeSingle();

      if (eventThread) {
        thread = eventThread;
        resolvedThreadId = eventThread.id;
      }
    }
  }

  if (thread?.property_id) {
    const { data: p } = await (svc.from("properties") as any)
      .select("id,status,owner_user_id,normalized_address")
      .eq("id", thread.property_id)
      .maybeSingle();

    property = p ?? null;
  }

  const directOwnerMatches =
    !!property?.owner_user_id && property.owner_user_id === user.id;

  const threadOwnerMatches =
    !!thread?.owner_user_id && thread.owner_user_id === user.id;

  const buyerMatches =
    !!thread?.buyer_user_id && thread.buyer_user_id === user.id;

  let participantMatches = false;
  if (resolvedThreadId) {
    const { data: participant } = await (
      svc.from("deal_thread_participants") as any
    )
      .select("user_id,status,role")
      .eq("thread_id", resolvedThreadId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    participantMatches = !!participant;
  }

  let grantMatches = false;
  const { data: grant } = await (svc.from("deal_access_grants") as any)
    .select("user_id,role,revoked_at,expires_at")
    .eq("deal_id", dealId)
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();

  if (grant) {
    const notExpired =
      !grant.expires_at || new Date(grant.expires_at) > new Date();
    grantMatches = notExpired;
  }

  let inviteMatches = false;
  if (resolvedThreadId && user.email) {
    const { data: invite } = await (svc.from("thread_invites") as any)
      .select("id,intended_role,expires_at")
      .eq("thread_id", resolvedThreadId)
      .eq("invitee_email", user.email.toLowerCase())
      .limit(1)
      .maybeSingle();

    if (invite) {
      const notExpired =
        !invite.expires_at || new Date(invite.expires_at) > new Date();
      inviteMatches = notExpired;
    }
  }

  ownerMatches =
    directOwnerMatches ||
    threadOwnerMatches ||
    buyerMatches ||
    participantMatches ||
    grantMatches ||
    inviteMatches;

  let allowDealFallback = ownerMatches;

  // Admin override: if no normal entitlement path matches, allow authenticated
  // admins to view the deal via the service-client fallback path.
  // fallbackIsOwner will be false (no edit rights), fallbackIsAdmin will be true.
  if (!allowDealFallback) {
    const adminCheck = await requireAdmin();
    if (adminCheck.ok) {
      allowDealFallback = true;
    }
  }

  if (allowDealFallback) {
    const { data: archivedCheck } = await (svc.from("deals") as any)
      .select("archived_at")
      .eq("id", dealId)
      .maybeSingle();

    if ((archivedCheck as any)?.archived_at) {
      return (
        <div className="min-h-screen">
          <AppHeader />
          <main className="mx-auto max-w-3xl p-6 space-y-6">
            <h1 className="text-xl font-semibold">
              This deal has been archived.
            </h1>
            <p className="text-sm text-muted-foreground">
              Archived deals are no longer accessible. Records are retained for
              compliance.
            </p>
            <Link className="underline text-sm" href="/dashboard">
              Back to dashboard
            </Link>
          </main>
        </div>
      );
    }

    let fallbackDeal: any = null;

    const { data: fallbackDealRow } = await (svc.from("deals") as any)
      .select(
        "id, owner_user_id, status, triage_status, servicing_status, renegotiation_status, created_at, archived_at",
      )
      .eq("id", dealId)
      .maybeSingle();

    fallbackDeal = fallbackDealRow ?? null;

    const { data: headerEv } = await (svc.from("deal_events") as any)
      .select("payload")
      .eq("deal_id", dealId)
      .eq("event_type", "DEAL_HEADER_UPDATED")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const headerPayload = headerEv?.payload ?? {};

    const { data: latestSnap } = await (svc.from("deal_snapshots") as any)
      .select("id, snapshot_json, contract_version, schema_version")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const snapJson = (latestSnap as any)?.snapshot_json ?? null;
    const snapHeader = snapJson?.meta?.header ?? {};
    const headerTitle = headerPayload.title ?? snapHeader.title ?? null;
    // Thread property_id fallback: if no property_id in the header event or snapshot,
    // use the already-resolved thread's property_id as the final fallback.
    const resolvedPropertyId: string | null =
      headerPayload.property_id ??
      snapHeader.property_id ??
      (thread as any)?.property_id ??
      null;

    let livePropertyStatus: string | null = null;
    let liveOwnershipStatus: string | null = null;
    let liveClosingReviewStatus: string | null = null;
    let liveEscalationDepositStatus: string | null = null;
    let liveEscalationAvmStatus: string | null = null;
    let livePropertyReviewStatus: string | null = null;
    let liveManualAppraisalStatus: string | null = null;
    // Controlling-FMV basis fields (needed for live eligibility recomputation)
    let liveManualAppraisalFmv: number | null = null;
    let liveLatestVerifiedFmv: number | null = null;
    let liveFmvVerificationSource: string | null = null;
    let liveSecuredDebt: number | null = null;

    if (resolvedPropertyId) {
      const { data: liveProp } = await (svc.from("properties") as any)
        .select(
          "status, ownership_status, closing_review_status, escalation_deposit_status, escalation_avm_status, property_review_status, manual_appraisal_status, manual_appraisal_fmv, latest_verified_fmv, fmv_verification_source, secured_property_debt_amount",
        )
        .eq("id", resolvedPropertyId)
        .maybeSingle();

      if (liveProp) {
        livePropertyStatus = liveProp.status ?? null;
        liveOwnershipStatus = liveProp.ownership_status ?? null;
        liveClosingReviewStatus = liveProp.closing_review_status ?? null;
        liveEscalationDepositStatus =
          liveProp.escalation_deposit_status ?? null;
        liveEscalationAvmStatus = liveProp.escalation_avm_status ?? null;
        livePropertyReviewStatus = liveProp.property_review_status ?? null;
        liveManualAppraisalStatus = liveProp.manual_appraisal_status ?? null;
        liveManualAppraisalFmv = liveProp.manual_appraisal_fmv ?? null;
        liveLatestVerifiedFmv = liveProp.latest_verified_fmv ?? null;
        liveFmvVerificationSource = liveProp.fmv_verification_source ?? null;
        liveSecuredDebt = liveProp.secured_property_debt_amount ?? null;
      }
    }

    const headerProperty = resolvedPropertyId
      ? {
          property_id: resolvedPropertyId,
          display_address:
            headerPayload.display_address ?? snapHeader.display_address ?? "",
          property_status:
            livePropertyStatus ??
            headerPayload.property_status ??
            snapHeader.property_status ??
            null,
          ownership_status:
            liveOwnershipStatus ??
            headerPayload.ownership_status ??
            snapHeader.ownership_status ??
            null,
        }
      : null;

    // Enrichment for this deal's linked property — non-fatal, audience-gated in JSX
    let fallbackDealPropertyEnrichment: EnrichedPreviewData | null = null;
    if (resolvedPropertyId) {
      try {
        const { data: enrichmentRow } = await (svc.from("property_enrichments") as any)
          .select("summary_payload, images_payload, fetched_at")
          .eq("property_id", resolvedPropertyId)
          .eq("provider", "mashvisor")
          .eq("is_current", true)
          .eq("status", "completed")
          .maybeSingle();

        if (enrichmentRow) {
          const summary = enrichmentRow.summary_payload as MashvisorNormalizedSummary | null;
          const images = enrichmentRow.images_payload as MashvisorImagesPayload | null;
          if (summary && images) {
            fallbackDealPropertyEnrichment = {
              summary,
              images,
              fetchedAt: enrichmentRow.fetched_at ?? summary.fetched_at ?? null,
            };
          }
        }
      } catch {
        // non-fatal
      }
    }

    // Owner photos for linked property — sourced from property record, never copied into deal
    let fallbackDealPropertyOwnerPhotos: OwnerPhoto[] = [];
    if (resolvedPropertyId) {
      try {
        const { data: photoRows } = await (svc.from("property_photos") as any)
          .select("id, property_id, uploaded_by, storage_path, storage_bucket, public_url, sort_order, is_hero, caption, removed_at, created_at, updated_at")
          .eq("property_id", resolvedPropertyId)
          .is("removed_at", null)
          .order("sort_order", { ascending: true });
        if (Array.isArray(photoRows)) {
          fallbackDealPropertyOwnerPhotos = photoRows.map((r: any) => ({
            id: r.id,
            property_id: r.property_id,
            uploaded_by: r.uploaded_by,
            storage_path: r.storage_path,
            storage_bucket: r.storage_bucket,
            public_url: r.public_url,
            sort_order: r.sort_order ?? 0,
            is_hero: r.is_hero ?? false,
            caption: r.caption ?? null,
            removed_at: r.removed_at ?? null,
            created_at: r.created_at,
            updated_at: r.updated_at,
          }));
        }
      } catch {
        // non-fatal
      }
    }

    // RentCast property record — sourced from property_review_runs, not copied into deal
    let fallbackDealPropertyRecord: PropertyRecord | null = null;
    if (resolvedPropertyId) {
      try {
        const { data: rentcastRow } = await (svc.from("property_review_runs") as any)
          .select("normalized_payload")
          .eq("property_id", resolvedPropertyId)
          .eq("provider", "rentcast")
          .eq("artifact_type", "property_profile")
          .eq("status", "completed")
          .eq("is_current", true)
          .maybeSingle();
        if (rentcastRow?.normalized_payload) {
          fallbackDealPropertyRecord = normalizedProfileToRecord(
            rentcastRow.normalized_payload as NormalizedPropertyProfile,
          );
        }
      } catch {
        // non-fatal
      }
    }

    const effectiveThread =
      thread &&
      ["pending_owner", "negotiating", "accepted"].includes(thread.status)
        ? thread
        : null;

    const negState = await loadNegotiationState(svc, effectiveThread, user.id);

    let editingLocked =
      !!effectiveThread &&
      ["pending_owner", "negotiating", "accepted"].includes(
        effectiveThread.status,
      );

    const showNegotiationUi =
      !!effectiveThread &&
      ["pending_owner", "negotiating"].includes(effectiveThread.status);

    const effectiveSnapshot = toEffectiveSnapshot(
      negState.currentProposal?.terms_snapshot ?? null,
      snapJson,
    );

    const effectiveSnapshotRecord = safeRecord(effectiveSnapshot);
    const effectiveOutputs = safeRecord(
      (effectiveSnapshotRecord as any)?.outputs,
    );

    const inputs = safeRecord((effectiveSnapshotRecord as any)?.inputs);
    const results = safeRecord((effectiveOutputs as any)?.results);

    // ── Live eligibility recomputation from controlling FMV basis (fallback path) ─
    const fallbackRawTriageIneligible =
      fallbackDeal?.triage_status === "ineligible";
    let fallbackLiveEligibilityResult: AvmEligibilityResult | null = null;
    let fallbackControllingFmvValue: number | null = null;
    let fallbackControllingFmvSource: string | null = null;
    if (fallbackRawTriageIneligible) {
      const { fmv: cFmv, source: cSrc } = resolveControllingFmv({
        latestVerifiedFmv: liveLatestVerifiedFmv,
        fmvVerificationSource: liveFmvVerificationSource,
        manualAppraisalFmv: liveManualAppraisalFmv,
        manualAppraisalStatus: liveManualAppraisalStatus,
      });
      fallbackControllingFmvValue = cFmv;
      fallbackControllingFmvSource = cSrc;
      if (cFmv != null) {
        const { upfront_payment, property_value } = extractAvmDealTerms(
          effectiveSnapshotRecord,
        );
        const card = computeAvmEligibility({
          verifiedFmv: cFmv,
          fmvProvider: cSrc,
          fmvFetchedAt: null,
          fmvExpiresAt: null,
          proposedFmv: property_value,
          securedDebt: liveSecuredDebt ?? 0,
          ltvRatio: DEFAULT_LTV_RATIO,
          requestedCash: upfront_payment,
        });
        fallbackLiveEligibilityResult = card.result;
      }
    }
    // Suppress ineligible block when thread is already negotiating: revised terms have been
    // submitted, so the void/ineligible informational copy is stale.
    const fallbackShowIneligibleBlock =
      fallbackRawTriageIneligible &&
      (fallbackLiveEligibilityResult === null ||
        fallbackLiveEligibilityResult !== "eligible") &&
      effectiveThread?.status !== "negotiating";
    // When the deal is live-ineligible, it is void/non-executable.
    // Unlock editing so the owner can counter or revise terms — no admin reopen needed.
    if (fallbackShowIneligibleBlock) editingLocked = false;
    // Contextual description prefilled where we can; fallback to canonicalResult
    // exceptionDescription is applied below after canonicalResult is declared.
    let fallbackIneligibleDescription: string | null =
      fallbackShowIneligibleBlock &&
      fallbackControllingFmvSource === "manual_appraisal_sim" &&
      fallbackControllingFmvValue != null
        ? `Based on the licensed appraisal value ($${Math.round(fallbackControllingFmvValue).toLocaleString("en-US")}), the current deal terms still exceed the eligible threshold. You can propose revised terms or contact our team.`
        : null;

    const { data: events } = await (svc.from("deal_events") as any)
      .select("id, deal_id, event_type, payload, created_by, created_at")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(50);

    // Same derivation as primary path — OFFER_ACCEPTED preferred, DEAL_ACCEPTED fallback.
    const fallbackAcceptedAt: string | null =
      (events as any[] | null)?.find(
        (e: any) => e.event_type === "OFFER_ACCEPTED",
      )?.created_at ??
      (events as any[] | null)?.find(
        (e: any) => e.event_type === "DEAL_ACCEPTED",
      )?.created_at ??
      null;

    const fallbackIsOwner =
      directOwnerMatches || threadOwnerMatches || grantMatches;

    const [fallbackSigData, fallbackAdminResult] = await Promise.all([
      loadSignatureData(svc, dealId),
      requireAdmin(),
    ]);
    const fallbackIsAdmin = fallbackAdminResult.ok;

    const fallbackWorkflowInput: WorkflowStateInput = {
      propertyStatus: livePropertyStatus,
      propertyReviewStatus: livePropertyReviewStatus,
      escalationDepositStatus: liveEscalationDepositStatus,
      escalationAvmStatus: liveEscalationAvmStatus,
      closingReviewStatus: liveClosingReviewStatus,
      avmEligibilityResult: null,
      triageStatus: fallbackDeal?.triage_status ?? null,
      threadStatus: thread?.status ?? null,
      packetStatus: fallbackSigData.packet?.status ?? null,
      servicingStatus: fallbackDeal?.servicing_status ?? null,
      manualAppraisalStatus: liveManualAppraisalStatus,
      liveIneligible: fallbackShowIneligibleBlock,
      renegotiationStatus: fallbackDeal?.renegotiation_status ?? null,
    };
    const canonicalResult = resolveCanonicalLifecycle(fallbackWorkflowInput);
    // Terminal lock — same rule as primary path.  Must come after canonicalResult
    // because fallbackCanEdit also depends on editingLocked and is declared below.
    if (isTerminalWorkflowStage(canonicalResult.stage)) editingLocked = true;
    // fallbackCanEdit is declared here (after canonicalResult) so the terminal lock above
    // is reflected.  It was previously computed before canonicalResult, which meant the
    // terminal lock could not reach it.
    const fallbackCanEdit = fallbackIsOwner && !editingLocked;
    // Fallback description: use canonical exception copy when not manual-appraisal basis.
    if (fallbackShowIneligibleBlock && fallbackIneligibleDescription === null) {
      fallbackIneligibleDescription =
        canonicalResult.exceptionDescription ?? null;
    }

    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-5xl p-6 space-y-6">
          <DealPageShell
            dealId={dealId}
            isOwner={fallbackIsOwner}
            locked={editingLocked}
            activeThread={effectiveThread}
            initialTitle={headerTitle}
            initialProperty={headerProperty}
            effectiveSnapshot={effectiveSnapshotRecord}
            isPropertyOwner={negState.isOwnerSide}
            isBuyer={negState.isBuyer}
            ownerProposalId={negState.currentProposal?.id ?? null}
            ownerProposalStatus={negState.currentProposal?.status ?? null}
            ownerTermsSnapshot={negState.currentProposal?.terms_snapshot ?? null}
            currentUserId={user.id}
          />

          {/* Linked property — hero + gallery sourced from property record by property_id */}
          {resolvedPropertyId && (fallbackDealPropertyOwnerPhotos.length > 0 || fallbackDealPropertyEnrichment) && (
            <div className="rounded-lg border overflow-hidden">
              <div className="bg-muted/40 px-4 py-2 border-b">
                <span className="text-sm font-medium">Linked Property</span>
              </div>
              <PropertyHeroMedia
                images={fallbackDealPropertyEnrichment?.images ?? null}
                lat={fallbackDealPropertyRecord?.latitude ?? null}
                lng={fallbackDealPropertyRecord?.longitude ?? null}
                address={headerProperty?.display_address ?? null}
                audience={fallbackIsAdmin ? "admin" : fallbackIsOwner ? "owner" : "buyer"}
                ownerPhotos={fallbackDealPropertyOwnerPhotos}
              />
            </div>
          )}

          {canonicalResult.isExceptionState && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-amber-600 dark:text-amber-400 flex-shrink-0">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-4 h-4"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                    {canonicalResult.exceptionLabel}
                  </p>
                  {canonicalResult.exceptionDescription && (
                    <p className="text-xs text-amber-800 dark:text-amber-200">
                      {canonicalResult.exceptionDescription}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {!canonicalResult.isExceptionState &&
            effectiveThread?.status === "accepted" &&
            !canonicalResult.customerHeroLabel &&
            canonicalResult.meta.stageNumber <= 2 && (
              <AcceptedPendingReviewBanner />
            )}

          {!canonicalResult.isExceptionState &&
            canonicalResult.customerHeroLabel && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-blue-600 dark:text-blue-400 flex-shrink-0">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-4 h-4"
                    >
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </span>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                      {canonicalResult.customerHeroLabel}
                    </p>
                    {canonicalResult.customerHeroDescription && (
                      <p className="text-xs text-blue-800 dark:text-blue-200">
                        {canonicalResult.customerHeroDescription}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

          {/* Property review blocked-state cue — fallback path. */}
          {fallbackIsOwner &&
            effectiveThread?.status === "accepted" &&
            resolvedPropertyId &&
            livePropertyReviewStatus === "information_requested" && (
              <PropertyReviewBlockedOwnerBanner
                propertyId={resolvedPropertyId}
              />
            )}

          {/* Ineligible deal action block — fallback path.
              Gated on fallbackShowIneligibleBlock (live FMV recomputation), NOT raw triage_status.
              Block type is dispatched on canonicalResult.stage:
                attom_required → ATTOM-first blocks (renegotiation not yet available)
                else            → Standard ineligible blocks (ATTOM complete; renegotiate/challenge) */}
          {fallbackShowIneligibleBlock &&
            fallbackIsOwner &&
            canonicalResult.stage === "attom_required" && (
              <AttomRequiredDealOwnerBlock propertyId={resolvedPropertyId} />
            )}
          {fallbackShowIneligibleBlock &&
            fallbackIsOwner &&
            canonicalResult.stage !== "attom_required" && (
              <IneligibleDealOwnerBlock
                dealId={dealId}
                propertyId={resolvedPropertyId}
                manualAppraisalStatus={liveManualAppraisalStatus}
                exceptionDescription={fallbackIneligibleDescription}
                renegotiationAlreadyRequested={
                  canonicalResult.stage === "renegotiation_requested"
                }
                proposalId={negState.currentProposal?.id}
                currentTerms={negState.currentProposal?.terms_snapshot ?? null}
              />
            )}

          {fallbackShowIneligibleBlock &&
            !fallbackIsOwner &&
            canonicalResult.stage === "attom_required" && (
              <AttomRequiredDealBuyerBlock />
            )}
          {fallbackShowIneligibleBlock &&
            !fallbackIsOwner &&
            canonicalResult.stage !== "attom_required" &&
            canonicalResult.stage !== "renegotiation_requested" && (
              <IneligibleDealBuyerBlock
                manualAppraisalStatus={liveManualAppraisalStatus}
                renegotiationRequested={false}
              />
            )}

          {showNegotiationUi && negState.isSender && effectiveThread && (
            <WaitingBanner
              threadId={effectiveThread.id}
              isBuyer={negState.isBuyer}
            />
          )}

          {showNegotiationUi &&
            negState.isResponder &&
            negState.currentProposal &&
            effectiveThread && (
              <NegotiationSection
                threadId={effectiveThread.id}
                proposalId={negState.currentProposal.id}
                proposalStatus={negState.currentProposal.status}
                currentTerms={negState.currentProposal.terms_snapshot ?? null}
                previousTerms={
                  negState.previousProposal?.terms_snapshot ?? null
                }
                isOwnerSide={negState.isOwnerSide}
              />
            )}

          {fallbackSigData.packet && (
            <SignatureCard
              dealId={dealId}
              threadStatus={effectiveThread?.status ?? null}
              packet={fallbackSigData.packet}
              recipients={fallbackSigData.recipients}
              isAdmin={fallbackIsAdmin}
              execAgreementUrl={fallbackSigData.execAgreementUrl}
              certificateUrl={fallbackSigData.certificateUrl}
            />
          )}

          {canonicalResult.stage === "servicing_active" ? (
            <div className="rounded-lg border bg-emerald-50/50 p-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-sm font-semibold text-emerald-800">
                  Deal active
                </span>
              </div>
              <p className="mt-2 text-sm text-emerald-700">
                Your agreement is complete and active. Signed documents are
                available for reference in the section above.
              </p>
            </div>
          ) : canonicalResult.meta.customerLabel ? (
            <DealMilestoneTracker
              currentStage={canonicalResult.stage}
              stageNote={null}
            />
          ) : null}

          <DealDetailWidgetPanel
            dealId={dealId}
            initialSnapshot={effectiveSnapshotRecord}
            inputs={inputs}
            results={results}
            computeVersion={
              typeof (effectiveSnapshotRecord as any)?.compute_version ===
              "string"
                ? (effectiveSnapshotRecord as any).compute_version
                : null
            }
            canEdit={fallbackCanEdit}
            persona="homeowner"
            isAccepted={["accepted", "closed"].includes(
              thread?.status ?? "",
            )}
            canonicalStage={canonicalResult.stage}
            acceptedAt={fallbackAcceptedAt}
          />

          {fallbackIsOwner && !editingLocked && snapJson && (
            <RecomputeSnapshotButton
              dealId={dealId}
              initialInputs={snapJson?.inputs ?? null}
            />
          )}

          {/* Property details — sourced from linked property record by property_id, not copied into deal */}
          {fallbackDealPropertyRecord && resolvedPropertyId && (
            <section>
              <h2 className="text-base font-semibold mb-3">Property Details</h2>
              <PropertyRecordSections
                record={fallbackDealPropertyRecord}
                audience={fallbackIsAdmin ? "admin" : fallbackIsOwner ? "owner" : "buyer"}
              />
            </section>
          )}

          {events && events.length > 0 && (
            <section>
              <h2 className="text-base font-semibold mb-3">Activity</h2>
              <DealActivityFeed
                items={events.map((e: any) => ({
                  id: e.id,
                  event_type: e.event_type,
                  payload: e.payload,
                  created_at: e.created_at,
                  created_by_user_id: e.created_by ?? null,
                }))}
              />
            </section>
          )}

          {debug && (
            <section className="rounded-lg border p-4 bg-muted/30 space-y-2">
              <h2 className="font-medium">Debug</h2>
              <pre className="text-xs overflow-auto">
                {JSON.stringify(
                  {
                    dealId,
                    auth: { userId: user.id, email: user.email },
                    fallbackDeal,
                    offerEvErr: offerEvErr?.message ?? null,
                    offerEv: offerEv ?? null,
                    threadId,
                    resolvedThreadId,
                    thread,
                    property,
                    ownerMatches,
                    allowDealFallback,
                    effectiveThread,
                    negState: {
                      isResponder: negState.isResponder,
                      isSender: negState.isSender,
                      isBuyer: negState.isBuyer,
                      isOwnerSide: negState.isOwnerSide,
                      currentProposalId: negState.currentProposal?.id ?? null,
                      previousProposalId: negState.previousProposal?.id ?? null,
                    },
                  },
                  null,
                  2,
                )}
              </pre>
            </section>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-3xl p-6 space-y-6">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm text-muted-foreground">
          You don't have access to this deal (or it may no longer exist).
        </p>
        <Link className="underline text-sm" href="/account">
          Go to my account
        </Link>

        {debug ? (
          <section className="rounded-lg border p-4 bg-muted/30 space-y-2">
            <h2 className="font-medium">Debug</h2>
            <pre className="text-xs overflow-auto">
              {JSON.stringify(
                {
                  dealId,
                  auth: { userId: user.id, email: user.email },
                  offerEvErr: offerEvErr?.message ?? null,
                  offerEv: offerEv ?? null,
                  threadId,
                  thread,
                  property,
                  ownerMatches,
                  allowDealFallback,
                },
                null,
                2,
              )}
            </pre>
          </section>
        ) : null}
      </main>
    </div>
  );
}
