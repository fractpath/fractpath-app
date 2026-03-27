import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";
import { getDealEvents } from "@/lib/dealTimeline";
import { AdminDealActions } from "@/components/admin/AdminDealActions";
import {
  DEFAULT_LTV_RATIO,
  DEVIATION_ESCALATION_THRESHOLD_PCT,
  DEVIATION_REVIEW_THRESHOLD_PCT,
  AVM_RESULT_META,
  computeAvmEligibility,
  type AvmEligibilityCard,
} from "@/lib/avmEligibility";

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function formatDateShort(val: string | null | undefined): string {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleDateString("en-US", { dateStyle: "medium" });
  } catch {
    return String(val);
  }
}

/** Extract deal_terms from various snapshot formats */
function extractDealTerms(snapshot: unknown): {
  upfront_payment: number | null;
  monthly_payment: number | null;
  number_of_payments: number | null;
  property_value: number | null;
} | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const s = snapshot as Record<string, unknown>;
  const inputs = s.inputs as Record<string, unknown> | undefined;
  const dealTerms = (inputs?.deal_terms ?? s.deal_terms ?? {}) as Record<string, unknown>;
  return {
    upfront_payment: (dealTerms.upfront_payment as number) ?? null,
    monthly_payment: (dealTerms.monthly_payment as number) ?? null,
    number_of_payments: (dealTerms.number_of_payments as number) ?? null,
    property_value: (dealTerms.property_value as number) ?? null,
  };
}

// ─── Deal review state derivation ───────────────────────────────────────────

type ReviewStateTone = "neutral" | "warning" | "blocking" | "success" | "error";

interface DealReviewState {
  label: string;
  tone: ReviewStateTone;
  explanation: string;
  blocking_dependency: string | null;
  next_step_hint: string;
}

const TONE_BADGE: Record<ReviewStateTone, string> = {
  neutral: "bg-blue-100 text-blue-800",
  warning: "bg-yellow-100 text-yellow-800",
  blocking: "bg-orange-100 text-orange-800",
  success: "bg-green-100 text-green-800",
  error: "bg-red-100 text-red-800",
};

