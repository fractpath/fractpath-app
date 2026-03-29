import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";
import { getDealEvents } from "@/lib/dealTimeline";
import { AdminDealActions } from "@/components/admin/AdminDealActions";
import { AdminDealServicingPanel } from "@/components/admin/AdminDealServicingPanel";
import { SignatureCard } from "@/components/deal/SignatureCard";
import type { SignaturePacketView, SignatureRecipientView } from "@/components/deal/SignatureCard";
import { getArtifactSignedUrls } from "@/lib/signature/artifacts";
import {
  resolveCanonicalLifecycle,
  type WorkflowStateInput,
} from "@/lib/workflow/milestones";
import {
  DEFAULT_LTV_RATIO,
  DEVIATION_ESCALATION_THRESHOLD_PCT,
  DEVIATION_REVIEW_THRESHOLD_PCT,
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

// ─── Deal review state derivation ────────────────────────────────────────────
// LEGACY: intentionally bypassed in favour of the canonical lifecycle section.
// Preserved here only for reference; nothing in the JSX calls this function.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _legacyDeriveAdminDealReviewState_UNUSED(args: {
  triage_status: string | null;
  has_open_review_request: boolean;
  property_review_status: string | null;
  has_max_cash: boolean;
}): { label: string; tone: string; explanation: string; blocking_dependency: string | null; next_step_hint: string } {
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

  // "ready_for_signatures" is the canonical terminal-success state.
  // "ready_for_deposit" is kept for backward compatibility with legacy rows.
  if (triage_status === "ready_for_signatures" || triage_status === "ready_for_deposit") {
    return {
      label: "Ready for signatures",
      tone: "success",
      explanation:
        "Property valuation and deal terms are both eligible. The deal is ready for the DocuSign signature stage.",
      blocking_dependency: null,
      next_step_hint:
        "Initiate the DocuSign envelope. Signatures from all parties are required before the deal closes.",
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
            ? "Review economics comparison below. Advance deal to 'Ready for signatures' or 'Ineligible'."
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
    case "DEAL_TRIAGE_READY_FOR_DEPOSIT": return "Marked ready for signatures";
    case "DEAL_TRIAGE_READY_FOR_SIGNATURES": return "Marked ready for signatures";
    case "DEAL_TRIAGE_MORE_INFO_NEEDED": return "Flagged: additional information needed";
    case "DEAL_TRIAGE_INELIGIBLE": return "Marked ineligible";
    case "DEAL_REVIEW_REQUEST_CREATED": return "Additional information request opened";
    case "DEAL_REVIEW_REQUEST_RESOLVED": return "Additional information request resolved";
    case "DEAL_TRIAGE_RETURNED_TO_REVIEW": return "Returned to triage in progress";
    case "DEAL_HEADER_UPDATED": return "Deal header updated";
    case "DEAL_WORKFLOW_STAGE_CHANGED": return "Workflow stage transition";
    case "DEAL_WORKFLOW_NOTIFICATION_SENT": return "Customer notification sent";
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

// ─── Signature data loader ───────────────────────────────────────────────────

type AdminSigData = {
  packet: SignaturePacketView | null;
  recipients: SignatureRecipientView[];
  execAgreementUrl: string | null;
  certificateUrl: string | null;
};

async function loadAdminSigData(
  svc: ReturnType<typeof createServiceClient>,
  dealId: string,
): Promise<AdminSigData> {
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

    if (!packet) return { packet: null, recipients: [], execAgreementUrl: null, certificateUrl: null };

    const { data: recipRows } = await (svc.from("deal_signature_recipients") as any)
      .select("role, display_name, email, provider_status, signed_at")
      .eq("packet_id", packet.id)
      .order("routing_order", { ascending: true });

    const recipients: SignatureRecipientView[] = (recipRows ?? []).map((r: any) => ({
      role: r.role,
      display_name: r.display_name ?? null,
      email: r.email ?? null,
      provider_status: r.provider_status ?? null,
      signed_at: r.signed_at ?? null,
    }));

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
    return { packet: null, recipients: [], execAgreementUrl: null, certificateUrl: null };
  }
}

// ─── Signer-readiness preflight ──────────────────────────────────────────────

type SignerReadiness = {
  label: string;
  userId: string | null;
  email: string | null;
  displayName: string | null;
  isReady: boolean;
  blockerReason: string | null;
};

type SignersPreflightResult = {
  hasAcceptedThread: boolean;
  buyer: SignerReadiness | null;
  owner: SignerReadiness | null;
  allReady: boolean;
};

const PREFLIGHT_SKIP: SignersPreflightResult = {
  hasAcceptedThread: false,
  buyer: null,
  owner: null,
  allReady: false,
};

async function resolveSignerReadiness(
  svc: ReturnType<typeof createServiceClient>,
  label: string,
  userId: string,
): Promise<SignerReadiness> {
  let email: string | null = null;
  let displayName: string | null = null;

  try {
    const { data: authUser } = await (svc as any).auth.admin.getUserById(userId);
    if (authUser?.user?.email) {
      email = authUser.user.email.trim().toLowerCase();
    }
  } catch {
    return {
      label, userId, email: null, displayName: null, isReady: false,
      blockerReason: `${label}: auth account could not be accessed.`,
    };
  }

  if (!email) {
    return {
      label, userId, email: null, displayName: null, isReady: false,
      blockerReason: `${label} has no verified email address on their account. They must verify their email before signatures can be initiated.`,
    };
  }

  try {
    const { data: profile } = await (svc.from("profiles") as any)
      .select("first_name, last_name, nickname")
      .eq("id", userId)
      .maybeSingle();

    if (profile) {
      const fullName = [profile.first_name, profile.last_name]
        .filter((s: unknown) => typeof s === "string" && (s as string).trim())
        .join(" ")
        .trim();
      displayName = fullName || (profile.nickname as string | null) || email;
    } else {
      displayName = email;
    }
  } catch {
    displayName = email;
  }

  if (!displayName) {
    return {
      label, userId, email, displayName: null, isReady: false,
      blockerReason: `${label} has no display name set. Add a first name, last name, or nickname to their profile.`,
    };
  }

  return { label, userId, email, displayName, isReady: true, blockerReason: null };
}

async function preflightSignerReadiness(
  svc: ReturnType<typeof createServiceClient>,
  buyerUserId: string | null,
  ownerUserId: string | null,
  hasAcceptedThread: boolean,
): Promise<SignersPreflightResult> {
  if (!hasAcceptedThread) {
    return {
      hasAcceptedThread: false,
      buyer: null,
      owner: null,
      allReady: false,
    };
  }

  const [buyer, owner] = await Promise.all([
    buyerUserId
      ? resolveSignerReadiness(svc, "Buyer", buyerUserId)
      : Promise.resolve<SignerReadiness>({
          label: "Buyer", userId: null, email: null, displayName: null, isReady: false,
          blockerReason: "Buyer user ID is not set on this deal thread.",
        }),
    ownerUserId
      ? resolveSignerReadiness(svc, "Owner", ownerUserId)
      : Promise.resolve<SignerReadiness>({
          label: "Owner", userId: null, email: null, displayName: null, isReady: false,
          blockerReason: "Owner user ID is not set on this deal thread. The homeowner must create an account and be linked to this deal before signatures can be initiated.",
        }),
  ]);

  return {
    hasAcceptedThread: true,
    buyer,
    owner,
    allReady: !!buyer?.isReady && !!owner?.isReady,
  };
}

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
    .select("id, status, triage_status, triage_reason_tags, fmv_plausibility_flag, accepted_at, created_at, servicing_status, servicing_note")
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
      "id, buyer_user_id, owner_user_id, property_id, status, created_at, properties(id, status, address_line1, address_line2, city, state, postal_code, property_review_status, property_review_status_updated_at, property_review_note, property_review_expires_at, property_review_completed_at, has_secured_property_debt, secured_property_debt_amount, latest_verified_fmv, fmv_verified_at, owner_stated_fmv, owner_stated_fmv_confidence, owner_stated_fmv_source, max_accessible_cash_current, ltv_policy_ratio, escalation_deposit_status, escalation_avm_status, closing_review_status)",
    )
    .eq("deal_id", dealId)
    .maybeSingle();

  const property: any = (thread as any)?.properties ?? null;
  const propertyId: string | null = (thread as any)?.property_id ?? null;

  const addressDisplay = property
    ? [property.address_line1, property.city, property.state].filter(Boolean).join(", ")
    : null;

  // ── Early derived values (needed before parallel block) ──────────────────
  // "ready_for_deposit" is the persisted DB value for the signature-ready state.
  // (The CHECK constraint predates the rename to "ready_for_signatures".)
  const isSignatureReady = deal.triage_status === "ready_for_deposit";

  // Thread status passed to SignatureCard so it can derive its internal CardState.
  const effectiveThreadStatus: string | null = (thread as any)?.status ?? null;

  // Only run the signer preflight when the deal is signature-ready and the thread
  // is in the accepted state — avoids two unnecessary auth.admin API calls otherwise.
  const threadIsAccepted = effectiveThreadStatus === "accepted";

  // ── Parallel fetches ─────────────────────────────────────────────────────
  const [eventsResult, reviewRequestRes, proposalRes, reviewSummaryRes, sigData, signersPreflight] = await Promise.all([
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

    // Signature packet + recipients (always fetch — cheap; drives the signature section)
    loadAdminSigData(svc, dealId),

    // Signer-readiness preflight — only when signature-ready and thread is accepted
    isSignatureReady && threadIsAccepted
      ? preflightSignerReadiness(
          svc,
          (thread as any)?.buyer_user_id ?? null,
          (thread as any)?.owner_user_id ?? null,
          true,
        )
      : Promise.resolve<SignersPreflightResult>(PREFLIGHT_SKIP),
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

  // LEGACY: dealReviewState removed — "Deal workflow state" section replaced by the
  // canonical "Overall process" section above which derives from resolveCanonicalLifecycle.

  // ── Economics extraction ─────────────────────────────────────────────────
  const proposedTerms = latestProposal
    ? extractDealTerms(latestProposal.terms_snapshot)
    : null;

  const upfront = proposedTerms?.upfront_payment ?? null;
  const monthly = proposedTerms?.monthly_payment ?? null;
  const months = proposedTerms?.number_of_payments ?? null;
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

  // ── Valuation gate (property-owned) ──────────────────────────────────────
  // Valuation is sufficient when we have a live, non-expired verified FMV and
  // the proposed-value deviation is not above the escalation threshold.
  // blocked_pending_fmv  → no/expired AVM           → property review must run AVM
  // escalated_review_required → deviation too high  → property review must escalate
  // manual_review_required    → deviation moderate  → FMV is usable, admin acknowledgment required
  // ineligible_ltv            → deal-term failure   → deal cash exceeds max eligible
  const isValuationSufficient =
    avmEligibility.result !== "blocked_pending_fmv" &&
    avmEligibility.result !== "escalated_review_required";

  // ── Triage badge ─────────────────────────────────────────────────────────
  const TRIAGE_BADGE: Record<string, { label: string; cls: string }> = {
    ready_for_signatures: { label: "Ready for signatures", cls: "bg-green-100 text-green-800" },
    // "ready_for_deposit" is the pre-refactor canonical value; treat same as ready_for_signatures.
    ready_for_deposit: { label: "Ready for signatures", cls: "bg-green-100 text-green-800" },
    triage_in_progress: { label: "Triage in progress", cls: "bg-blue-100 text-blue-800" },
    more_info_needed: { label: "Additional information required", cls: "bg-yellow-100 text-yellow-800" },
    ineligible: { label: "Ineligible", cls: "bg-red-100 text-red-800" },
  };

  const triageBadge = deal.triage_status ? (TRIAGE_BADGE[deal.triage_status] ?? null) : null;

  const dealCanonicalInput: WorkflowStateInput = {
    propertyStatus: (property?.status as string | null) ?? null,
    propertyReviewStatus: propReviewStatus,
    escalationDepositStatus: (property?.escalation_deposit_status as string | null) ?? null,
    escalationAvmStatus: (property?.escalation_avm_status as string | null) ?? null,
    closingReviewStatus: (property?.closing_review_status as string | null) ?? null,
    avmEligibilityResult: avmEligibility.result,
    triageStatus: deal.triage_status ?? null,
    threadStatus: effectiveThreadStatus,
    packetStatus: sigData.packet?.status ?? null,
    servicingStatus: (deal.servicing_status as string | null) ?? null,
  };
  const dealCanonical = resolveCanonicalLifecycle(dealCanonicalInput);

  const OWNING_SURFACE_LABEL: Record<string, string> = {
    property_review: "Property review page",
    deal_review: "Deal review page",
    external_partner: "External partner",
  };

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
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                {dealCanonical.meta.adminLabel}
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

      {/* ── Overall process ── */}
      <div className="rounded-lg border overflow-hidden">
        <div className="px-4 py-2 text-sm font-semibold border-b bg-muted/40 flex items-center gap-2 flex-wrap">
          <span>Overall process</span>
          <span className="text-xs font-normal rounded-full px-2 py-0.5 bg-blue-100 text-blue-800">
            Stage {dealCanonical.meta.stageNumber} — {dealCanonical.meta.adminLabel}
          </span>
        </div>
        <div className="px-4 py-3 space-y-2 text-sm">
          {dealCanonical.adminBlocker && (
            <div className="flex gap-2">
              <span className="text-muted-foreground min-w-[120px]">Blocker:</span>
              <span className="text-orange-700 dark:text-orange-400 font-medium">{dealCanonical.adminBlocker}</span>
            </div>
          )}
          <div className="flex gap-2">
            <span className="text-muted-foreground min-w-[120px]">Next action:</span>
            <span>{dealCanonical.adminNextAction ?? "No action required"}</span>
          </div>
          {dealCanonical.adminOwningSurface && (
            <div className="flex gap-2">
              <span className="text-muted-foreground min-w-[120px]">Owns this stage:</span>
              <span className="text-xs rounded-full px-2 py-0.5 bg-muted font-medium">
                {OWNING_SURFACE_LABEL[dealCanonical.adminOwningSurface] ?? dealCanonical.adminOwningSurface}
              </span>
            </div>
          )}
          <div className="flex gap-2">
            <span className="text-muted-foreground min-w-[120px]">Owner sees:</span>
            <span className="italic">
              {dealCanonical.customerHeroLabel
                ? `"${dealCanonical.customerHeroLabel}"`
                : "No milestone — accepted/pending review banner"}
            </span>
          </div>
        </div>
      </div>

      {/* LEGACY: "Deal workflow state" section removed — replaced by the canonical
          "Overall process" section which derives from resolveCanonicalLifecycle and
          avoids stale "economics comparison" / AMV-placeholder copy. */}

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
              <div className={`rounded-md px-3 py-2 text-xs space-y-1.5 ${
                hasOpenReviewRequest
                  ? "bg-yellow-50 text-yellow-800 border border-yellow-200"
                  : "bg-muted/30 text-muted-foreground"
              }`}>
                {hasOpenReviewRequest ? (
                  <>
                    <div>
                      <span className="font-medium">Open information request</span>
                      {" — "}
                      {reviewRequest.status === "submitted"
                        ? "Homeowner has responded."
                        : "Awaiting homeowner response."}
                    </div>
                    {reviewRequest.admin_note && (
                      <div className="text-muted-foreground">Admin note: {reviewRequest.admin_note}</div>
                    )}
                    {reviewRequest.homeowner_note && reviewRequest.status === "submitted" && (
                      <div className="rounded bg-white border border-yellow-100 px-2 py-1.5">
                        <span className="font-medium text-yellow-900">Homeowner note: </span>
                        <span className="whitespace-pre-wrap">{reviewRequest.homeowner_note}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <>Last information request resolved {formatDateShort(reviewRequest.resolved_at)}</>
                )}
              </div>
            )}

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

      {/* ── Property valuation ── */}
      {/* Answers: does this property have a usable verified AVM? (property-review-owned) */}
      <div className="rounded-lg border overflow-hidden">
        <div className="bg-muted/40 px-4 py-2 text-sm font-medium border-b flex items-center gap-2 flex-wrap">
          <span>Property valuation</span>
          {avmEligibility.result === "blocked_pending_fmv" ? (
            <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-yellow-100 text-yellow-800">
              {avmEligibility.isFmvExpired ? "AVM expired" : "AVM pending"}
            </span>
          ) : avmEligibility.result === "escalated_review_required" ? (
            <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-red-100 text-red-800">
              Escalated review required
            </span>
          ) : avmEligibility.result === "manual_review_required" ? (
            <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-orange-100 text-orange-800">
              Deviation — acknowledgment required
            </span>
          ) : (
            <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-green-100 text-green-800">
              Valuation sufficient
            </span>
          )}
          {propertyId && (
            <Link
              href={`/admin/properties/${propertyId}`}
              className="ml-auto text-xs underline text-muted-foreground hover:text-foreground font-normal"
            >
              Property review →
            </Link>
          )}
        </div>

        <div className="p-4 text-sm space-y-3">
          {/* Blocking messages (property-review-owned: admin directed there to resolve) */}
          {avmEligibility.result === "blocked_pending_fmv" && (
            <div className="rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2.5 text-xs text-yellow-800 space-y-1.5">
              <div className="font-semibold">
                {avmEligibility.isFmvExpired
                  ? "Verified AVM has expired"
                  : "No verified AVM on file"}
              </div>
              <div>
                {avmEligibility.isFmvExpired
                  ? "The AVM on file has expired. A fresh AVM run is required before deal-term eligibility can be assessed."
                  : "No verified AVM is on file for this property. Run the AVM on the property review page to unlock deal-term eligibility."}
              </div>
              {propertyId && (
                <Link
                  href={`/admin/properties/${propertyId}`}
                  className="inline-flex items-center gap-1 underline font-medium text-yellow-700 hover:text-yellow-900"
                >
                  Go to property review to run AVM →
                </Link>
              )}
            </div>
          )}

          {avmEligibility.result === "escalated_review_required" && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-800 space-y-1.5">
              <div className="font-semibold">AVM deviation requires escalated review</div>
              <div>
                The proposed property value deviates from the verified AVM by{" "}
                <span className="font-medium">{avmEligibility.deviationPct?.toFixed(1)}%</span>{" "}
                — above the {DEVIATION_ESCALATION_THRESHOLD_PCT}% escalation threshold. Deal-term
                eligibility cannot be assessed until the property valuation dispute is resolved via
                escalated review.
              </div>
              {propertyId && (
                <Link
                  href={`/admin/properties/${propertyId}`}
                  className="inline-flex items-center gap-1 underline font-medium text-red-700 hover:text-red-900"
                >
                  Go to property review to resolve →
                </Link>
              )}
            </div>
          )}

          {avmEligibility.result === "manual_review_required" && (
            <div className="rounded-md bg-orange-50 border border-orange-200 px-3 py-2.5 text-xs text-orange-800 space-y-1">
              <div className="font-semibold">AVM deviation — admin acknowledgment required</div>
              <div>
                The proposed property value deviates from the verified AVM by{" "}
                <span className="font-medium">{avmEligibility.deviationPct?.toFixed(1)}%</span>{" "}
                (review threshold: {DEVIATION_REVIEW_THRESHOLD_PCT}%). Deal-term eligibility can be
                computed, but advancing to ready-for-deposit requires entering an admin note in the
                Deal actions panel below.
              </div>
            </div>
          )}

          {/* AVM data — shown whenever a verified FMV is present */}
          {avmEligibility.verifiedFmv != null && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
              <div>
                <div className="text-muted-foreground">Verified FMV</div>
                <div className="font-medium">
                  {formatCurrency(avmEligibility.verifiedFmv)}
                  {avmEligibility.fmvProvider && (
                    <span className="ml-1 text-muted-foreground">({avmEligibility.fmvProvider})</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">AVM fetched</div>
                <div className="font-medium">
                  {avmEligibility.fmvFetchedAt ? formatDateShort(avmEligibility.fmvFetchedAt) : "—"}
                  {avmEligibility.isFmvExpired && (
                    <span className="ml-1 text-red-600">(expired)</span>
                  )}
                </div>
              </div>
              {avmEligibility.proposedFmv != null && (
                <div>
                  <div className="text-muted-foreground">Proposed deal FMV</div>
                  <div className="font-medium">{formatCurrency(avmEligibility.proposedFmv)}</div>
                </div>
              )}
              {avmEligibility.deviationPct != null && (
                <div>
                  <div className="text-muted-foreground">FMV deviation</div>
                  <div className={`font-medium ${
                    avmEligibility.deviationPct >= DEVIATION_ESCALATION_THRESHOLD_PCT
                      ? "text-red-700"
                      : avmEligibility.deviationPct >= DEVIATION_REVIEW_THRESHOLD_PCT
                        ? "text-orange-700"
                        : ""
                  }`}>
                    {avmEligibility.deviationPct.toFixed(1)}%
                    {avmEligibility.deviationPct >= DEVIATION_ESCALATION_THRESHOLD_PCT && (
                      <span className="ml-1">↑ escalation threshold</span>
                    )}
                    {avmEligibility.deviationPct >= DEVIATION_REVIEW_THRESHOLD_PCT &&
                      avmEligibility.deviationPct < DEVIATION_ESCALATION_THRESHOLD_PCT && (
                      <span className="ml-1">↑ review threshold</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Deal-term eligibility ── */}
      {/* Answers: do the proposed deal terms fit within the verified property envelope? (deal-owned) */}
      <div className="rounded-lg border overflow-hidden">
        <div className="bg-muted/40 px-4 py-2 text-sm font-medium border-b flex items-center gap-2 flex-wrap">
          <span>Deal-term eligibility</span>
          {!isValuationSufficient ? (
            <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-gray-100 text-gray-500">
              Awaiting valuation
            </span>
          ) : !latestProposal ? (
            <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-gray-100 text-gray-500">
              No proposal
            </span>
          ) : avmEligibility.result === "ineligible_ltv" ? (
            <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-red-100 text-red-800">
              Terms ineligible — LTV exceeded
            </span>
          ) : (
            <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-green-100 text-green-800">
              Terms eligible
            </span>
          )}
        </div>

        <div className="p-4 text-sm space-y-4">
          {!isValuationSufficient ? (
            <p className="text-xs text-muted-foreground">
              Deal-term eligibility cannot be assessed until property valuation is complete.{" "}
              {avmEligibility.result === "escalated_review_required"
                ? "Resolve the AVM deviation via escalated review on the property review page."
                : "Run the AVM on the property review page."}
            </p>
          ) : !latestProposal ? (
            <p className="text-sm text-muted-foreground">No submitted proposal found for this deal.</p>
          ) : (
            <>
              {avmEligibility.result === "ineligible_ltv" && (
                <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-800 space-y-1">
                  <div className="font-semibold">Proposed cash exceeds maximum eligible amount</div>
                  <div>
                    The proposed upfront payment ({formatCurrency(avmEligibility.requestedCash)}) exceeds
                    the maximum eligible cash ({formatCurrency(avmEligibility.maxEligibleCash)}) under the
                    LTV policy. Deal terms must be revised before this deal can proceed.
                  </div>
                </div>
              )}

              <div>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Proposed terms
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                  <div>
                    <div className="text-muted-foreground">Proposed upfront</div>
                    <div className={`font-medium ${avmEligibility.result === "ineligible_ltv" ? "text-red-700" : ""}`}>
                      {formatCurrency(upfront)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Proposed monthly</div>
                    <div className="font-medium">{formatCurrency(monthly)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Number of payments</div>
                    <div className="font-medium">{months ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Proposal status</div>
                    <div className="font-medium capitalize">{latestProposal.status}</div>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Eligibility from verified FMV
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                  <div>
                    <div className="text-muted-foreground">Verified FMV</div>
                    <div className="font-medium">{formatCurrency(avmEligibility.verifiedFmv)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">LTV policy cap</div>
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
                    <div className={`font-medium ${avmEligibility.result === "ineligible_ltv" ? "text-red-700" : "text-green-800"}`}>
                      {avmEligibility.maxEligibleCash != null
                        ? formatCurrency(avmEligibility.maxEligibleCash)
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Requested cash</div>
                    <div className={`font-medium ${avmEligibility.result === "ineligible_ltv" ? "text-red-700 font-semibold" : ""}`}>
                      {avmEligibility.requestedCash != null
                        ? formatCurrency(avmEligibility.requestedCash)
                        : "—"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Max eligible cash = (Verified FMV × LTV cap) − Secured debt. This comparison is
                directional; full economics validation uses the canonical compute engine.
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Signature ── */}
      {/* Shown when the deal is in the signature-ready state (triage = ready_for_deposit).
          Pre-flight section runs before any packet is created to surface signer identity blockers.
          Once a packet exists the preflight is hidden — the send already succeeded. */}
      {isSignatureReady && (
        <div className="rounded-lg border overflow-hidden">
          <div className="bg-muted/40 px-4 py-2 text-sm font-medium border-b flex items-center gap-2">
            <span>Signature &amp; Documents</span>
            {sigData.packet ? (
              <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-blue-100 text-blue-800 capitalize">
                {sigData.packet.status.replace(/_/g, " ")}
              </span>
            ) : signersPreflight.allReady ? (
              <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-green-100 text-green-800">
                Signers ready
              </span>
            ) : (
              <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-red-100 text-red-700">
                Prerequisites missing
              </span>
            )}
          </div>

          {/* Signer-readiness preflight — only shown before packet is created */}
          {!sigData.packet && (
            <div className="border-b px-4 py-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Signer readiness
              </p>

              {/* No accepted thread edge-case */}
              {!signersPreflight.hasAcceptedThread && (
                <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                  No accepted thread found for this deal. The buyer must submit an offer and the
                  owner must accept it before signatures can be prepared.
                </div>
              )}

              {/* Per-signer rows */}
              {signersPreflight.hasAcceptedThread && (
                <div className="space-y-1.5">
                  {[signersPreflight.buyer, signersPreflight.owner].map((sr) => {
                    if (!sr) return null;
                    return (
                      <div
                        key={sr.label}
                        className={`flex items-start gap-2 rounded-md px-3 py-2 text-sm ${
                          sr.isReady
                            ? "bg-green-50 border border-green-200 text-green-900"
                            : "bg-red-50 border border-red-200 text-red-900"
                        }`}
                      >
                        <span className="mt-0.5 shrink-0 text-base leading-none">
                          {sr.isReady ? "✓" : "✗"}
                        </span>
                        <div className="min-w-0">
                          <span className="font-medium">{sr.label}</span>
                          {sr.isReady ? (
                            <span className="ml-1.5 text-green-700">
                              {sr.displayName}
                              <span className="ml-1 font-normal text-green-600 opacity-70">
                                &lt;{sr.email}&gt;
                              </span>
                            </span>
                          ) : (
                            <span className="ml-1.5 text-red-700">{sr.blockerReason}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Aggregate blocker callout */}
              {signersPreflight.hasAcceptedThread && !signersPreflight.allReady && (
                <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
                  Resolve the issues above before preparing the agreement. The prepare action
                  is disabled until all signer prerequisites are satisfied.
                </div>
              )}
            </div>
          )}

          <div className="p-4">
            {/* SignatureCard — shown when packet exists, OR when all signers are ready (no packet yet).
                Hidden when prerequisites are missing so the "Prepare agreement" button is not reachable. */}
            {(sigData.packet || signersPreflight.allReady) ? (
              <SignatureCard
                dealId={dealId}
                threadStatus={effectiveThreadStatus}
                packet={sigData.packet}
                recipients={sigData.recipients}
                isAdmin={true}
                execAgreementUrl={sigData.execAgreementUrl}
                certificateUrl={sigData.certificateUrl}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Prepare is unavailable until signer prerequisites are resolved.
              </p>
            )}
          </div>
        </div>
      )}

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
            hasOpenReviewRequest={hasOpenReviewRequest}
          />
        </div>
      </div>

      {/* ── Deal close + servicing ── */}
      {/*
        Post-signature workflow for deal close and servicing tracking.
        Owns deal stages 14 (closed), 15 (servicing active), 16 (servicing issue).
        Property artifacts (title docs, review notes) remain on the property page.
        Deal artifacts (signed docs, servicing notes) remain here.

        TODO(servicing-partner): Replace simulation with real servicing partner status ingestion.
      */}
      <div className="rounded-lg border overflow-hidden">
        <div className="bg-muted/40 px-4 py-2 text-sm font-medium border-b flex items-center gap-2">
          <span>Deal close &amp; servicing</span>
          {deal.servicing_status === "active" ? (
            <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-emerald-100 text-emerald-800">
              Servicing active
            </span>
          ) : deal.servicing_status === "issue" ? (
            <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-red-100 text-red-800">
              Servicing issue
            </span>
          ) : effectiveThreadStatus === "closed" ? (
            <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-gray-800 text-white">
              Closed
            </span>
          ) : (
            <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-gray-100 text-gray-500">
              Not closed
            </span>
          )}
          <span className="ml-auto text-xs text-muted-foreground font-normal italic">
            [SIMULATION]
          </span>
        </div>
        <div className="p-4">
          <AdminDealServicingPanel
            dealId={dealId}
            threadStatus={effectiveThreadStatus}
            packetStatus={sigData.packet?.status ?? null}
            servicingStatus={(deal.servicing_status as "active" | "issue" | null) ?? null}
            servicingNote={(deal.servicing_note as string | null) ?? null}
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
