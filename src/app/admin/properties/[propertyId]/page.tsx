import crypto from "crypto";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";
import { AdminPropertyActions } from "@/components/admin/AdminPropertyActions";
import {
  PropertyDocumentsPreview,
  type DocRow,
} from "@/components/admin/PropertyDocumentsPreview";
import { AdminPropertyStatusControls } from "@/components/admin/AdminPropertyStatusControls";
import {
  AdminReviewRequestPanel,
  type AdminReviewRequest,
} from "@/components/admin/AdminReviewRequestPanel";
import { AdminPropertyReviewControls } from "@/components/admin/AdminPropertyReviewControls";
import type { PropertyReviewStatus } from "@/components/admin/AdminPropertyReviewControls";
import { AdminVendorReviewPanel } from "@/components/admin/AdminVendorReviewPanel";
import { AdminAttomScreeningPanel } from "@/components/admin/AdminAttomScreeningPanel";
import { AdminDebtBasisPanel } from "@/components/admin/AdminDebtBasisPanel";
import { AdminMashvisorPanel } from "@/components/admin/AdminMashvisorPanel";
import { AdminEscalationSimPanel } from "@/components/admin/AdminEscalationSimPanel";
import { AdminManualAppraisalSimPanel } from "@/components/admin/AdminManualAppraisalSimPanel";
import { AdminPropertyClosingPanel } from "@/components/admin/AdminPropertyClosingPanel";
import { AppHeader } from "@/components/layout/AppHeader";
import {
  resolveCanonicalLifecycle,
  type WorkflowStateInput,
} from "@/lib/workflow/milestones";
import { computeLtvPolicy } from "@/lib/ltvPolicy";
import type { NormalizedPropertyProfile } from "@/lib/property-review/providers/rentcast";
import {
  computeAvmEligibility,
  extractAvmDealTerms,
  resolveControllingFmv,
  DEFAULT_LTV_RATIO,
  DEVIATION_ESCALATION_THRESHOLD_PCT,
  type AvmEligibilityCard,
} from "@/lib/avmEligibility";
import { PropertyStatusLanes } from "@/components/properties/PropertyStatusLanes";
import {
  deriveParticipationLane,
  deriveValuationLane,
  deriveClosingReadinessLane,
} from "@/lib/property/statusLanes";

function requirePreviewSecret(): string {
  const v = process.env.ADMIN_DOC_PREVIEW_SECRET;
  if (!v) throw new Error("Missing env: ADMIN_DOC_PREVIEW_SECRET");
  return v;
}

function b64url(buf: Buffer) {
  return buf
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

// token format: "<exp>.<sigB64url>"
// sig = HMAC_SHA256(secret, `${exp}.${propertyId}.${docType}.${storagePath}`)
function mintPreviewToken(args: {
  propertyId: string;
  docType: string;
  storagePath: string;
  expSecondsFromNow: number;
}): string {
  const exp = Math.floor(Date.now() / 1000) + args.expSecondsFromNow;
  const expStr = String(exp);
  const secret = requirePreviewSecret();
  const msg = `${expStr}.${args.propertyId}.${args.docType}.${args.storagePath}`;
  const sig = b64url(crypto.createHmac("sha256", secret).update(msg).digest());
  return `${expStr}.${sig}`;
}

function formatCurrency(val: number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
}

function formatDate(val: string | null | undefined): string {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return String(val);
  }
}

const REVIEW_STATUS_META: Record<string, { label: string; badgeCls: string }> = {
  under_review: { label: "Under review", badgeCls: "bg-blue-100 text-blue-800" },
  information_requested: { label: "Information requested", badgeCls: "bg-yellow-100 text-yellow-800" },
  ready_for_deposit: { label: "Ready for deposit", badgeCls: "bg-green-100 text-green-800" },
  amv_ordered: { label: "AMV ordered", badgeCls: "bg-blue-100 text-blue-800" },
  amv_complete: { label: "AMV complete", badgeCls: "bg-green-100 text-green-800" },
  property_review_complete: { label: "Review complete", badgeCls: "bg-emerald-100 text-emerald-800" },
  property_review_expired: { label: "Review expired", badgeCls: "bg-gray-100 text-gray-600" },
};