function deriveAdminDealReviewState(args: {
  triage_status: string | null;
  has_open_review_request: boolean;
  property_review_status: string | null;
  has_max_cash: boolean;
}): DealReviewState {
  const { triage_status, has_open_review_request, property_review_status, has_max_cash } = args;

  if (triage_status === "ineligible") {
    return {
      label: "Ineligible",
      tone: "error",
      explanation: "This deal has been marked ineligible and cannot proceed as currently structured.",
      blocking_dependency: null,
      next_step_hint: "Review triage tags and reason for ineligibility. Archive if confirmed.",
    };
  }

  if (triage_status === "more_info_needed") {
    if (has_open_review_request) {
      return {
        label: "Information request pending homeowner",
        tone: "warning",
        explanation: "An additional information request has been sent and is awaiting homeowner response.",
        blocking_dependency: "Homeowner must submit requested information",
        next_step_hint: "Check back once homeowner submits their response via the property page.",
      };
    }
    return {
      label: "More information needed",
      tone: "warning",
      explanation: "Triage flagged this deal as needing additional information before it can progress.",
      blocking_dependency: "Missing intake information must be resolved",
      next_step_hint: "Open an additional information request on the property review page.",
    };
  }

  if (triage_status === "ready_for_deposit") {
    return {
      label: "Ready for deposit request",
      tone: "success",
      explanation: "Initial triage passed. The deal is ready for a deposit request to be issued.",
      blocking_dependency: null,
      next_step_hint: "Issue deposit request. Deposit receipt will unlock further review stages.",
    };
  }

  if (triage_status === "triage_in_progress") {
    switch (property_review_status) {
      case null:
        return {
          label: "Blocked — property review not started",
          tone: "blocking",
          explanation: "Deal triage is in progress but the linked property has no active review status.",
          blocking_dependency: "Property review must be started before deal can advance",
          next_step_hint: "Open the property review page and set status to 'Under review'.",
        };
      case "under_review":
        return {
          label: "Property review in progress",
          tone: "neutral",
          explanation: "Property-side diligence is underway. Deal review will resume once property review is sufficiently complete.",
          blocking_dependency: "Waiting for property review to reach a decision state",
          next_step_hint: "Monitor property review progress. Set deal review state once property review is complete.",
        };
      case "information_requested":
        return {
          label: "Blocked — property information requested",
          tone: "blocking",
          explanation: "A property-level information request is open. Deal review is blocked until it is resolved.",
          blocking_dependency: "Waiting for property additional information request to be resolved",
          next_step_hint: "Resolve the property information request before advancing the deal.",
        };
      case "amv_ordered":
        return {
          label: "Awaiting AMV result",
          tone: "neutral",
          explanation: "Automated Market Valuation has been ordered. Deal review is pending the AMV result.",
          blocking_dependency: "Waiting for AMV result to complete property valuation",
          next_step_hint: "Update property review status to 'AMV complete' when result is received.",
        };
      case "amv_complete":
      case "ready_for_deposit":
      case "property_review_complete":
        return {
          label: "Deal review in progress",
          tone: "neutral",
          explanation: has_max_cash
            ? "Property diligence is sufficiently complete. Reviewing deal economics against property envelope."
            : "Property review has progressed but max available deal cash is not yet set. Review may be incomplete.",
          blocking_dependency: has_max_cash ? null : "Max available deal cash not set on property",
          next_step_hint: has_max_cash
            ? "Review economics comparison below. Advance deal to 'Ready for deposit' or 'Ineligible'."
            : "Ensure max available deal cash is set on the property review page.",
        };
      case "property_review_expired":
        return {
          label: "Blocked — property review expired",
          tone: "blocking",
          explanation: "The linked property's review has passed its freshness window. A fresh review is required.",
          blocking_dependency: "Property review has expired and must be renewed",
          next_step_hint: "Initiate a new property review cycle on the property review page.",
        };
      default:
        return {
          label: "Triage in progress",
          tone: "neutral",
          explanation: `Manual triage is in progress. Property review status: ${property_review_status?.replace(/_/g, " ") ?? "unknown"}.`,
          blocking_dependency: null,
          next_step_hint: "Continue property and deal review. Set outcome when ready.",
        };
    }
  }

  // triage_status === null
  return {
    label: "Accepted — pending review",
    tone: "neutral",
    explanation: "Deal has been accepted. Initial triage is pending.",
    blocking_dependency: null,
    next_step_hint: "Run triage or manually set a review state below.",
  };
}

// ─── Event labels (admin-readable) ──────────────────────────────────────────

