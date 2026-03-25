import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";
import { PropertyStatusButton } from "@/components/admin/PropertyStatusButton";
import { AppHeader } from "@/components/layout/AppHeader";

type Status = "unverified" | "under_review" | "verified" | "archived";
type Filter = "queue" | Status;

const FILTER_ORDER: Filter[] = [
  "queue",
  "unverified",
  "under_review",
  "verified",
  "archived",
];

function isFilter(v: unknown): v is Filter {
  return (
    v === "queue" ||
    v === "unverified" ||
    v === "under_review" ||
    v === "verified" ||
    v === "archived"
  );
}

type SearchParams = Record<string, string | string[] | undefined>;

  type PageProps = {
    searchParams?: Promise<SearchParams>;
  };

  export default async function AdminPropertiesPage({
    searchParams,
  }: PageProps) {
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

  const resolved = (await Promise.resolve(searchParams)) as
    | SearchParams
    | undefined;
  const raw = resolved?.status;
  const filterRaw = Array.isArray(raw) ? raw[0] : raw;
  const filter: Filter = isFilter(filterRaw) ? filterRaw : "queue";

  const supabase = createServiceClient();

  let q = (supabase.from("properties") as any).select(
    "id, owner_user_id, address_line1, address_line2, city, state, postal_code, status, created_at, updated_at, reviewed_at, reviewed_by, verified_at, verified_by, review_notes",
  );

  if (filter === "queue") {
    q = q.in("status", ["unverified", "under_review"]);
  } else {
    q = q.eq("status", filter);
  }

  const propsRes = await q.order("created_at", { ascending: false });

  if (propsRes.error) {
    return (
      <main className="mx-auto max-w-5xl p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Admin — Properties</h1>
        <div className="rounded-lg border p-4">
          <div className="text-sm font-medium">Failed to load properties</div>
          <div className="mt-2 text-sm text-muted-foreground break-words">
            {propsRes.error.message}
          </div>
        </div>
      </main>
    );
  }

  const allRows = (propsRes.data ?? []) as any[];
  const propertyIds = allRows.map((p: any) => p.id);

  const REQUIRED_DOC_TYPES = ["selfie", "drivers_license", "utility_bill"];

  let docCountsByProperty: Record<string, Set<string>> = {};
  let triageByProperty: Record<string, string | null> = {};

  if (propertyIds.length > 0) {
    const [docsResult, threadsResult] = await Promise.all([
      (supabase.from("property_documents") as any)
        .select("property_id, doc_type")
        .in("property_id", propertyIds),
      (supabase.from("deal_threads") as any)
        .select("property_id, deal_id")
        .in("property_id", propertyIds)
        .eq("status", "accepted"),
    ]);

    for (const d of docsResult.data ?? []) {
      if (!docCountsByProperty[d.property_id]) {
        docCountsByProperty[d.property_id] = new Set();
      }
      docCountsByProperty[d.property_id].add(d.doc_type);
    }

    const acceptedThreads: { property_id: string; deal_id: string }[] =
      threadsResult.data ?? [];
    const dealIds = [
      ...new Set(
        acceptedThreads.map((t) => t.deal_id).filter(Boolean),
      ),
    ];

    if (dealIds.length > 0) {
      const { data: triageDeals } = await (supabase.from("deals") as any)
        .select("id, triage_status")
        .in("id", dealIds);

      const triageByDealId: Record<string, string | null> = {};
      for (const d of triageDeals ?? []) {
        triageByDealId[d.id] = d.triage_status ?? null;
      }

      // Map back: property_id -> triage_status (most recent accepted thread wins)
      for (const t of acceptedThreads) {
        if (!(t.property_id in triageByProperty)) {
          triageByProperty[t.property_id] = triageByDealId[t.deal_id] ?? null;
        }
      }
    }
  }

  type Readiness = "ready_for_review" | "in_review" | "verified" | "missing_docs" | "unclaimed";

  function getReadiness(p: any): Readiness {
    if (p.status === "verified") return "verified";
    if (p.status === "archived") return "verified";
    if (p.status === "under_review") return "in_review";
    if (!p.owner_user_id) return "unclaimed";
    const uploadedTypes = docCountsByProperty[p.id] ?? new Set();
    const hasAllDocs = REQUIRED_DOC_TYPES.every((t) => uploadedTypes.has(t));
    return hasAllDocs ? "ready_for_review" : "missing_docs";
  }

  const READINESS_ORDER: Record<Readiness, number> = {
    ready_for_review: 0,
    in_review: 1,
    missing_docs: 2,
    unclaimed: 3,
    verified: 4,
  };

  const rows = allRows
    .map((p: any) => ({ ...p, _readiness: getReadiness(p) }))
    .sort((a: any, b: any) => {
      const aOrder = READINESS_ORDER[a._readiness as Readiness];
      const bOrder = READINESS_ORDER[b._readiness as Readiness];
      if (aOrder !== bOrder) return aOrder - bOrder;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const READINESS_CHIPS: Record<Readiness, { label: string; bg: string; text: string; border: string }> = {
    ready_for_review: { label: "Ready for review", bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-200" },
    in_review: { label: "Under review", bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-200" },
    verified: { label: "Verified", bg: "bg-green-100", text: "text-green-800", border: "border-green-200" },
    missing_docs: { label: "Missing documents", bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-200" },
    unclaimed: { label: "Unclaimed", bg: "bg-gray-100", text: "text-gray-500", border: "border-gray-200" },
  };

  function readinessChip(readiness: Readiness) {
    const chip = READINESS_CHIPS[readiness];
    return (
      <span className={`inline-flex items-center rounded-full ${chip.bg} ${chip.text} border ${chip.border} px-2 py-0.5 text-xs font-medium`}>
        {chip.label}
      </span>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Admin — Properties</h1>
          <p className="text-sm text-muted-foreground">
            Property verification ops surface
          </p>
        </div>
        <a className="text-sm underline" href="/dashboard">
          Back to dashboard
        </a>
      </div>

      <div className="flex gap-2 flex-wrap">
        {FILTER_ORDER.map((s) => {
          const active = s === filter;
          const href = `/admin/properties?status=${encodeURIComponent(s)}`;
          return (
            <a
              key={s}
              href={href}
              className={[
                "text-sm px-3 py-1 rounded-full border",
                active ? "bg-foreground text-background" : "hover:bg-muted",
              ].join(" ")}
            >
              {s === "queue" ? "queue" : s.replace("_", " ")}
            </a>
          );
        })}
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-3">Property</th>
              <th className="p-3">Owner</th>
              <th className="p-3">Status</th>
              <th className="p-3">Readiness</th>
              <th className="p-3">Deal triage</th>
              <th className="p-3">Notes</th>
              <th className="p-3 w-[120px]">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={7}>
                  No properties found for: {filter}
                </td>
              </tr>
            ) : (
              rows.map((p: any) => {
                const label = [
                  p.address_line1,
                  p.address_line2,
                  p.city,
                  p.state,
                  p.postal_code,
                ]
                  .filter(Boolean)
                  .join(", ");

                const readiness = p._readiness as Readiness;
                const isActionable = readiness === "ready_for_review" || readiness === "in_review";
                const dimmed = readiness === "unclaimed" || readiness === "missing_docs";

                const triageStatus = triageByProperty[p.id] ?? null;
                const TRIAGE_CHIP: Record<string, { label: string; cls: string }> = {
                  ready_for_deposit: { label: "Ready for deposit", cls: "bg-green-100 text-green-800 border-green-200" },
                  triage_in_progress: { label: "Triage in progress", cls: "bg-blue-100 text-blue-800 border-blue-200" },
                  more_info_needed: { label: "More info needed", cls: "bg-yellow-100 text-yellow-800 border-yellow-200" },
                  ineligible: { label: "Ineligible", cls: "bg-red-100 text-red-800 border-red-200" },
                };

                return (
                  <tr key={p.id} className={`border-t ${dimmed ? "opacity-60" : ""}`}>
                    <td className="p-3">
                      <a
                        className="font-medium underline"
                        href={`/admin/properties/${p.id}`}
                      >
                        {label || "—"}
                      </a>
                    </td>

                    <td className="p-3">
                      {p.owner_user_id ? (
                        <div className="font-mono text-xs break-all">
                          {p.owner_user_id}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">none</span>
                      )}
                    </td>

                    <td className="p-3">
                      <span className="inline-flex items-center rounded-full border px-2 py-0.5">
                        {String(p.status).replace("_", " ")}
                      </span>
                    </td>

                    <td className="p-3">
                      {readinessChip(readiness)}
                    </td>

                    <td className="p-3">
                      {p.id in triageByProperty ? (
                        triageStatus ? (
                          (() => {
                            const chip = TRIAGE_CHIP[triageStatus];
                            return chip ? (
                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${chip.cls}`}>
                                {chip.label}
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                                {triageStatus.replace(/_/g, " ")}
                              </span>
                            );
                          })()
                        ) : (
                          <span className="text-xs text-muted-foreground">pending</span>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>

                    <td className="p-3">
                      <div className="text-xs text-muted-foreground break-words">
                        {p.review_notes ?? ""}
                      </div>
                    </td>

                    <td className="p-3">
                      <div className="flex gap-1 flex-wrap">
                        {isActionable && (
                          <PropertyStatusButton
                            propertyId={p.id}
                            currentStatus={p.status}
                            targetStatus="verified"
                            label="Verify"
                          />
                        )}
                        {p.status !== "unverified" && (
                          <PropertyStatusButton
                            propertyId={p.id}
                            currentStatus={p.status}
                            targetStatus="unverified"
                            label="Unverify"
                          />
                        )}
                        <a
                          className="text-xs px-2 py-1 rounded border hover:bg-muted inline-block"
                          href={`/admin/properties/${p.id}`}
                        >
                          Detail
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