export default async function AdminPropertyAuditPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;

  const admin = await requireAdmin();

  if (!admin.ok) {
    if (admin.status === 401) {
      redirect(`/login?returnTo=${encodeURIComponent("/admin/properties")}`);
    }

    return (
      <div>
        <AppHeader />
        <main className="mx-auto max-w-3xl p-6 space-y-6">
          <h1 className="text-2xl font-semibold">Admin</h1>
          <div className="rounded-lg border p-4">
            <div className="text-sm font-medium">Access denied</div>
            <div className="mt-2 text-sm text-muted-foreground">
              You are signed in as{" "}
              <span className="font-mono">{admin.email ?? "unknown"}</span> but
              do not have admin access.
            </div>
            <div className="mt-4">
              <a className="text-sm underline" href="/dashboard">
                Back to Dashboard
              </a>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const supabase = createServiceClient();

  const propRes = await (supabase.from("properties") as any)
    .select(
      "id, owner_user_id, address_line1, address_line2, city, state, postal_code, status, created_at, updated_at, reviewed_at, reviewed_by, verified_at, verified_by, review_notes, has_secured_property_debt, secured_property_debt_amount, secured_debt_certified_at, secured_debt_last_verified_at, secured_debt_fresh_until, secured_debt_verification_status, latest_verified_fmv, fmv_verified_at, fmv_verification_source, ltv_policy_ratio, max_accessible_cash_current, ownership_type, occupancy_use, occupancy_use_other, major_condition_issue, major_condition_issue_details, known_liens_and_claims, total_known_debt_amount, total_known_debt_confidence, debt_statement_availability, title_claims_known, title_claims_details, owner_stated_fmv, owner_stated_fmv_confidence, owner_stated_fmv_source, owner_stated_fmv_source_other, willing_to_proceed_formal_review, proposal_interest_status, visibility_preference, proposal_preferences_acknowledged_at, property_review_status, property_review_status_updated_at, property_review_note, property_review_expires_at, property_review_completed_at, escalation_deposit_status, escalation_avm_status, closing_review_status, closing_review_note, manual_appraisal_status, manual_appraisal_fmv, verification_state, owner_verification_removed_at, owner_verification_removed_reason, verified_appraisal_value_status, verified_appraisal_value_context_owner_id, current_fractpath_eligible_cash_cap, current_eligibility_posture, current_limiting_factors_json, current_controlling_secured_debt_basis, current_controlling_secured_debt_amount, secured_debt_basis_reason, secured_debt_basis_updated_at",
    )
    .eq("id", propertyId)
    .maybeSingle();

  if (propRes.error || !propRes.data) {
    return (
      <main className="mx-auto max-w-4xl p-6 space-y-4">
        <a className="text-sm underline" href="/admin/properties?status=queue">
          &larr; Back to queue
        </a>
        <h1 className="text-2xl font-semibold">Property review</h1>
        <div className="rounded-lg border p-4 text-sm text-muted-foreground">
          Property not found (or failed to load).
        </div>
      </main>
    );
  }

  const p: any = propRes.data;

  const addressDisplay = [
    p.address_line1,
    p.address_line2,
    p.city,
    p.state,
    p.postal_code,
  ]
    .filter(Boolean)
    .join(", ");

  const [auditRes, docsRes, underwritingRes, linkedThreadRes, summaryRes, recentRunsRes, enrichmentRes] = await Promise.all([
    (supabase.from("property_status_audit") as any)
      .select(
        "id, from_status, to_status, changed_by, actor_type, changed_at, notes",
      )
      .eq("property_id", propertyId)
      .order("changed_at", { ascending: false }),
    (supabase.from("property_documents") as any)
      .select("doc_type, storage_path, content_type, created_at")
      .eq("property_id", propertyId),
    (supabase.from("property_underwriting_snapshots") as any)
      .select(
        "id, captured_at, actor_type, snapshot_source, has_secured_property_debt, secured_property_debt_amount, latest_verified_fmv, ltv_policy_ratio, max_accessible_cash_current, notes",
      )
      .eq("property_id", propertyId)
      .order("captured_at", { ascending: false })
      .limit(20),
    (supabase.from("deal_threads") as any)
      .select("id, deal_id")
      .eq("property_id", propertyId)
      .eq("status", "accepted")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    (supabase.from("property_review_summary") as any)
      .select(
        "profile_provider, profile_fetched_at, profile_expires_at, fmv_provider, fmv_amount, fmv_low, fmv_high, fmv_confidence, fmv_fetched_at, fmv_expires_at",
      )
      .eq("property_id", propertyId)
      .maybeSingle(),
    (supabase.from("property_review_runs") as any)
      .select("artifact_type, status, error_message, requested_at, normalized_payload, raw_payload, is_current")
      .eq("property_id", propertyId)
      .order("requested_at", { ascending: false })
      .limit(10),
    (supabase.from("property_enrichments") as any)
      .select("id, status, provider_record_id, is_current, summary_payload, images_payload, fetched_at, error_message")
      .eq("property_id", propertyId)
      .eq("provider", "mashvisor")
      .eq("is_current", true)
      .maybeSingle(),
  ]);

  // Fetch triage metadata for the linked accepted deal (if any)
  let linkedDeal: {
    id: string;
    triage_status: string | null;
    triage_reason_tags: string[] | null;
    fmv_plausibility_flag: string | null;
    accepted_at: string | null;
    servicing_status: string | null;
    renegotiation_status: string | null;
  } | null = null;

  if (linkedThreadRes.data?.deal_id) {
    const { data: dealRow } = await (supabase.from("deals") as any)
      .select("id, triage_status, triage_reason_tags, fmv_plausibility_flag, accepted_at, servicing_status, renegotiation_status")
      .eq("id", linkedThreadRes.data.deal_id)
      .maybeSingle();
    linkedDeal = dealRow ?? null;
  }

  // Fetch the linked deal's latest proposal (for deal-term eligibility context).
  // NOTE: proposalSnapshot is stored here; AVM eligibility is computed after vendorSummary is declared below.
  let linkedDealProposalSnapshot: unknown = null;
  if (linkedDeal) {
    const linkedThreadId: string | null = linkedThreadRes.data?.id ?? null;
    if (linkedThreadId) {
      const { data: proposalRow } = await (supabase.from("deal_proposals") as any)
        .select("terms_snapshot")
        .eq("thread_id", linkedThreadId)
        .in("status", ["submitted", "accepted"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      linkedDealProposalSnapshot = proposalRow?.terms_snapshot ?? null;
    }
  }

  // Fetch all review requests for this deal+property (including resolved), newest first.
  // currentReviewRequest = latest open/submitted (for the editable panel).
  // allReviewRequests   = complete history (for the read-only history section).
  let currentReviewRequest: AdminReviewRequest | null = null;
  let allReviewRequests: AdminReviewRequest[] = [];
  if (linkedDeal?.id) {
    const { data: reqRows } = await (supabase.from("deal_review_requests") as any)
      .select(
        "id, deal_id, property_id, status, requested_items, admin_note, homeowner_note, resolved_note, submitted_at, resolved_at, created_at",
      )
      .eq("deal_id", linkedDeal.id)
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })
      .limit(20);
    allReviewRequests = (reqRows ?? []) as AdminReviewRequest[];
    currentReviewRequest =
      allReviewRequests.find((r) => r.status === "open" || r.status === "submitted") ?? null;
  }

  const auditRows = (auditRes.data ?? []) as any[];
  const underwritingRows = (underwritingRes.data ?? []) as any[];

  const vendorSummary = summaryRes.data ?? null;

  // Compute linked-deal AVM eligibility using the shared helper.
  // Uses the same vendorSummary (AVM data) and linked deal's proposal terms.
  let linkedDealAvmEligibility: AvmEligibilityCard | null = null;
  if (linkedDeal) {
    const proposalTerms = extractAvmDealTerms(linkedDealProposalSnapshot);
    const securedDebt =
      p.has_secured_property_debt === true ? (p.secured_property_debt_amount ?? 0) : 0;
    // Prefer canonical properties.latest_verified_fmv (written by ATTOM screening
    // and the escalation sim) over the RentCast property_review_summary AVM amount.
    // Fall back to vendorSummary only when ATTOM has not yet run.
    const canonicalFmv = (p.latest_verified_fmv as number | null) ?? null;
    const fallbackFmv = canonicalFmv ?? (vendorSummary?.fmv_amount as number | null) ?? null;
    linkedDealAvmEligibility = computeAvmEligibility({
      verifiedFmv: fallbackFmv,
      fmvProvider: canonicalFmv != null
        ? ((p.fmv_verification_source as string | null) ?? "attom")
        : ((vendorSummary?.fmv_provider as string | null) ?? null),
      fmvFetchedAt: canonicalFmv != null
        ? ((p.fmv_verified_at as string | null) ?? null)
        : ((vendorSummary?.fmv_fetched_at as string | null) ?? null),
      fmvExpiresAt: canonicalFmv != null
        ? ((p.property_review_expires_at as string | null) ?? null)
        : ((vendorSummary?.fmv_expires_at as string | null) ?? null),
      proposedFmv: proposalTerms.property_value,
      securedDebt,
      ltvRatio: (p.ltv_policy_ratio as number | null) ?? DEFAULT_LTV_RATIO,
      requestedCash: proposalTerms.upfront_payment,
    });
  }

  const recentRuns = (recentRunsRes.data ?? []) as {
    artifact_type: string;
    status: string;
    error_message: string | null;
    requested_at: string;
    normalized_payload: unknown;
    raw_payload: unknown;
    is_current: boolean;
  }[];
  const latestProfileRun = recentRuns.find((r) => r.artifact_type === "property_profile") ?? null;
  const latestAvmRun = recentRuns.find((r) => r.artifact_type === "avm") ?? null;
  // ATTOM enhanced screening runs are stored with artifact_type "enhanced_screening"
  const latestAttomRun = recentRuns.find((r) => r.artifact_type === "enhanced_screening") ?? null;

  const currentEnrichment = (enrichmentRes.data ?? null) as {
    id: string;
    status: string;
    provider_record_id: string | null;
    summary_payload: unknown;
    images_payload: unknown;
    fetched_at: string | null;
    error_message: string | null;
  } | null;
  const lastProfileError =
    latestProfileRun?.status === "failed"
      ? { error_message: latestProfileRun.error_message }
      : null;
  const lastAvmError =
    latestAvmRun?.status === "failed"
      ? { error_message: latestAvmRun.error_message }
      : null;
  const currentProfileRun =
    recentRuns.find(
      (r) => r.artifact_type === "property_profile" && r.is_current && r.status === "completed",
    ) ?? null;
  const persistedProfileDetails =
    (currentProfileRun?.normalized_payload as NormalizedPropertyProfile | null) ?? null;

  // Mint short-lived per-doc tokens (10 minutes) for ALL doc types
  const docs: DocRow[] = ((docsRes.data ?? []) as any[]).map((d) => ({
    doc_type: String(d.doc_type),
    content_type: d.content_type ?? null,
    preview_token: mintPreviewToken({
      propertyId,
      docType: String(d.doc_type),
      storagePath: String(d.storage_path),
      expSecondsFromNow: 10 * 60,
    }),
  }));

  // Derived debt metrics
  const hasDebt = p.has_secured_property_debt;
  const debtStatus = p.secured_debt_verification_status ?? null;
  const computedLtv =
    p.latest_verified_fmv && p.secured_property_debt_amount
      ? ((p.secured_property_debt_amount / p.latest_verified_fmv) * 100).toFixed(1)
      : null;

  // LTV policy limits (kept for technical reference)
  const adminPolicyDebtAmount =
    p.has_secured_property_debt === true
      ? (p.secured_property_debt_amount ?? 0)
      : 0;
  const adminPolicy = computeLtvPolicy({
    proposed_deal_fmv: null,
    upfront_payment: null,
    monthly_payment: null,
    number_of_payments: null,
    latest_verified_fmv: p.latest_verified_fmv ?? null,
    secured_debt_amount: adminPolicyDebtAmount,
    ltv_policy_ratio: p.ltv_policy_ratio ?? 0.75,
    secured_debt_certified_at: p.secured_debt_certified_at ?? null,
    secured_debt_last_verified_at: p.secured_debt_last_verified_at ?? null,
    secured_debt_fresh_until: p.secured_debt_fresh_until ?? null,
  });

  const reviewStatus: PropertyReviewStatus | null =
    p.property_review_status ?? null;
  const reviewStatusMeta = reviewStatus ? (REVIEW_STATUS_META[reviewStatus] ?? null) : null;

  const TRIAGE_BADGE: Record<string, { label: string; cls: string }> = {
    ready_for_signatures: { label: "Ready for signatures", cls: "bg-green-100 text-green-800" },
    // "ready_for_deposit" kept for backward compatibility with legacy rows.
    ready_for_deposit: { label: "Ready for signatures (legacy)", cls: "bg-green-100 text-green-800" },
    triage_in_progress: { label: "Triage in progress", cls: "bg-blue-100 text-blue-800" },
    more_info_needed: { label: "Additional information required", cls: "bg-yellow-100 text-yellow-800" },
    ineligible: { label: "Ineligible", cls: "bg-red-100 text-red-800" },
  };

  // ── Admin property live-ineligible recomputation ─────────────────────────────
  // Uses the controlling FMV basis (manual appraisal when complete, otherwise
  // latest_verified_fmv) against the linked deal proposal to determine live eligibility.
  let adminPropLiveIneligible = false;
  if (linkedDeal?.triage_status === "ineligible") {
    const { fmv: propControllingFmv } = resolveControllingFmv({
      latestVerifiedFmv: (p.latest_verified_fmv as number | null) ?? null,
      fmvVerificationSource: (p.fmv_verification_source as string | null) ?? null,
      manualAppraisalFmv: (p.manual_appraisal_fmv as number | null) ?? null,
      manualAppraisalStatus: (p.manual_appraisal_status as string | null) ?? null,
    });
    if (propControllingFmv != null && linkedDealProposalSnapshot) {
      const propTerms = extractAvmDealTerms(linkedDealProposalSnapshot);
      const securedDebt = p.has_secured_property_debt === true ? (p.secured_property_debt_amount ?? 0) : 0;
      const propLiveCheck = computeAvmEligibility({
        verifiedFmv: propControllingFmv,
        fmvProvider: null,
        fmvFetchedAt: null,
        fmvExpiresAt: null,
        proposedFmv: propTerms.property_value,
        securedDebt,
        ltvRatio: (p.ltv_policy_ratio as number | null) ?? DEFAULT_LTV_RATIO,
        requestedCash: propTerms.upfront_payment,
      });
      adminPropLiveIneligible = propLiveCheck.result !== "eligible";
    } else {
      adminPropLiveIneligible = true;
    }
  }

  const propCanonicalInput: WorkflowStateInput = {
    propertyStatus: p.status ?? null,
    propertyReviewStatus: (p.property_review_status as string | null) ?? null,
    escalationDepositStatus: (p.escalation_deposit_status as string | null) ?? null,
    escalationAvmStatus: (p.escalation_avm_status as string | null) ?? null,
    closingReviewStatus: (p.closing_review_status as string | null) ?? null,
    avmEligibilityResult: linkedDealAvmEligibility?.result ?? null,
    triageStatus: linkedDeal?.triage_status ?? null,
    threadStatus: linkedThreadRes.data ? "accepted" : null,
    packetStatus: null,
    servicingStatus: linkedDeal?.servicing_status ?? null,
    manualAppraisalStatus: (p.manual_appraisal_status as string | null) ?? null,
    liveIneligible: adminPropLiveIneligible,
    renegotiationStatus: linkedDeal?.renegotiation_status ?? null,
  };
  const propCanonical = resolveCanonicalLifecycle(propCanonicalInput);

  const OWNING_SURFACE_LABEL: Record<string, string> = {
    property_review: "Property review page",
    deal_review: "Deal review page",
    external_partner: "External partner",
  };

  // ── Three-lane status derivation ──────────────────────────────────────────
  const adminParticipationLane = deriveParticipationLane(p.status ?? null);
  const adminValuationLane = deriveValuationLane({
    manualAppraisalStatus: (p.manual_appraisal_status as string | null) ?? null,
    escalationAvmStatus: (p.escalation_avm_status as string | null) ?? null,
    fmvVerificationSource: (p.fmv_verification_source as string | null) ?? null,
    latestVerifiedFmv: (p.latest_verified_fmv as number | null) ?? null,
  });
  const adminClosingReadinessLane = deriveClosingReadinessLane({
    hasAcceptedDeal: !!linkedThreadRes.data?.id,
    propertyReviewStatus: (p.property_review_status as string | null) ?? null,
    closingReviewStatus: (p.closing_review_status as string | null) ?? null,
  });

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-6">

      {/* ── Nav breadcrumb ── */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <a className="underline text-muted-foreground hover:text-foreground" href="/dashboard">
          &larr; Dashboard
        </a>
        <span className="text-muted-foreground">/</span>
        <a className="underline text-muted-foreground hover:text-foreground" href="/admin/properties">
          Properties
        </a>
        <span className="text-muted-foreground">/</span>
        <a className="underline text-muted-foreground hover:text-foreground" href="/admin/deals">
          Deals
        </a>
        {linkedDeal && (
          <>
            <span className="text-muted-foreground">/</span>
            <a
              className="underline text-muted-foreground hover:text-foreground"
              href={`/deal/${linkedDeal.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View linked deal →
            </a>
          </>
        )}
        <span className="ml-auto">
          <a
            className="underline text-muted-foreground hover:text-foreground"
            href={`/admin/properties?status=${encodeURIComponent(p.status)}`}
          >
            View list ({String(p.status).replace("_", " ")})
          </a>
        </span>
      </div>

      {/* ── Page heading ── */}
      <div>
        <h1 className="text-2xl font-semibold">Property review</h1>
        <p className="text-sm text-muted-foreground">{addressDisplay || p.id}</p>
      </div>

      {/* ── Property overview ── */}
      <div className="rounded-lg border p-4 text-sm space-y-1">
        {/* Three-lane status block */}
        <div className="mb-3">
          <PropertyStatusLanes
            participation={adminParticipationLane}
            valuation={adminValuationLane}
            closingReadiness={adminClosingReadinessLane}
          />
        </div>
        <div>
          <span className="text-muted-foreground">Owner:</span>{" "}
          <span className="font-mono text-xs break-all">{p.owner_user_id}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Address:</span>{" "}
          {addressDisplay || "—"}
        </div>
        <div>
          <span className="text-muted-foreground">Created:</span>{" "}
          {formatDate(p.created_at)}
        </div>
        <div>
          <span className="text-muted-foreground">Last reviewed:</span>{" "}
          {formatDate(p.reviewed_at)}
        </div>
        <div>
          <span className="text-muted-foreground">Verified:</span>{" "}
          {formatDate(p.verified_at)}
        </div>
        {p.review_notes && (
          <div className="pt-1">
            <span className="text-muted-foreground">Review notes:</span>{" "}
            {p.review_notes}
          </div>
        )}
      </div>

      {/* ── Transaction status ── */}
      <div className="rounded-lg border overflow-hidden">
        <div className="px-4 py-2 text-sm font-semibold border-b bg-muted/40 flex items-center gap-2 flex-wrap">
          <span>Transaction status</span>
          <span className="text-xs font-normal rounded-full px-2 py-0.5 bg-blue-100 text-blue-800">
            Stage {propCanonical.meta.stageNumber} — {propCanonical.meta.adminLabel}
          </span>
        </div>
        <div className="px-4 py-3 space-y-2 text-sm">
          {propCanonical.adminBlocker && (
            <div className="flex gap-2">
              <span className="text-muted-foreground min-w-[120px]">Blocker:</span>
              <span className="text-orange-700 dark:text-orange-400 font-medium">{propCanonical.adminBlocker}</span>
            </div>
          )}
          <div className="flex gap-2">
            <span className="text-muted-foreground min-w-[120px]">Next action:</span>
            <span>{propCanonical.adminNextAction ?? "No action required"}</span>
          </div>
          {propCanonical.adminOwningSurface && (
            <div className="flex gap-2">
              <span className="text-muted-foreground min-w-[120px]">Owns this stage:</span>
              <span className="text-xs rounded-full px-2 py-0.5 bg-muted font-medium">
                {OWNING_SURFACE_LABEL[propCanonical.adminOwningSurface] ?? propCanonical.adminOwningSurface}
              </span>
            </div>
          )}
          <div className="flex gap-2">
            <span className="text-muted-foreground min-w-[120px]">Owner sees:</span>
            <span className="italic">
              {propCanonical.isExceptionState
                ? `Exception callout: "${propCanonical.exceptionLabel}"`
                : propCanonical.customerHeroLabel
                  ? `"${propCanonical.customerHeroLabel}"`
                  : "No milestone — accepted/pending review banner"}
            </span>
          </div>
          {linkedDeal && (
            <div className="flex gap-2">
              <span className="text-muted-foreground min-w-[120px]">Linked deal:</span>
              <a
                href={`/admin/deals/${linkedDeal.id}`}
                className="underline text-muted-foreground hover:text-foreground text-xs"
              >
                View deal review →
              </a>
            </div>
          )}
        </div>
      </div>

      {/* ── Homeowner intake ── */}
      {(p.ownership_type ||
        p.occupancy_use ||
        p.major_condition_issue ||
        (p.known_liens_and_claims && p.known_liens_and_claims.length > 0) ||
        p.title_claims_known ||
        p.owner_stated_fmv != null ||
        p.willing_to_proceed_formal_review) && (
        <div className="rounded-lg border overflow-hidden">
          <div className="bg-muted/40 px-4 py-2 text-sm font-medium border-b">
            Homeowner intake
          </div>
          <div className="p-4 text-sm space-y-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <div>
                <div className="text-muted-foreground text-xs">Ownership type</div>
                <div className="font-medium">
                  {p.ownership_type?.replace(/_/g, " ") ?? "—"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Occupancy use</div>
                <div className="font-medium">
                  {p.occupancy_use?.replace(/_/g, " ") ?? "—"}
                  {p.occupancy_use === "other" && p.occupancy_use_other
                    ? `: ${p.occupancy_use_other}`
                    : ""}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Major condition issue</div>
                <div className="font-medium">
                  {p.major_condition_issue?.replace(/_/g, " ") ?? "—"}
                </div>
              </div>
              {p.major_condition_issue === "yes" && (
                <div>
                  <div className="text-muted-foreground text-xs">Condition details</div>
                  <div className="font-medium break-words">
                    {p.major_condition_issue_details ?? "—"}
                  </div>
                </div>
              )}
              <div>
                <div className="text-muted-foreground text-xs">Title claims known</div>
                <div className="font-medium">
                  {p.title_claims_known?.replace(/_/g, " ") ?? "—"}
                </div>
              </div>
              {p.title_claims_known === "yes" && (
                <div>
                  <div className="text-muted-foreground text-xs">Title claim details</div>
                  <div className="font-medium break-words">
                    {p.title_claims_details ?? "—"}
                  </div>
                </div>
              )}
              <div>
                <div className="text-muted-foreground text-xs">Owner-stated FMV</div>
                <div className="font-medium">{formatCurrency(p.owner_stated_fmv)}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">FMV confidence</div>
                <div className="font-medium">
                  {p.owner_stated_fmv_confidence?.replace(/_/g, " ") ?? "—"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">FMV basis</div>
                <div className="font-medium">
                  {p.owner_stated_fmv_source?.replace(/_/g, " ") ?? "—"}
                  {p.owner_stated_fmv_source === "other" && p.owner_stated_fmv_source_other
                    ? `: ${p.owner_stated_fmv_source_other}`
                    : ""}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Open to formal review</div>
                <div className="font-medium">
                  {p.willing_to_proceed_formal_review?.replace(/_/g, " ") ?? "—"}
                </div>
              </div>
            </div>
            {p.known_liens_and_claims && p.known_liens_and_claims.length > 0 && (
              <div className="border-t pt-3">
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  Known liens and claims
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {p.known_liens_and_claims.map((v: string) => (
                    <span
                      key={v}
                      className="inline-block rounded-full border px-2 py-0.5 text-xs"
                    >
                      {v.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2">
                  <div>
                    <div className="text-muted-foreground text-xs">Total declared debt</div>
                    <div className="font-medium">{formatCurrency(p.total_known_debt_amount)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Confidence</div>
                    <div className="font-medium">
                      {p.total_known_debt_confidence?.replace(/_/g, " ") ?? "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Statements available</div>
                    <div className="font-medium">{p.debt_statement_availability ?? "—"}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Proposal Preferences ── */}
      <div className="rounded-lg border overflow-hidden">
        <div className="bg-muted/40 px-4 py-2 text-sm font-medium border-b">
          Proposal Preferences
        </div>
        <div className="p-4 text-sm">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <div>
              <div className="text-muted-foreground text-xs">Proposals</div>
              <div className="font-medium">
                {p.proposal_interest_status === "interested_after_verification"
                  ? "Enabled after verification"
                  : "Off"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Visibility</div>
              <div className="font-medium capitalize">
                {p.visibility_preference
                  ? p.visibility_preference.charAt(0).toUpperCase() +
                    p.visibility_preference.slice(1)
                  : "Private"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Acknowledgment</div>
              <div className="font-medium">
                {p.proposal_preferences_acknowledged_at
                  ? `Accepted — ${formatDate(p.proposal_preferences_acknowledged_at)}`
                  : p.proposal_interest_status === "interested_after_verification"
                    ? "Missing"
                    : "Not required"}
              </div>
            </div>
          </div>
          {p.visibility_preference === "public" && (
            <p className="mt-3 text-xs text-muted-foreground">
              Public preference does not make this property buyer-visible until verification
              succeeds and downstream product visibility rules allow it.
            </p>
          )}
        </div>
      </div>

      {/* ── Verification + Supporting documents (two sections rendered by component) ── */}
      <PropertyDocumentsPreview propertyId={propertyId} docs={docs} />

      {/* ── Additional information request ── */}
      {linkedDeal && (
        <AdminReviewRequestPanel
          dealId={linkedDeal.id}
          propertyId={propertyId}
          initialRequest={currentReviewRequest}
        />
      )}

      {/* ── Additional information request history (read-only audit) ── */}
      {allReviewRequests.length > 0 && (() => {
        const REQ_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
          open: { label: "Open", cls: "bg-yellow-100 text-yellow-800" },
          submitted: { label: "Homeowner responded", cls: "bg-blue-100 text-blue-800" },
          resolved: { label: "Resolved", cls: "bg-green-100 text-green-800" },
        };
        return (
          <div className="rounded-lg border overflow-hidden">
            <div className="bg-muted/40 px-4 py-2 text-sm font-medium border-b">
              Additional information request history
            </div>
            <div className="divide-y">
              {allReviewRequests.map((req) => {
                const badge = REQ_STATUS_BADGE[req.status];
                return (
                  <div key={req.id} className="p-4 text-sm space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {badge && (
                        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${badge.cls}`}>
                          {badge.label}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        Opened {formatDate(req.created_at)}
                      </span>
                    </div>
                    {req.requested_items.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {req.requested_items.map((item) => (
                          <span
                            key={item.type}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-muted text-foreground"
                          >
                            {item.label}
                          </span>
                        ))}
                      </div>
                    )}
                    {req.admin_note && (
                      <div>
                        <div className="text-xs text-muted-foreground">Admin note</div>
                        <div className="text-sm whitespace-pre-wrap mt-0.5">{req.admin_note}</div>
                      </div>
                    )}
                    {req.homeowner_note && (
                      <div className="rounded-md bg-blue-50 border border-blue-100 px-3 py-2">
                        <div className="text-xs text-blue-700 font-medium">Homeowner response</div>
                        <div className="text-sm whitespace-pre-wrap mt-0.5">{req.homeowner_note}</div>
                        {req.submitted_at && (
                          <div className="text-xs text-blue-600 mt-1">
                            Submitted {formatDate(req.submitted_at)}
                          </div>
                        )}
                      </div>
                    )}
                    {req.status === "resolved" && (
                      <div className="rounded-md bg-green-50 border border-green-100 px-3 py-2">
                        <div className="text-xs text-green-700 font-medium">Resolution</div>
                        {req.resolved_note ? (
                          <div className="text-sm whitespace-pre-wrap mt-0.5">{req.resolved_note}</div>
                        ) : (
                          <div className="text-xs text-green-600 mt-0.5">No resolution note.</div>
                        )}
                        {req.resolved_at && (
                          <div className="text-xs text-green-600 mt-1">
                            Resolved {formatDate(req.resolved_at)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── Property review ── */}
      <div className="rounded-lg border overflow-hidden">
        <div className="bg-muted/40 px-4 py-2 text-sm font-medium border-b flex items-center gap-2 flex-wrap">
          <span>Property review</span>
          {reviewStatusMeta ? (
            <span className={`text-xs rounded-full px-2 py-0.5 font-normal ${reviewStatusMeta.badgeCls}`}>
              {reviewStatusMeta.label}
            </span>
          ) : (
            <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-gray-100 text-gray-500">
              Not started
            </span>
          )}
        </div>

        <div className="p-4 space-y-5 text-sm">
          {/* Status controls */}
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Status controls
            </div>
            <AdminPropertyReviewControls
              propertyId={propertyId}
              currentReviewStatus={reviewStatus}
            />
          </div>

          {/* Information requested — contextual callout */}
          {reviewStatus === "information_requested" && (
            <div className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2.5 space-y-1.5">
              <div className="text-xs font-semibold text-yellow-900">Awaiting homeowner information</div>
              <p className="text-xs text-yellow-800">
                This property is in <strong>information requested</strong> status. The homeowner has been asked to supply additional documentation.
              </p>
              {linkedDeal ? (
                <p className="text-xs text-yellow-800">
                  Use the <strong>Additional information request</strong> panel on this page to view or update the checklist and requested items.
                </p>
              ) : (
                <p className="text-xs text-yellow-800 italic">
                  No deal is currently linked to this property. The information request checklist requires an active linked deal — it will appear automatically once a deal is associated.
                </p>
              )}
            </div>
          )}

          {/* Review outputs */}
          <div className="border-t pt-4 space-y-4">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Review outputs
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              {/* Debt basis summary */}
              <div>
                <div className="text-muted-foreground text-xs">Owner-declared debt</div>
                <div className="font-medium">
                  {hasDebt === true
                    ? formatCurrency(p.secured_property_debt_amount)
                    : hasDebt === false
                      ? "None"
                      : p.total_known_debt_amount != null
                        ? (
                          <span>
                            {formatCurrency(p.total_known_debt_amount)}
                            <span className="ml-1 text-xs font-normal text-muted-foreground">(intake)</span>
                          </span>
                        )
                        : "Not declared"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Debt verification status</div>
                <div className="font-medium capitalize">
                  {debtStatus?.replace(/_/g, " ") ?? "—"}
                </div>
              </div>

              {/* FMV basis summary */}
              <div>
                <div className="text-muted-foreground text-xs">Owner-stated FMV</div>
                <div className="font-medium">{formatCurrency(p.owner_stated_fmv)}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Verified FMV</div>
                <div className="font-medium">{formatCurrency(p.latest_verified_fmv)}</div>
              </div>

              {/* Max available deal cash */}
              <div>
                <div className="text-muted-foreground text-xs">Max available deal cash</div>
                <div className="font-medium">
                  {p.max_accessible_cash_current != null
                    ? formatCurrency(p.max_accessible_cash_current)
                    : <span className="text-muted-foreground text-xs">Requires verified FMV</span>}
                </div>
              </div>

              {/* Review freshness */}
              <div>
                <div className="text-muted-foreground text-xs">Review completed</div>
                <div className="font-medium">{formatDate(p.property_review_completed_at)}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Review expires</div>
                <div className="font-medium">
                  {p.property_review_expires_at ? (
                    <>
                      {formatDate(p.property_review_expires_at)}
                      {(() => {
                        const exp = new Date(p.property_review_expires_at);
                        const isExpired = exp < new Date();
                        const daysLeft = Math.ceil((exp.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                        return isExpired ? (
                          <span className="ml-1 text-xs text-red-600">(expired)</span>
                        ) : daysLeft <= 30 ? (
                          <span className="ml-1 text-xs text-yellow-700">({daysLeft}d remaining)</span>
                        ) : null;
                      })()}
                    </>
                  ) : (
                    <span className="text-muted-foreground text-xs">Not set</span>
                  )}
                </div>
              </div>
            </div>

            {/* Review note */}
            {p.property_review_note && (
              <div>
                <div className="text-muted-foreground text-xs mb-1">Latest review note</div>
                <div className="rounded-md bg-muted/30 px-3 py-2 text-sm whitespace-pre-wrap">
                  {p.property_review_note}
                </div>
                {p.property_review_status_updated_at && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Updated {formatDate(p.property_review_status_updated_at)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Vendor review data (RentCast profile + AVM) ── */}
      <AdminVendorReviewPanel
        propertyId={propertyId}
        initialSummary={vendorSummary}
        lastProfileError={lastProfileError}
        lastAvmError={lastAvmError}
        initialProfileDetails={persistedProfileDetails}
      />

      {/* ── ATTOM enhanced screening ── */}
      {/*
        Real ATTOM data integration: property detail + AVM fetched in parallel from
        ATTOM Data Solutions. On a clean outcome the controlling FMV, verification state,
        and eligible cash cap are materialised onto the property immediately.
        Run history is stored in property_review_runs (artifact_type: enhanced_screening).
        Requires ATTOM_API_KEY to be configured.
      */}
      <AdminAttomScreeningPanel
        propertyId={propertyId}
        lastRun={
          latestAttomRun
            ? {
                status: latestAttomRun.status,
                requested_at: latestAttomRun.requested_at,
                normalized_payload: latestAttomRun.normalized_payload as any,
                raw_payload: latestAttomRun.raw_payload as any,
              }
            : null
        }
        verificationState={(p.verification_state as string | null) ?? null}
        eligibilityPosture={(p.current_eligibility_posture as string | null) ?? null}
        limitingFactorsJson={p.current_limiting_factors_json ?? null}
        latestVerifiedFmv={(p.latest_verified_fmv as number | null) ?? null}
        fmvVerificationSource={(p.fmv_verification_source as string | null) ?? null}
        eligibleCashCap={(p.current_fractpath_eligible_cash_cap as number | null) ?? null}
      />

      {/* ── Mashvisor enrichment ── */}
      {/*
        Manual admin-only enrichment fetch from Mashvisor.
        Does not auto-trigger; does not affect owner-facing surfaces.
        Stored in property_enrichments (provider: mashvisor).
        Requires MASHVISOR_API_KEY to be configured.
      */}
      <AdminMashvisorPanel
        propertyId={propertyId}
        hasAddress={!!(p.address_line1 && p.city && p.state)}
        enrichment={currentEnrichment}
      />

      {/* ── Debt basis management ── */}
      {/*
        Shows ATTOM vs owner-declared debt discrepancy and lets admin adopt an
        authoritative debt basis.  Per FractPath policy, debt discrepancy is an
        admin review signal — it does NOT auto-block deal eligibility.
      */}
      {latestAttomRun && (
        (() => {
          const np = latestAttomRun.normalized_payload as any;
          const ddr = np?.debtDiscrepancyResult ?? null;
          return (
            <div className="rounded-lg border overflow-hidden">
              <div className="bg-muted/40 px-4 py-2 text-sm font-medium border-b flex items-center gap-2">
                <span>Debt basis</span>
                {ddr?.severity && ddr.severity !== "none" && ddr.severity !== "minor" && (
                  <span className={`text-xs rounded-full px-2 py-0.5 font-normal ${
                    ddr.severity === "blocking" || ddr.severity === "significant"
                      ? "bg-orange-100 text-orange-800"
                      : "bg-yellow-100 text-yellow-800"
                  }`}>
                    Review required — {ddr.severity} discrepancy
                  </span>
                )}
                {(!ddr || ddr.severity === "none" || ddr.severity === "minor") && (
                  <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-gray-100 text-gray-500">
                    No significant discrepancy
                  </span>
                )}
              </div>
              <div className="p-4">
                <AdminDebtBasisPanel
                  propertyId={propertyId}
                  attomEstimatedDebt={(ddr?.screeningDebt as number | null) ?? null}
                  ownerDeclaredDebt={(ddr?.reportedDebt as number | null) ?? (p.secured_property_debt_amount as number | null) ?? null}
                  debtDiscrepancySeverity={(ddr?.severity as string | null) ?? null}
                  debtDiscrepancyDelta={(ddr?.delta as number | null) ?? null}
                  currentControllingDebtBasis={(p.current_controlling_secured_debt_basis as string | null) ?? null}
                  currentControllingDebtAmount={(p.current_controlling_secured_debt_amount as number | null) ?? null}
                  debtBasisReason={(p.secured_debt_basis_reason as string | null) ?? null}
                  debtBasisUpdatedAt={(p.secured_debt_basis_updated_at as string | null) ?? null}
                />
              </div>
            </div>
          );
        })()
      )}

      {/* ── Manual appraisal simulation (dev/staging only) ── */}
      {/*
        Simulates manual appraisal payment collection and FMV submission without
        hitting real payment or appraiser systems.

        TODO(stripe): Replace payment simulation with live Stripe payment-intent flow.
        TODO(appraisal): Replace result submission with real licensed appraiser report ingestion.
      */}
      <div className="rounded-lg border overflow-hidden">
        <div className="bg-muted/40 px-4 py-2 text-sm font-medium border-b flex items-center gap-2">
          <span>Manual appraisal simulation</span>
          <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-amber-100 text-amber-800">
            [SIMULATION]
          </span>
          {p.escalation_avm_status === "completed" ? (
            <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-emerald-100 text-emerald-800">
              Override applied
            </span>
          ) : p.escalation_deposit_status === "paid" ? (
            <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-blue-100 text-blue-800">
              Deposit paid
            </span>
          ) : p.escalation_deposit_status ? (
            <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-yellow-100 text-yellow-800">
              Deposit {p.escalation_deposit_status}
            </span>
          ) : null}
        </div>
        <div className="p-4">
          <AdminEscalationSimPanel
            propertyId={propertyId}
            depositStatus={(p.escalation_deposit_status as string | null) ?? null}
            avmStatus={(p.escalation_avm_status as string | null) ?? null}
            suggestedFmv={
              (p.owner_stated_fmv as number | null) ??
              (vendorSummary?.fmv_amount as number | null) ??
              null
            }
          />
        </div>
      </div>

      {/* ── Manual appraisal challenge (exception branch — property-owned) ── */}
      {/*
        Optional unhappy-path escalation when a stronger AVM result renders the deal ineligible.
        The homeowner can commission a licensed manual appraisal to challenge the automated valuation.
        On completion, the controlling FMV basis is updated and the deal must be re-triaged.
        This branch is outside the normal happy-path milestone ladder.

        TODO(manual-appraisal): Replace simulation with real licensed appraiser ordering + result ingestion.
      */}
      {(!!p.manual_appraisal_status || (p.escalation_avm_status === "completed" && linkedDeal?.triage_status === "ineligible")) && (
        <div className="rounded-lg border overflow-hidden">
          <div className="bg-muted/40 px-4 py-2 text-sm font-medium border-b flex items-center gap-2">
            <span>Manual appraisal challenge</span>
            {!p.manual_appraisal_status && (
              <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-gray-100 text-gray-500">
                Not initiated
              </span>
            )}
            {p.manual_appraisal_status && (
              <span className={`text-xs rounded-full px-2 py-0.5 font-normal ${
                p.manual_appraisal_status === "complete"
                  ? "bg-emerald-100 text-emerald-800"
                  : p.manual_appraisal_status === "in_progress"
                    ? "bg-blue-100 text-blue-800"
                    : p.manual_appraisal_status === "payment_pending"
                      ? "bg-orange-100 text-orange-800"
                      : "bg-yellow-100 text-yellow-800"
              }`}>
                {p.manual_appraisal_status === "complete"
                  ? "Completed"
                  : p.manual_appraisal_status === "in_progress"
                    ? "In progress"
                    : p.manual_appraisal_status === "payment_pending"
                      ? "Payment pending"
                      : "Challenge available"}
              </span>
            )}
            <span className="text-xs text-muted-foreground italic ml-auto">Exception branch — ineligible deal path</span>
          </div>
          <div className="p-4">
            <AdminManualAppraisalSimPanel
              propertyId={propertyId}
              appraisalStatus={(p.manual_appraisal_status as string | null) ?? null}
              appraisalFmv={(p.manual_appraisal_fmv as number | null) ?? null}
              escalatedFmv={(p.latest_verified_fmv as number | null) ?? null}
            />
          </div>
        </div>
      )}

      {/* ── Closing review (property-owned stages 7-9) ── */}
      {/*
        Title search, closing documentation, and final pre-close checks.
        This section owns closing_review_status: pending → issue_found → ready.
        Transitions trigger customer notifications and are logged in the property audit trail.
        Deal close and servicing (stages 14-16) are owned by the deal review page.

        TODO(title-partner): Replace simulation with real title/settlement partner status ingestion.
      */}
      <div className="rounded-lg border overflow-hidden">
        <div className="bg-muted/40 px-4 py-2 text-sm font-medium border-b flex items-center gap-2">
          <span>Closing review</span>
          {p.closing_review_status === "ready" ? (
            <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-emerald-100 text-emerald-800">
              Ready for closing
            </span>
          ) : p.closing_review_status === "issue_found" ? (
            <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-red-100 text-red-800">
              Issue found
            </span>
          ) : p.closing_review_status === "pending" ? (
            <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-blue-100 text-blue-800">
              Review pending
            </span>
          ) : (
            <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-gray-100 text-gray-500">
              Not started
            </span>
          )}
          <span className="ml-auto text-xs text-muted-foreground font-normal italic">
            [SIMULATION]
          </span>
        </div>
        <div className="p-4">
          <AdminPropertyClosingPanel
            propertyId={propertyId}
            dealId={linkedDeal?.id ?? null}
            closingReviewStatus={(p.closing_review_status as "pending" | "issue_found" | "ready" | null) ?? null}
            closingReviewNote={(p.closing_review_note as string | null) ?? null}
          />
        </div>
      </div>

      {/* ── Linked deal ── */}
      {/* Shows the downstream deal-eligibility impact of this property's valuation state.
          Deposit/escalation actions are never surfaced here — they live in the section above. */}
      <div className="rounded-lg border overflow-hidden">
        <div className="bg-muted/40 px-4 py-2 text-sm font-medium border-b flex items-center gap-2 flex-wrap">
          <span>Linked deal</span>
          {linkedDeal?.triage_status && (() => {
            const b = TRIAGE_BADGE[linkedDeal!.triage_status!];
            return b ? (
              <span className={`text-xs rounded-full px-2 py-0.5 font-normal ${b.cls}`}>
                {b.label}
              </span>
            ) : null;
          })()}
          {linkedDeal && (
            <a
              href={`/admin/deals/${linkedDeal.id}`}
              className="ml-auto text-xs underline text-muted-foreground hover:text-foreground font-normal"
            >
              Admin deal review →
            </a>
          )}
        </div>
        <div className="p-4 text-sm">
          {!linkedDeal ? (
            <p className="text-muted-foreground text-xs">
              No accepted deal linked to this property yet.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="space-y-0.5">
                <div className="font-medium">{addressDisplay || "Address not available"}</div>
                <div className="text-xs text-muted-foreground font-mono">
                  Deal {linkedDeal.id.slice(0, 8)}…
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <div>
                  <div className="text-muted-foreground text-xs">Deal review status</div>
                  <div className="font-medium">
                    {linkedDeal.triage_status
                      ? (TRIAGE_BADGE[linkedDeal.triage_status]?.label ?? linkedDeal.triage_status.replace(/_/g, " "))
                      : <span className="text-muted-foreground">Accepted — pending review</span>}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Accepted</div>
                  <div className="font-medium">{formatDate(linkedDeal.accepted_at)}</div>
                </div>
              </div>

              {/* Deal eligibility context — derived from the shared AVM helper */}
              {linkedDealAvmEligibility && (() => {
                const { result } = linkedDealAvmEligibility;
                type EligCtx = { label: string; cls: string; detail: string };
                let ctx: EligCtx | null = null;
                if (result === "blocked_pending_fmv") {
                  ctx = {
                    label: "Deal blocked — awaiting property valuation",
                    cls: "bg-yellow-50 border-yellow-200 text-yellow-800",
                    detail: linkedDealAvmEligibility.isFmvExpired
                      ? "The verified AVM has expired. Deal-term eligibility cannot be assessed until a fresh AVM is run on this property."
                      : "No verified AVM is on file. Deal-term eligibility is blocked until an AVM run completes.",
                  };
                } else if (result === "escalated_review_required") {
                  ctx = {
                    label: "Deal blocked — escalated valuation review required",
                    cls: "bg-red-50 border-red-200 text-red-800",
                    detail: `AVM deviation (${linkedDealAvmEligibility.deviationPct?.toFixed(1)}%) exceeds the ${DEVIATION_ESCALATION_THRESHOLD_PCT}% escalation threshold. Deal-term eligibility is blocked pending a stronger valuation review. Use the stronger valuation pathway above.`,
                  };
                } else if (result === "manual_review_required") {
                  ctx = {
                    label: "Deal review — admin acknowledgment required",
                    cls: "bg-orange-50 border-orange-200 text-orange-800",
                    detail: `AVM deviation (${linkedDealAvmEligibility.deviationPct?.toFixed(1)}%) requires admin acknowledgment on the deal review page before the deal can advance to ready for signatures.`,
                  };
                } else if (result === "ineligible_ltv") {
                  ctx = {
                    label: "Deal blocked — terms exceed LTV eligibility",
                    cls: "bg-red-50 border-red-200 text-red-800",
                    detail: `Proposed cash (${formatCurrency(linkedDealAvmEligibility.requestedCash)}) exceeds the maximum eligible amount (${formatCurrency(linkedDealAvmEligibility.maxEligibleCash)}) under the LTV policy. Deal terms must be revised or countered.`,
                  };
                } else if (result === "eligible") {
                  ctx = {
                    label: "Deal eligible for signatures",
                    cls: "bg-green-50 border-green-200 text-green-800",
                    detail: "Property valuation and deal terms both pass eligibility checks. The deal may be advanced to ready for signatures on the deal review page.",
                  };
                }
                return ctx ? (
                  <div className={`rounded-md border px-3 py-2.5 text-xs space-y-0.5 ${ctx.cls}`}>
                    <div className="font-semibold">{ctx.label}</div>
                    <div>{ctx.detail}</div>
                  </div>
                ) : null;
              })()}

              {linkedDeal.triage_reason_tags && linkedDeal.triage_reason_tags.length > 0 && (
                <div>
                  <div className="text-muted-foreground text-xs mb-1.5">Triage reason tags</div>
                  <div className="flex flex-wrap gap-1">
                    {linkedDeal.triage_reason_tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-muted text-muted-foreground font-mono"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4 pt-1">
                <a
                  href="/admin/deals"
                  className="text-xs underline text-muted-foreground hover:text-foreground"
                >
                  View triage queue →
                </a>
                <a
                  href={`/admin/deals/${linkedDeal.id}`}
                  className="text-xs underline text-muted-foreground hover:text-foreground"
                >
                  Go to deal review →
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Technical details (secondary) ── */}
      <details className="rounded-lg border overflow-hidden group">
        <summary className="bg-muted/40 px-4 py-2 text-sm font-medium cursor-pointer select-none flex items-center justify-between">
          <span>Technical underwriting details</span>
          <span className="text-xs text-muted-foreground group-open:hidden">Show</span>
          <span className="text-xs text-muted-foreground hidden group-open:inline">Hide</span>
        </summary>
        <div className="p-4 space-y-6 text-sm">

          {/* Secured debt underwriting */}
          <div className="space-y-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              Secured debt underwriting
              {debtStatus && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-normal ${
                    debtStatus === "verified"
                      ? "bg-green-100 text-green-800"
                      : debtStatus === "stale"
                        ? "bg-yellow-100 text-yellow-800"
                        : debtStatus === "pending"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {debtStatus.replace(/_/g, " ")}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <div>
                <div className="text-muted-foreground text-xs">Secured debt declared</div>
                <div className="font-medium">
                  {hasDebt === null ? "Not declared" : hasDebt ? "Yes" : "No"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Owner-declared balance</div>
                <div className="font-medium">
                  {hasDebt === true
                    ? formatCurrency(p.secured_property_debt_amount)
                    : hasDebt === false
                      ? "None"
                      : "—"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Declaration certified</div>
                <div className="font-medium">{formatDate(p.secured_debt_certified_at)}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Admin verified</div>
                <div className="font-medium">{formatDate(p.secured_debt_last_verified_at)}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Freshness expires</div>
                <div className="font-medium">{formatDate(p.secured_debt_fresh_until)}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Verified FMV</div>
                <div className="font-medium">{formatCurrency(p.latest_verified_fmv)}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">FMV verified at</div>
                <div className="font-medium">{formatDate(p.fmv_verified_at)}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">FMV source</div>
                <div className="font-medium">{p.fmv_verification_source ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Policy LTV cap</div>
                <div className="font-medium">
                  {p.ltv_policy_ratio != null ? `${(p.ltv_policy_ratio * 100).toFixed(1)}%` : "—"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Current LTV (declared)</div>
                <div className="font-medium">
                  {computedLtv !== null ? `${computedLtv}%` : "—"}
                </div>
              </div>
            </div>
          </div>

          {/* LTV policy limits */}
          <div className="space-y-3 border-t pt-4">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              LTV policy limits
              {adminPolicy.execution_readiness_blocked_by_underwriting ? (
                <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-red-100 text-red-800">
                  blocked
                </span>
              ) : (
                <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-green-100 text-green-800">
                  clear
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <div>
                <div className="text-muted-foreground text-xs">Executable max cash</div>
                <div className="font-medium">
                  {formatCurrency(adminPolicy.executable_max_accessible_cash)}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Debt data stale (&gt;90 days)</div>
                <div className={`font-medium ${adminPolicy.secured_debt_data_is_stale ? "text-red-600" : ""}`}>
                  {adminPolicy.secured_debt_data_is_stale ? "Yes" : "No"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Verified FMV missing</div>
                <div className={`font-medium ${adminPolicy.verified_fmv_required_for_execution ? "text-red-600" : ""}`}>
                  {adminPolicy.verified_fmv_required_for_execution ? "Yes" : "No"}
                </div>
              </div>
            </div>
            {adminPolicy.block_reasons_internal.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">Block reasons</div>
                <ul className="list-disc list-inside space-y-0.5 text-xs text-red-700">
                  {adminPolicy.block_reasons_internal.map((r) => (
                    <li key={r} className="font-mono">{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </details>

      {/* ── Admin verification controls ── */}
      <div className="rounded-lg border overflow-hidden">
        <div className="bg-muted/40 px-4 py-2 text-sm font-medium border-b">
          Verification controls
        </div>
        <div className="p-4 space-y-3">
          <AdminPropertyActions propertyId={propertyId} status={p.status} />
          <AdminPropertyStatusControls
            propertyId={propertyId}
            currentStatus={p.status}
          />
        </div>
      </div>

      {/* ── Underwriting snapshots ── */}
      {underwritingRows.length > 0 && (
        <div className="rounded-lg border overflow-x-auto">
          <div className="bg-muted/40 px-4 py-2 text-sm font-medium border-b">
            Underwriting snapshot history
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="p-3 text-xs text-muted-foreground">When</th>
                <th className="p-3 text-xs text-muted-foreground">Source</th>
                <th className="p-3 text-xs text-muted-foreground">Actor</th>
                <th className="p-3 text-xs text-muted-foreground">Debt</th>
                <th className="p-3 text-xs text-muted-foreground">Balance</th>
                <th className="p-3 text-xs text-muted-foreground">FMV</th>
                <th className="p-3 text-xs text-muted-foreground">Max cash</th>
              </tr>
            </thead>
            <tbody>
              {underwritingRows.map((snap: any) => (
                <tr key={snap.id} className="border-t">
                  <td className="p-3 whitespace-nowrap text-xs">{formatDate(snap.captured_at)}</td>
                  <td className="p-3 text-xs">{snap.snapshot_source}</td>
                  <td className="p-3 text-xs">{snap.actor_type}</td>
                  <td className="p-3 text-xs">
                    {snap.has_secured_property_debt === null
                      ? "—"
                      : snap.has_secured_property_debt
                        ? "Yes"
                        : "No"}
                  </td>
                  <td className="p-3 text-xs">{formatCurrency(snap.secured_property_debt_amount)}</td>
                  <td className="p-3 text-xs">{formatCurrency(snap.latest_verified_fmv)}</td>
                  <td className="p-3 text-xs">{formatCurrency(snap.max_accessible_cash_current)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Property activity ── */}
      <div className="rounded-lg border overflow-x-auto">
        <div className="bg-muted/40 px-4 py-2 text-sm font-medium border-b">
          Property activity
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="p-3 text-xs text-muted-foreground">When</th>
              <th className="p-3 text-xs text-muted-foreground">Transition</th>
              <th className="p-3 text-xs text-muted-foreground">By</th>
              <th className="p-3 text-xs text-muted-foreground">Notes</th>
            </tr>
          </thead>
          <tbody>
            {auditRes.error ? (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={4}>
                  Failed to load activity: {auditRes.error.message}
                </td>
              </tr>
            ) : auditRows.length === 0 ? (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={4}>
                  No activity recorded yet.
                </td>
              </tr>
            ) : (
              auditRows.map((a: any) => (
                <tr key={a.id} className="border-t">
                  <td className="p-3 whitespace-nowrap text-xs">{formatDate(a.changed_at)}</td>
                  <td className="p-3 whitespace-nowrap text-xs">
                    {a.from_status} &rarr; {a.to_status}
                    <span className="ml-2 text-muted-foreground">({a.actor_type})</span>
                  </td>
                  <td className="p-3">
                    <span className="font-mono text-xs break-all">{a.changed_by}</span>
                  </td>
                  <td className="p-3 text-xs break-words">{a.notes ?? ""}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </main>
  );
}
