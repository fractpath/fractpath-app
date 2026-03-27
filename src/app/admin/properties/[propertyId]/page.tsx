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
import { AppHeader } from "@/components/layout/AppHeader";
import { computeLtvPolicy } from "@/lib/ltvPolicy";
import type { NormalizedPropertyProfile } from "@/lib/property-review/providers/rentcast";

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
      "id, owner_user_id, address_line1, address_line2, city, state, postal_code, status, created_at, updated_at, reviewed_at, reviewed_by, verified_at, verified_by, review_notes, has_secured_property_debt, secured_property_debt_amount, secured_debt_certified_at, secured_debt_last_verified_at, secured_debt_fresh_until, secured_debt_verification_status, latest_verified_fmv, fmv_verified_at, fmv_verification_source, ltv_policy_ratio, max_accessible_cash_current, ownership_type, occupancy_use, occupancy_use_other, major_condition_issue, major_condition_issue_details, known_liens_and_claims, total_known_debt_amount, total_known_debt_confidence, debt_statement_availability, title_claims_known, title_claims_details, owner_stated_fmv, owner_stated_fmv_confidence, owner_stated_fmv_source, owner_stated_fmv_source_other, willing_to_proceed_formal_review, property_review_status, property_review_status_updated_at, property_review_note, property_review_expires_at, property_review_completed_at",
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

  const [auditRes, docsRes, underwritingRes, linkedThreadRes, summaryRes, recentRunsRes] = await Promise.all([
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
      .select("deal_id")
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
      .select("artifact_type, status, error_message, requested_at, normalized_payload, is_current")
      .eq("property_id", propertyId)
      .order("requested_at", { ascending: false })
      .limit(10),
  ]);

  // Fetch triage metadata for the linked accepted deal (if any)
  let linkedDeal: {
    id: string;
    triage_status: string | null;
    triage_reason_tags: string[] | null;
    fmv_plausibility_flag: string | null;
    accepted_at: string | null;
  } | null = null;

  if (linkedThreadRes.data?.deal_id) {
    const { data: dealRow } = await (supabase.from("deals") as any)
      .select("id, triage_status, triage_reason_tags, fmv_plausibility_flag, accepted_at")
      .eq("id", linkedThreadRes.data.deal_id)
      .maybeSingle();
    linkedDeal = dealRow ?? null;
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
  const recentRuns = (recentRunsRes.data ?? []) as {
    artifact_type: string;
    status: string;
    error_message: string | null;
    requested_at: string;
    normalized_payload: unknown;
    is_current: boolean;
  }[];
  const latestProfileRun = recentRuns.find((r) => r.artifact_type === "property_profile") ?? null;
  const latestAvmRun = recentRuns.find((r) => r.artifact_type === "avm") ?? null;
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
    ready_for_deposit: { label: "Ready for deposit request", cls: "bg-green-100 text-green-800" },
    triage_in_progress: { label: "Triage in progress", cls: "bg-blue-100 text-blue-800" },
    more_info_needed: { label: "Additional information required", cls: "bg-yellow-100 text-yellow-800" },
    ineligible: { label: "Ineligible", cls: "bg-red-100 text-red-800" },
  };

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
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="font-medium">Verification status:</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-foreground">
            {String(p.status).replace(/_/g, " ")}
          </span>
          {reviewStatusMeta && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${reviewStatusMeta.badgeCls}`}>
              {reviewStatusMeta.label}
            </span>
          )}
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
                  {hasDebt === null
                    ? "Not declared"
                    : hasDebt
                      ? formatCurrency(p.secured_property_debt_amount)
                      : "None"}
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

      {/* ── Vendor review data ── */}
      <AdminVendorReviewPanel
        propertyId={propertyId}
        initialSummary={vendorSummary}
        lastProfileError={lastProfileError}
        lastAvmError={lastAvmError}
        initialProfileDetails={persistedProfileDetails}
      />

      {/* ── Linked deal (secondary) ── */}
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
              href={`/deal/${linkedDeal.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-xs underline text-muted-foreground hover:text-foreground font-normal"
            >
              View deal →
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
                  <div className="text-muted-foreground text-xs">Triage status</div>
                  <div className="font-medium">
                    {linkedDeal.triage_status
                      ? (TRIAGE_BADGE[linkedDeal.triage_status]?.label ?? linkedDeal.triage_status.replace(/_/g, " "))
                      : <span className="text-muted-foreground">Accepted – pending review</span>}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Accepted</div>
                  <div className="font-medium">{formatDate(linkedDeal.accepted_at)}</div>
                </div>
              </div>
              {linkedDeal.triage_reason_tags && linkedDeal.triage_reason_tags.length > 0 && (
                <div>
                  <div className="text-muted-foreground text-xs mb-1.5">Reason tags</div>
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
                  href={`/deal/${linkedDeal.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs underline text-muted-foreground hover:text-foreground"
                >
                  View deal →
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
