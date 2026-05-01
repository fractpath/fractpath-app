import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";
import { AppHeader } from "@/components/layout/AppHeader";

type TriageStatus =
  | "ready_for_deposit"
  | "triage_in_progress"
  | "more_info_needed"
  | "ineligible"
  | null;

const TRIAGE_BADGE: Record<
  NonNullable<TriageStatus>,
  { label: string; className: string }
> = {
  ready_for_deposit: {
    label: "Ready for signatures",
    className: "bg-green-100 text-green-800",
  },
  triage_in_progress: {
    label: "Triage in progress",
    className: "bg-blue-100 text-blue-800",
  },
  more_info_needed: {
    label: "Additional information required",
    className: "bg-yellow-100 text-yellow-800",
  },
  ineligible: {
    label: "Ineligible",
    className: "bg-red-100 text-red-800",
  },
};

const FMV_BADGE: Record<string, { label: string; className: string }> = {
  green: { label: "FMV green", className: "bg-green-100 text-green-800" },
  yellow: { label: "FMV yellow", className: "bg-yellow-100 text-yellow-800" },
  red: { label: "FMV red", className: "bg-red-100 text-red-800" },
};

function formatDate(val: string | null | undefined): string {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleDateString("en-US", { dateStyle: "medium" });
  } catch {
    return String(val);
  }
}

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminDealsTriagePage({ searchParams }: PageProps) {
  const admin = await requireAdmin();

  if (!admin.ok) {
    if (admin.status === 401) {
      redirect(`/login?returnTo=${encodeURIComponent("/admin/deals")}`);
    }
    return (
      <div>
        <AppHeader />
        <main className="mx-auto max-w-3xl p-6 space-y-6">
          <h1 className="text-2xl font-semibold">Admin</h1>
          <div className="rounded-lg border p-4">
            <div className="text-sm font-medium">Access denied</div>
          </div>
        </main>
      </div>
    );
  }

  const resolved = await searchParams;
  const filterRaw =
    typeof resolved?.triage === "string" ? resolved.triage : "accepted";

  const svc = createServiceClient();

  let query = (svc.from("deals") as any)
    .select(
      "id, status, triage_status, triage_reason_tags, fmv_plausibility_flag, accepted_at, created_at, admin_voided_at, deal_threads(property_id, properties(address_line1, city, state))",
    )
    .order("accepted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (filterRaw === "accepted") {
    query = query.eq("status", "ACCEPTED").is("admin_voided_at", null);
  } else if (filterRaw === "triaged") {
    query = query.not("triage_status", "is", null);
  } else if (filterRaw === "no_triage") {
    query = query.eq("status", "ACCEPTED").is("triage_status", null);
  } else if (filterRaw === "ineligible") {
    query = query.eq("triage_status", "ineligible");
  } else if (filterRaw === "ready") {
    query = query.eq("triage_status", "ready_for_deposit");
  } else if (filterRaw === "more_info") {
    query = query.eq("triage_status", "more_info_needed");
  } else if (filterRaw === "draft") {
    query = query.eq("status", "DRAFT").is("archived_at", null);
  }

  const { data: deals, error } = await query;

  const FILTERS = [
    { key: "accepted", label: "Accepted deals" },
    { key: "ready", label: "Ready for signatures" },
    { key: "triaged", label: "All triaged" },
    { key: "more_info", label: "More info needed" },
    { key: "ineligible", label: "Ineligible" },
    { key: "no_triage", label: "Pending triage" },
    { key: "draft", label: "Draft deals" },
  ];

  return (
    <div>
      <AppHeader />
      <main className="mx-auto max-w-5xl p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Deals — Triage</h1>
          <Link
            href="/admin/properties"
            className="text-sm text-muted-foreground underline"
          >
            Properties
          </Link>
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(({ key, label }) => (
            <Link
              key={key}
              href={`/admin/deals?triage=${key}`}
              className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                filterRaw === key
                  ? "bg-foreground text-background border-foreground"
                  : "bg-white hover:bg-muted/40"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Failed to load deals: {error.message}
          </div>
        )}

        {!error && (!deals || deals.length === 0) && (
          <div className="rounded-lg border p-6 text-sm text-muted-foreground text-center">
            No deals found for this filter.
          </div>
        )}

        {!error && deals && deals.length > 0 && (
          <div className="rounded-lg border divide-y overflow-hidden">
            {deals.map((deal: any) => {
              const ts: TriageStatus = deal.triage_status ?? null;
              const badge = ts ? TRIAGE_BADGE[ts] : null;
              const fmvBadge = deal.fmv_plausibility_flag
                ? FMV_BADGE[deal.fmv_plausibility_flag]
                : null;
              const tags: string[] = deal.triage_reason_tags ?? [];

              const propData: any = (deal.deal_threads as any[])?.[0]?.properties ?? null;
              const shortAddress = propData
                ? [propData.address_line1, propData.city, propData.state]
                    .filter(Boolean)
                    .join(", ")
                : null;

              const propertyId: string | null =
                (deal.deal_threads as any[])?.[0]?.property_id ?? null;

              return (
                <div
                  key={deal.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-start gap-3"
                >
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="space-y-0.5">
                      {/* Primary label: address → links to deal review */}
                      <Link
                        href={`/admin/deals/${deal.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {shortAddress ?? "Address unavailable"}
                      </Link>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-muted-foreground truncate max-w-[180px]">
                          {deal.id.slice(0, 8)}…
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Accepted {formatDate(deal.accepted_at)}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {deal.admin_voided_at && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-orange-100 text-orange-800 ring-1 ring-orange-300">
                          Voided
                        </span>
                      )}
                      {badge ? (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
                          Accepted — awaiting triage
                        </span>
                      )}

                      {fmvBadge && (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${fmvBadge.className}`}
                        >
                          {fmvBadge.label}
                        </span>
                      )}
                    </div>

                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-muted text-muted-foreground font-mono"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions column: primary = deal review, secondary = property review */}
                  <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
                    <Link
                      href={`/admin/deals/${deal.id}`}
                      className="text-xs font-medium underline text-foreground hover:text-muted-foreground"
                    >
                      Deal review →
                    </Link>
                    {propertyId && (
                      <Link
                        href={`/admin/properties/${propertyId}`}
                        className="text-xs underline text-muted-foreground hover:text-foreground"
                      >
                        Property review →
                      </Link>
                    )}
                    <Link
                      href={`/deal/${deal.id}`}
                      target="_blank"
                      className="text-xs underline text-muted-foreground hover:text-foreground"
                    >
                      View deal →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
