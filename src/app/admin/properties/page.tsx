import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";
import { PropertyStatusButton } from "@/components/admin/PropertyStatusButton";

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

export default async function AdminPropertiesPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    redirect(`/login?returnTo=${encodeURIComponent("/admin/properties")}`);
  }

  const resolved = (await Promise.resolve(searchParams)) as SearchParams | undefined;
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

  const rows = (propsRes.data ?? []) as any[];

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
              <th className="p-3">Notes</th>
              <th className="p-3 w-[120px]">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={5}>
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

                return (
                  <tr key={p.id} className="border-t">
                    <td className="p-3">
                      <a
                        className="font-medium underline"
                        href={`/admin/properties/${p.id}`}
                      >
                        {label || "—"}
                      </a>
                    </td>

                    <td className="p-3">
                      <div className="font-mono text-xs break-all">
                        {p.owner_user_id}
                      </div>
                    </td>

                    <td className="p-3">
                      <span className="inline-flex items-center rounded-full border px-2 py-0.5">
                        {String(p.status).replace("_", " ")}
                      </span>
                    </td>

                    <td className="p-3">
                      <div className="text-xs text-muted-foreground break-words">
                        {p.review_notes ?? ""}
                      </div>
                    </td>

                    <td className="p-3">
                      <div className="flex gap-1 flex-wrap">
                        <PropertyStatusButton
                          propertyId={p.id}
                          currentStatus={p.status}
                          targetStatus="verified"
                          label="Verify"
                        />
                        <PropertyStatusButton
                          propertyId={p.id}
                          currentStatus={p.status}
                          targetStatus="unverified"
                          label="Unverify"
                        />
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