function adminEventLabel(eventType: string): string {
  switch (eventType) {
    case "DEAL_CREATED": return "Deal created";
    case "DEAL_SNAPSHOT_CREATED": return "Snapshot saved";
    case "DEAL_OFFER_CREATED": return "Offer submitted";
    case "DEAL_COUNTER_CREATED": return "Counter-offer submitted";
    case "DEAL_VERSION_DECIDED": return "Decision recorded";
    case "DEAL_SHARED": return "Deal shared";
    case "OFFER_ACCEPTED": return "Offer accepted";
    case "OFFER_REJECTED": return "Offer declined";
    case "DEAL_TRIAGE_EVALUATED": return "Initial triage evaluated";
    case "DEAL_TRIAGE_READY_FOR_DEPOSIT": return "Marked ready for deposit";
    case "DEAL_TRIAGE_MORE_INFO_NEEDED": return "Flagged: additional information needed";
    case "DEAL_TRIAGE_INELIGIBLE": return "Marked ineligible";
    case "DEAL_REVIEW_REQUEST_CREATED": return "Additional information request opened";
    case "DEAL_REVIEW_REQUEST_RESOLVED": return "Additional information request resolved";
    case "DEAL_TRIAGE_RETURNED_TO_REVIEW": return "Returned to triage in progress";
    case "DEAL_HEADER_UPDATED": return "Deal header updated";
    default: return eventType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

const PROPERTY_REVIEW_STATUS_META: Record<string, { label: string; badgeCls: string }> = {
  under_review: { label: "Under review", badgeCls: "bg-blue-100 text-blue-800" },
  information_requested: { label: "Information requested", badgeCls: "bg-yellow-100 text-yellow-800" },
  ready_for_deposit: { label: "Ready for deposit", badgeCls: "bg-green-100 text-green-800" },
  amv_ordered: { label: "AMV ordered", badgeCls: "bg-blue-100 text-blue-800" },
  amv_complete: { label: "AMV complete", badgeCls: "bg-green-100 text-green-800" },
  property_review_complete: { label: "Review complete", badgeCls: "bg-emerald-100 text-emerald-800" },
  property_review_expired: { label: "Review expired", badgeCls: "bg-gray-100 text-gray-600" },
};

// ─── Page ───────────────────────────────────────────────────────────────────

export default async function AdminDealReviewPage({
  params,
}: {
  params: Promise<{ dealId: string }>;
}) {
  const { dealId } = await params;

  const admin = await requireAdmin();
  if (!admin.ok) {
    if (admin.status === 401) {
      redirect(`/login?returnTo=${encodeURIComponent("/admin/deals")}`);
    }
    return (
      <main className="mx-auto max-w-4xl p-6 space-y-6">
        <h1 className="text-2xl font-semibold">Deal review</h1>
        <div className="rounded-lg border p-4 text-sm">Access denied.</div>
      </main>
    );
  }

  const svc = createServiceClient();

  // ── Fetch deal ──────────────────────────────────────────────────────────
  const { data: deal, error: dealErr } = await (svc.from("deals") as any)
    .select("id, status, triage_status, triage_reason_tags, fmv_plausibility_flag, accepted_at, created_at")
    .eq("id", dealId)
    .maybeSingle();

  if (dealErr || !deal) {
    return (
      <main className="mx-auto max-w-4xl p-6 space-y-4">
        <Link href="/admin/deals" className="text-sm underline text-muted-foreground">
          &larr; Back to deals
        </Link>
        <div className="rounded-lg border p-4 text-sm text-muted-foreground">
          Deal not found or failed to load.
        </div>
      </main>
    );
  }

  // ── Fetch thread + property ─────────────────────────────────────────────
  const { data: thread } = await (svc.from("deal_threads") as any)
    .select(
      "id, property_id, status, created_at, properties(id, address_line1, address_line2, city, state, postal_code, property_review_status, property_review_status_updated_at, property_review_note, property_review_expires_at, property_review_completed_at, has_secured_property_debt, secured_property_debt_amount, latest_verified_fmv, fmv_verified_at, owner_stated_fmv, owner_stated_fmv_confidence, owner_stated_fmv_source, max_accessible_cash_current, ltv_policy_ratio)",
    )
    .eq("deal_id", dealId)
    .maybeSingle();

  const property: any = (thread as any)?.properties ?? null;
  const propertyId: string | null = (thread as any)?.property_id ?? null;

  const addressDisplay = property
    ? [property.address_line1, property.city, property.state].filter(Boolean).join(", ")
    : null;

  // ── Parallel fetches ─────────────────────────────────────────────────────
  const [eventsResult, reviewRequestRes, proposalRes, reviewSummaryRes] = await Promise.all([
    getDealEvents(svc, dealId, 100),

    // Latest review request for this deal+property
    propertyId
      ? (svc.from("deal_review_requests") as any)
          .select("id, status, requested_items, admin_note, homeowner_note, resolved_note, submitted_at, resolved_at, created_at")
          .eq("deal_id", dealId)
          .eq("property_id", propertyId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),

    // Latest submitted or accepted proposal for economics
    thread?.id
      ? (svc.from("deal_proposals") as any)
          .select("id, status, terms_snapshot, created_at")
          .eq("thread_id", thread.id)
          .in("status", ["submitted", "accepted"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),

    // Property review summary for verified AVM inputs
    propertyId
      ? (svc.from("property_review_summary") as any)
          .select("fmv_amount, fmv_provider, fmv_fetched_at, fmv_expires_at")
          .eq("property_id", propertyId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const events = eventsResult.ok ? eventsResult.events : [];
  const reviewRequest: any = reviewRequestRes.data ?? null;
  const latestProposal: any = proposalRes.data ?? null;
  const reviewSummary: any = reviewSummaryRes.data ?? null;

  // ── Derived values ───────────────────────────────────────────────────────
  const hasOpenReviewRequest =
    reviewRequest !== null &&
    (reviewRequest.status === "open" || reviewRequest.status === "submitted");

  const propReviewStatus: string | null = property?.property_review_status ?? null;
  const propReviewMeta = propReviewStatus ? (PROPERTY_REVIEW_STATUS_META[propReviewStatus] ?? null) : null;
  const hasPropMaxCash = property?.max_accessible_cash_current != null;

  const dealReviewState = deriveAdminDealReviewState({
    triage_status: deal.triage_status ?? null,
    has_open_review_request: hasOpenReviewRequest,
    property_review_status: propReviewStatus,
    has_max_cash: hasPropMaxCash,
  });

  // ── Economics extraction ─────────────────────────────────────────────────
  const proposedTerms = latestProposal
    ? extractDealTerms(latestProposal.terms_snapshot)
    : null;

  const upfront = proposedTerms?.upfront_payment ?? null;
  const monthly = proposedTerms?.monthly_payment ?? null;
  const months = proposedTerms?.number_of_payments ?? null;
  const maxCash = property?.max_accessible_cash_current ?? null;
  const fmvBasis = property?.latest_verified_fmv ?? property?.owner_stated_fmv ?? null;
  const debtBasis = property?.has_secured_property_debt ? (property?.secured_property_debt_amount ?? 0) : 0;

  // ── AVM eligibility ───────────────────────────────────────────────────────
  const avmEligibility: AvmEligibilityCard = computeAvmEligibility({
    verifiedFmv: (reviewSummary?.fmv_amount as number | null) ?? null,
    fmvProvider: (reviewSummary?.fmv_provider as string | null) ?? null,
    fmvFetchedAt: (reviewSummary?.fmv_fetched_at as string | null) ?? null,
    fmvExpiresAt: (reviewSummary?.fmv_expires_at as string | null) ?? null,
    proposedFmv: proposedTerms?.property_value ?? null,
    securedDebt: debtBasis,
    ltvRatio: (property?.ltv_policy_ratio as number | null) ?? DEFAULT_LTV_RATIO,
    requestedCash: upfront,
  });
  const avmMeta = AVM_RESULT_META[avmEligibility.result];

  // Simple envelope check: compare proposed upfront against max available cash
  let economicsResult: { label: string; cls: string; detail: string } | null = null;
  if (upfront !== null && maxCash !== null) {
    if (upfront > maxCash * 1.02) {
      economicsResult = {
        label: "Exceeds current property envelope",
        cls: "bg-red-100 text-red-800",
        detail: `Proposed upfront (${formatCurrency(upfront)}) exceeds max available deal cash (${formatCurrency(maxCash)}).`,
      };
    } else {
      economicsResult = {
        label: "Within current property envelope",
        cls: "bg-green-100 text-green-800",
        detail: `Proposed upfront (${formatCurrency(upfront)}) is within max available deal cash (${formatCurrency(maxCash)}).`,
      };
    }
  } else if (upfront !== null && maxCash === null) {
    economicsResult = {
      label: "Insufficient property review data",
      cls: "bg-yellow-100 text-yellow-800",
      detail: "Max available deal cash not yet set on property review. Cannot compare proposed economics.",
    };
  }

  // ── Triage badge ─────────────────────────────────────────────────────────
  const TRIAGE_BADGE: Record<string, { label: string; cls: string }> = {
    ready_for_deposit: { label: "Ready for deposit request", cls: "bg-green-100 text-green-800" },
    triage_in_progress: { label: "Triage in progress", cls: "bg-blue-100 text-blue-800" },
    more_info_needed: { label: "Additional information required", cls: "bg-yellow-100 text-yellow-800" },
    ineligible: { label: "Ineligible", cls: "bg-red-100 text-red-800" },
  };

  const triageBadge = deal.triage_status ? (TRIAGE_BADGE[deal.triage_status] ?? null) : null;

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-6">

      {/* ── Nav ── */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link className="underline text-muted-foreground hover:text-foreground" href="/dashboard">
          &larr; Dashboard
        </Link>
        <span className="text-muted-foreground">/</span>
        <Link className="underline text-muted-foreground hover:text-foreground" href="/admin/deals">
          Deals
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-muted-foreground truncate max-w-[200px]">
          {addressDisplay ?? `Deal ${dealId.slice(0, 8)}…`}
        </span>
        {propertyId && (
          <Link
            href={`/admin/properties/${propertyId}`}
            className="ml-auto text-xs underline text-muted-foreground hover:text-foreground"
          >
            Property review →
          </Link>
        )}
      </div>

      {/* ── Deal header ── */}
      <div>
        <div className="flex flex-wrap items-start gap-3">
          <div>
            <h1 className="text-2xl font-semibold">
              {addressDisplay ?? "Deal review"}
            </h1>
            <p className="text-sm text-muted-foreground font-mono mt-0.5">
              Deal {dealId.slice(0, 8)}… &nbsp;·&nbsp; Accepted {formatDateShort(deal.accepted_at)}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 items-center mt-1">
            {triageBadge ? (
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${triageBadge.cls}`}>
                {triageBadge.label}
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
                Accepted – pending review
              </span>
            )}
            {deal.fmv_plausibility_flag && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                deal.fmv_plausibility_flag === "green"
                  ? "bg-green-100 text-green-800"
                  : deal.fmv_plausibility_flag === "yellow"
                    ? "bg-yellow-100 text-yellow-800"
                    : "bg-red-100 text-red-800"
              }`}>
                FMV {deal.fmv_plausibility_flag}
              </span>
            )}
          </div>
        </div>
        <div className="mt-2 flex gap-3 flex-wrap text-xs">
          <Link
            href={`/deal/${deal.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-muted-foreground hover:text-foreground"
          >
            View homeowner deal →
          </Link>
          {propertyId && (
            <Link
              href={`/admin/properties/${propertyId}`}
              className="underline text-muted-foreground hover:text-foreground"
            >
              View property review →
            </Link>
          )}
        </div>
      </div>

      {/* ── Deal workflow state ── */}
      <div className={`rounded-lg border overflow-hidden`}>
        <div className={`px-4 py-2 text-sm font-medium border-b flex items-center gap-2 flex-wrap ${
          dealReviewState.tone === "error" ? "bg-red-50" :
          dealReviewState.tone === "blocking" ? "bg-orange-50" :
          dealReviewState.tone === "success" ? "bg-green-50" :
          dealReviewState.tone === "warning" ? "bg-yellow-50" :
          "bg-muted/40"
        }`}>
          <span>Deal workflow state</span>
          <span className={`text-xs rounded-full px-2 py-0.5 font-normal ${TONE_BADGE[dealReviewState.tone]}`}>
            {dealReviewState.label}
          </span>
        </div>
        <div className="p-4 text-sm space-y-2">
          <p>{dealReviewState.explanation}</p>
          {dealReviewState.blocking_dependency && (
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground shrink-0 text-xs pt-0.5">Blocking:</span>
              <span className="text-xs">{dealReviewState.blocking_dependency}</span>
            </div>
          )}
          <div className="flex items-start gap-2">
            <span className="text-muted-foreground shrink-0 text-xs pt-0.5">Next step:</span>
            <span className="text-xs">{dealReviewState.next_step_hint}</span>
          </div>
        </div>
      </div>

      {/* Triage reason tags */}
      {deal.triage_reason_tags && deal.triage_reason_tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Triage tags:</span>
          {deal.triage_reason_tags.map((tag: string) => (
            <span
              key={tag}
              className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-muted text-muted-foreground font-mono"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* ── Linked property review summary ── */}
      <div className="rounded-lg border overflow-hidden">
        <div className="bg-muted/40 px-4 py-2 text-sm font-medium border-b flex items-center gap-2 flex-wrap">
          <span>Linked property review</span>
          {propReviewMeta ? (
            <span className={`text-xs rounded-full px-2 py-0.5 font-normal ${propReviewMeta.badgeCls}`}>
              {propReviewMeta.label}
            </span>
          ) : (
            <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-gray-100 text-gray-500">
              Not started
            </span>
          )}
          {propertyId && (
            <Link
              href={`/admin/properties/${propertyId}`}
              className="ml-auto text-xs underline text-muted-foreground hover:text-foreground font-normal"
            >
              View full property review →
            </Link>
          )}
        </div>

        {!property ? (
          <div className="p-4 text-sm text-muted-foreground">No linked property found.</div>
        ) : (
          <div className="p-4 text-sm space-y-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <div>
                <div className="text-muted-foreground text-xs">Address</div>
                <div className="font-medium">{addressDisplay ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Max available deal cash</div>
                <div className="font-medium">
                  {hasPropMaxCash
                    ? formatCurrency(property.max_accessible_cash_current)
                    : <span className="text-muted-foreground text-xs">Not yet set</span>}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Owner-stated FMV</div>
                <div className="font-medium">{formatCurrency(property.owner_stated_fmv)}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Verified FMV</div>
                <div className="font-medium">
                  {property.latest_verified_fmv
                    ? formatCurrency(property.latest_verified_fmv)
                    : <span className="text-muted-foreground text-xs">Not verified</span>}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Owner-declared debt</div>
                <div className="font-medium">
                  {property.has_secured_property_debt === null
                    ? "Not declared"
                    : property.has_secured_property_debt
                      ? formatCurrency(property.secured_property_debt_amount)
                      : "None"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Review completed</div>
                <div className="font-medium">{formatDateShort(property.property_review_completed_at)}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Review expires</div>
                <div className="font-medium">
                  {property.property_review_expires_at ? (
                    <>
                      {formatDateShort(property.property_review_expires_at)}
                      {new Date(property.property_review_expires_at) < new Date() && (
                        <span className="ml-1 text-xs text-red-600">(expired)</span>
                      )}
                      {new Date(property.property_review_expires_at) >= new Date() &&
                       property.property_review_status === "property_review_complete" && (
                        <span className="ml-1 text-xs text-green-700">
                          (reusable until {formatDateShort(property.property_review_expires_at)})
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground text-xs">Not set</span>
                  )}
                </div>
              </div>
            </div>

            {/* Open review request indicator */}
            {reviewRequest && (
              <div className={`rounded-md px-3 py-2 text-xs ${
                hasOpenReviewRequest
                  ? "bg-yellow-50 text-yellow-800 border border-yellow-200"
                  : "bg-muted/30 text-muted-foreground"
              }`}>
                {hasOpenReviewRequest ? (
                  <>
                    <span className="font-medium">Open information request</span>
                    {" — "}
                    {reviewRequest.status === "submitted"
                      ? "Homeowner has responded. Review their submission."
                      : "Awaiting homeowner response."}
                    {reviewRequest.admin_note && (
                      <div className="mt-1 text-muted-foreground">Note: {reviewRequest.admin_note}</div>
                    )}
                  </>
                ) : (
                  <>Last information request resolved {formatDateShort(reviewRequest.resolved_at)}</>
                )}
              </div>
            )}

            {/* AVM / LTV eligibility card */}
            <div className={`rounded-md border text-xs ${
              avmEligibility.result === "eligible"
                ? "border-green-200 bg-green-50"
                : avmEligibility.result === "blocked_pending_fmv"
                  ? "border-yellow-200 bg-yellow-50"
                  : avmEligibility.result === "manual_review_required"
                    ? "border-orange-200 bg-orange-50"
                    : "border-red-200 bg-red-50"
            }`}>
              <div className="flex items-center gap-2 px-3 py-2 border-b border-inherit">
                <span className="font-semibold">AVM / LTV eligibility</span>
                <span className={`rounded-full px-2 py-0.5 font-medium ${avmMeta.cls}`}>
                  {avmMeta.label}
                </span>
              </div>
              <div className="px-3 py-2.5 grid grid-cols-2 gap-x-6 gap-y-2">
                <div>
                  <div className="text-muted-foreground">Verified FMV</div>
                  <div className="font-medium">
                    {avmEligibility.verifiedFmv
                      ? formatCurrency(avmEligibility.verifiedFmv)
                      : <span className="text-muted-foreground">Not available</span>}
                    {avmEligibility.fmvProvider && (
                      <span className="ml-1 text-muted-foreground">({avmEligibility.fmvProvider})</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Proposed deal FMV</div>
                  <div className="font-medium">
                    {avmEligibility.proposedFmv != null
                      ? formatCurrency(avmEligibility.proposedFmv)
                      : <span className="text-muted-foreground">Not available</span>}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Deviation</div>
                  <div className="font-medium">
                    {avmEligibility.deviationPct != null
                      ? `${avmEligibility.deviationPct.toFixed(1)}%`
                      : "—"}
                    {avmEligibility.deviationPct !== null && avmEligibility.deviationPct >= DEVIATION_ESCALATION_THRESHOLD_PCT && (
                      <span className="ml-1 text-red-700">↑ escalation threshold</span>
                    )}
                    {avmEligibility.deviationPct !== null &&
                      avmEligibility.deviationPct >= DEVIATION_REVIEW_THRESHOLD_PCT &&
                      avmEligibility.deviationPct < DEVIATION_ESCALATION_THRESHOLD_PCT && (
                      <span className="ml-1 text-orange-700">↑ review threshold</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">LTV ratio</div>
                  <div className="font-medium">
                    {(avmEligibility.ltvRatio * 100).toFixed(0)}%
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Secured debt</div>
                  <div className="font-medium">{formatCurrency(avmEligibility.securedDebt)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Max eligible cash</div>
                  <div className="font-medium">
                    {avmEligibility.maxEligibleCash != null
                      ? formatCurrency(avmEligibility.maxEligibleCash)
                      : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Requested cash</div>
                  <div className="font-medium">
                    {avmEligibility.requestedCash != null
                      ? formatCurrency(avmEligibility.requestedCash)
                      : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">AVM fetched</div>
                  <div className="font-medium">
                    {avmEligibility.fmvFetchedAt
                      ? formatDateShort(avmEligibility.fmvFetchedAt)
                      : "—"}
                    {avmEligibility.isFmvExpired && (
                      <span className="ml-1 text-red-600">(expired)</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {property.property_review_note && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Latest property review note</div>
                <div className="rounded-md bg-muted/30 px-3 py-2 text-xs whitespace-pre-wrap">
                  {property.property_review_note}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Economics / policy comparison ── */}
      <div className="rounded-lg border overflow-hidden">
        <div className="bg-muted/40 px-4 py-2 text-sm font-medium border-b flex items-center gap-2 flex-wrap">
          <span>Economics / policy comparison</span>
          {economicsResult && (
            <span className={`text-xs rounded-full px-2 py-0.5 font-normal ${economicsResult.cls}`}>
              {economicsResult.label}
            </span>
          )}
        </div>
        <div className="p-4 text-sm space-y-4">
          {!latestProposal ? (
            <p className="text-muted-foreground text-sm">No submitted proposal found for this deal.</p>
          ) : (
            <>
              <div>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Proposed deal terms
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  <div>
                    <div className="text-muted-foreground text-xs">Proposed upfront</div>
                    <div className="font-medium">{formatCurrency(upfront)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Proposed monthly</div>
                    <div className="font-medium">{formatCurrency(monthly)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Number of payments</div>
                    <div className="font-medium">{months ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Proposal status</div>
                    <div className="font-medium capitalize">{latestProposal.status}</div>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Property review outputs
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  <div>
                    <div className="text-muted-foreground text-xs">FMV basis</div>
                    <div className="font-medium">
                      {formatCurrency(fmvBasis)}
                      {property?.latest_verified_fmv
                        ? <span className="ml-1 text-xs text-muted-foreground">(verified)</span>
                        : property?.owner_stated_fmv
                          ? <span className="ml-1 text-xs text-muted-foreground">(owner-stated)</span>
                          : null}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Secured debt basis</div>
                    <div className="font-medium">
                      {property?.has_secured_property_debt === null
                        ? "Not declared"
                        : property?.has_secured_property_debt
                          ? formatCurrency(debtBasis)
                          : "None"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">LTV policy cap</div>
                    <div className="font-medium">
                      {property?.ltv_policy_ratio != null
                        ? `${(property.ltv_policy_ratio * 100).toFixed(0)}%`
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Max available deal cash</div>
                    <div className="font-medium">
                      {hasPropMaxCash
                        ? formatCurrency(property.max_accessible_cash_current)
                        : <span className="text-muted-foreground text-xs">Not yet set</span>}
                    </div>
                  </div>
                </div>
              </div>

              {economicsResult && (
                <div className={`rounded-md px-3 py-2 text-sm ${
                  economicsResult.cls.includes("red")
                    ? "bg-red-50 border border-red-200"
                    : economicsResult.cls.includes("green")
                      ? "bg-green-50 border border-green-200"
                      : "bg-yellow-50 border border-yellow-200"
                }`}>
                  {economicsResult.detail}
                </div>
              )}

              <div className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Envelope comparison uses proposed upfront payment vs. max available deal cash. Full economics
                validation requires the canonical compute engine and may include monthly payment obligations.
                This comparison is directional, not final.
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Deal actions ── */}
      <div className="rounded-lg border overflow-hidden">
        <div className="bg-muted/40 px-4 py-2 text-sm font-medium border-b">
          Deal actions
        </div>
        <div className="p-4">
          <AdminDealActions
            dealId={dealId}
            currentTriageStatus={deal.triage_status ?? null}
            avmEligibilityResult={avmEligibility.result}
          />
        </div>
      </div>

      {/* ── Deal activity ── */}
      <div className="rounded-lg border overflow-hidden">
        <div className="bg-muted/40 px-4 py-2 text-sm font-medium border-b">
          Deal activity
        </div>
        {events.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">No deal events recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="p-3 text-xs text-muted-foreground">When</th>
                  <th className="p-3 text-xs text-muted-foreground">Event</th>
                  <th className="p-3 text-xs text-muted-foreground">Actor</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-t">
                    <td className="p-3 whitespace-nowrap text-xs">{formatDate(e.created_at)}</td>
                    <td className="p-3 text-xs">{adminEventLabel(e.event_type)}</td>
                    <td className="p-3">
                      <span className="font-mono text-xs text-muted-foreground break-all">
                        {e.created_by?.slice(0, 8)}…
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </main>
  );
}
