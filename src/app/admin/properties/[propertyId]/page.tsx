import crypto from "crypto";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";
import { AdminPropertyActions } from "@/components/admin/AdminPropertyActions";
import {
  PropertyDocumentsPreview,
  type DocType,
  type DocRow,
} from "@/components/admin/PropertyDocumentsPreview";
import { AdminPropertyStatusControls } from "@/components/admin/AdminPropertyStatusControls";
import {
  AdminReviewRequestPanel,
  type AdminReviewRequest,
} from "@/components/admin/AdminReviewRequestPanel";
import { AppHeader } from "@/components/layout/AppHeader";
import { computeLtvPolicy } from "@/lib/ltvPolicy";

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
  docType: DocType;
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

export default async function AdminPropertyAuditPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;

  const admin = await requireAdmin();

  if (!admin.ok) {
    // If user is logged in but not an admin, do NOT send them to login.
    // Only redirect to login when explicitly unauthorized (not authenticated).
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
      "id, owner_user_id, address_line1, address_line2, city, state, postal_code, status, created_at, updated_at, reviewed_at, reviewed_by, verified_at, verified_by, review_notes, has_secured_property_debt, secured_property_debt_amount, secured_debt_certified_at, secured_debt_last_verified_at, secured_debt_fresh_until, secured_debt_verification_status, latest_verified_fmv, fmv_verified_at, fmv_verification_source, ltv_policy_ratio, max_accessible_cash_current, ownership_type, occupancy_use, occupancy_use_other, major_condition_issue, major_condition_issue_details, known_liens_and_claims, total_known_debt_amount, total_known_debt_confidence, debt_statement_availability, title_claims_known, title_claims_details, owner_stated_fmv, owner_stated_fmv_confidence, owner_stated_fmv_source, owner_stated_fmv_source_other, willing_to_proceed_formal_review",
    )
    .eq("id", propertyId)
    .maybeSingle();

  if (propRes.error || !propRes.data) {
    return (
      <main className="mx-auto max-w-4xl p-6 space-y-4">
        <a className="text-sm underline" href="/admin/properties?status=queue">
          &larr; Back to queue
        </a>
        <h1 className="text-2xl font-semibold">Audit</h1>
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

  const [auditRes, docsRes, underwritingRes, linkedThreadRes] = await Promise.all([
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

  // Fetch current open/submitted review request for linked deal
  let currentReviewRequest: AdminReviewRequest | null = null;
  if (linkedDeal?.id) {
    const { data: reqRow } = await (supabase.from("deal_review_requests") as any)
      .select(
        "id, deal_id, property_id, status, requested_items, admin_note, homeowner_note, resolved_note, submitted_at, resolved_at, created_at",
      )
      .eq("deal_id", linkedDeal.id)
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (reqRow) {
      currentReviewRequest = reqRow as AdminReviewRequest;
    }
  }

  const auditRows = (auditRes.data ?? []) as any[];
  const underwritingRows = (underwritingRes.data ?? []) as any[];

  // Mint short-lived per-doc tokens (10 minutes)
  const docs = ((docsRes.data ?? []) as any[]).map((d) => {
    const docType = d.doc_type as DocType;
    const storagePath = String(d.storage_path);

    return {
      doc_type: docType,
      content_type: d.content_type ?? null,
      preview_token: mintPreviewToken({
        propertyId,
        docType,
        storagePath,
        expSecondsFromNow: 10 * 60,
      }),
    };
  });

  // Derived debt metrics
  const hasDebt = p.has_secured_property_debt;
  const debtStatus = p.secured_debt_verification_status ?? null;
  const computedLtv =
    p.latest_verified_fmv && p.secured_property_debt_amount
      ? ((p.secured_property_debt_amount / p.latest_verified_fmv) * 100).toFixed(1)
      : null;

  // Compute LTV policy limits from property underwriting data (property-level, no deal context)
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

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-6">
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

      <div>
        <h1 className="text-2xl font-semibold">Property review</h1>
        <p className="text-sm text-muted-foreground">
          {addressDisplay || p.id}
        </p>
      </div>

      {/* Property overview */}
      <div className="rounded-lg border p-4 text-sm space-y-1">
        <div>
          <span className="text-muted-foreground">Status:</span>{" "}
          <span className="font-medium">
            {String(p.status).replace("_", " ")}
          </span>
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
          <span className="text-muted-foreground">Reviewed:</span>{" "}
          {formatDate(p.reviewed_at)}
        </div>
        <div>
          <span className="text-muted-foreground">Verified:</span>{" "}
          {formatDate(p.verified_at)}
        </div>
        {p.review_notes && (
          <div className="pt-2">
            <span className="text-muted-foreground">Notes:</span>{" "}
            {p.review_notes}
          </div>
        )}
      </div>

      {/* Secured debt underwriting panel */}
      <div className="rounded-lg border overflow-hidden">
        <div className="bg-muted/40 px-4 py-2 text-sm font-medium border-b">
          Secured debt underwriting
          {debtStatus && (
            <span
              className={`ml-2 inline-block text-xs rounded-full px-2 py-0.5 font-normal ${
                debtStatus === "verified"
                  ? "bg-green-100 text-green-800"
                  : debtStatus === "stale"
                    ? "bg-yellow-100 text-yellow-800"
                    : debtStatus === "pending"
                      ? "bg-blue-100 text-blue-800"
                      : "bg-gray-100 text-gray-600"
              }`}
            >
              {debtStatus.replace("_", " ")}
            </span>
          )}
        </div>
        <div className="p-4 text-sm space-y-3">
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
          </div>

          <div className="border-t pt-3">
            <div className="text-xs font-medium text-muted-foreground mb-2">FMV / LTV</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <div>
                <div className="text-muted-foreground text-xs">Verified FMV</div>
                <div className="font-medium">{formatCurrency(p.latest_verified_fmv)}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">FMV verified</div>
                <div className="font-medium">{formatDate(p.fmv_verified_at)}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">FMV source</div>
                <div className="font-medium">{p.fmv_verification_source ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Policy LTV cap</div>
                <div className="font-medium">
                  {p.ltv_policy_ratio != null
                    ? `${(p.ltv_policy_ratio * 100).toFixed(1)}%`
                    : "—"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Current LTV (declared)</div>
                <div className="font-medium">
                  {computedLtv !== null ? `${computedLtv}%` : "—"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Max accessible cash</div>
                <div className="font-medium">
                  {formatCurrency(p.max_accessible_cash_current)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Policy limits panel */}
      <div className="rounded-lg border overflow-hidden">
        <div
          className={`px-4 py-2 text-sm font-medium border-b flex items-center gap-2 ${
            adminPolicy.execution_readiness_blocked_by_underwriting
              ? "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100"
              : "bg-muted/40"
          }`}
        >
          LTV policy limits
          {adminPolicy.execution_readiness_blocked_by_underwriting ? (
            <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
              execution blocked
            </span>
          ) : (
            <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              clear
            </span>
          )}
        </div>
        <div className="p-4 text-sm space-y-3">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            <div>
              <div className="text-muted-foreground text-xs">Executable max accessible cash</div>
              <div className="font-medium">
                {formatCurrency(adminPolicy.executable_max_accessible_cash)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Provisional max (deal FMV required)</div>
              <div className="font-medium text-muted-foreground">
                Requires active deal
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Debt data stale (&gt;90 days)</div>
              <div className={`font-medium ${adminPolicy.secured_debt_data_is_stale ? "text-red-600 dark:text-red-400" : ""}`}>
                {adminPolicy.secured_debt_data_is_stale ? "Yes — refresh required" : "No"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Verified FMV missing</div>
              <div className={`font-medium ${adminPolicy.verified_fmv_required_for_execution ? "text-red-600 dark:text-red-400" : ""}`}>
                {adminPolicy.verified_fmv_required_for_execution ? "Yes — required for execution" : "No"}
              </div>
            </div>
          </div>

          {adminPolicy.block_reasons_internal.length > 0 && (
            <div className="border-t pt-3">
              <div className="text-xs font-medium text-muted-foreground mb-1">Internal block reasons</div>
              <ul className="list-disc list-inside space-y-0.5 text-xs text-red-700 dark:text-red-400">
                {adminPolicy.block_reasons_internal.map((r) => (
                  <li key={r} className="font-mono">{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <AdminPropertyActions propertyId={propertyId} status={p.status} />

      <PropertyDocumentsPreview propertyId={propertyId} docs={docs} />

      <AdminPropertyStatusControls
        propertyId={propertyId}
        currentStatus={p.status}
      />

      {/* Sprint 16 intake panel */}
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
                  {p.ownership_type?.replace("_", " ") ?? "—"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Occupancy use</div>
                <div className="font-medium">
                  {p.occupancy_use?.replace("_", " ") ?? "—"}
                  {p.occupancy_use === "other" && p.occupancy_use_other
                    ? `: ${p.occupancy_use_other}`
                    : ""}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Major condition issue</div>
                <div className="font-medium">
                  {p.major_condition_issue?.replace("_", " ") ?? "—"}
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
                  {p.title_claims_known?.replace("_", " ") ?? "—"}
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
                  {p.owner_stated_fmv_confidence?.replace("_", " ") ?? "—"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">FMV basis</div>
                <div className="font-medium">
                  {p.owner_stated_fmv_source?.replace("_", " ") ?? "—"}
                  {p.owner_stated_fmv_source === "other" &&
                  p.owner_stated_fmv_source_other
                    ? `: ${p.owner_stated_fmv_source_other}`
                    : ""}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Open to formal review</div>
                <div className="font-medium">
                  {p.willing_to_proceed_formal_review?.replace("_", " ") ?? "—"}
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
                    <div className="font-medium">
                      {formatCurrency(p.total_known_debt_amount)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Confidence</div>
                    <div className="font-medium">
                      {p.total_known_debt_confidence?.replace("_", " ") ?? "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Statements available</div>
                    <div className="font-medium">
                      {p.debt_statement_availability ?? "—"}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Linked deal triage panel */}
      {(() => {
        const TRIAGE_BADGE: Record<string, { label: string; cls: string }> = {
          ready_for_deposit: { label: "Ready for deposit request", cls: "bg-green-100 text-green-800" },
          triage_in_progress: { label: "Triage in progress", cls: "bg-blue-100 text-blue-800" },
          more_info_needed: { label: "Additional information required", cls: "bg-yellow-100 text-yellow-800" },
          ineligible: { label: "Ineligible", cls: "bg-red-100 text-red-800" },
        };
        const FMV_BADGE: Record<string, { label: string; cls: string }> = {
          green: { label: "Green", cls: "bg-green-100 text-green-800" },
          yellow: { label: "Yellow", cls: "bg-yellow-100 text-yellow-800" },
          red: { label: "Red", cls: "bg-red-100 text-red-800" },
        };

        return (
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
                  {/* Deal identity: address as primary label */}
                  <div className="space-y-0.5">
                    <div className="font-medium">
                      {addressDisplay || "Address not available"}
                    </div>
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
                      <div className="text-muted-foreground text-xs">FMV plausibility</div>
                      <div className="font-medium">
                        {linkedDeal.fmv_plausibility_flag ? (() => {
                          const b = FMV_BADGE[linkedDeal.fmv_plausibility_flag!];
                          return b ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${b.cls}`}>
                              {b.label}
                            </span>
                          ) : linkedDeal.fmv_plausibility_flag;
                        })() : "—"}
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
        );
      })()}

      {/* Review request panel */}
      {linkedDeal && (
        <AdminReviewRequestPanel
          dealId={linkedDeal.id}
          propertyId={propertyId}
          initialRequest={currentReviewRequest}
        />
      )}

      {/* Underwriting snapshots */}
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
                  <td className="p-3 whitespace-nowrap text-xs">
                    {formatDate(snap.captured_at)}
                  </td>
                  <td className="p-3 text-xs">{snap.snapshot_source}</td>
                  <td className="p-3 text-xs">{snap.actor_type}</td>
                  <td className="p-3 text-xs">
                    {snap.has_secured_property_debt === null
                      ? "—"
                      : snap.has_secured_property_debt
                        ? "Yes"
                        : "No"}
                  </td>
                  <td className="p-3 text-xs">
                    {formatCurrency(snap.secured_property_debt_amount)}
                  </td>
                  <td className="p-3 text-xs">
                    {formatCurrency(snap.latest_verified_fmv)}
                  </td>
                  <td className="p-3 text-xs">
                    {formatCurrency(snap.max_accessible_cash_current)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Status audit log */}
      <div className="rounded-lg border overflow-x-auto">
        <div className="bg-muted/40 px-4 py-2 text-sm font-medium border-b">
          Status audit log
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
                  Failed to load audit: {auditRes.error.message}
                </td>
              </tr>
            ) : auditRows.length === 0 ? (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={4}>
                  No audit events yet.
                </td>
              </tr>
            ) : (
              auditRows.map((a: any) => (
                <tr key={a.id} className="border-t">
                  <td className="p-3 whitespace-nowrap text-xs">
                    {formatDate(a.changed_at)}
                  </td>
                  <td className="p-3 whitespace-nowrap text-xs">
                    {a.from_status} &rarr; {a.to_status}
                    <span className="ml-2 text-muted-foreground">
                      ({a.actor_type})
                    </span>
                  </td>
                  <td className="p-3">
                    <span className="font-mono text-xs break-all">
                      {a.changed_by}
                    </span>
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
