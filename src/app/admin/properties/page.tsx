import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";
import { AdminPropertyActions } from "@/components/admin/AdminPropertyActions";

type Status = "unverified" | "under_review" | "verified" | "archived";

const STATUS_ORDER: Status[] = ["unverified", "under_review", "verified", "archived"];

function isStatus(v: unknown): v is Status {
  return (
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

  const resolved = (await Promise.resolve(searchParams)) as
    | SearchParams
    | undefined;
  const filterRaw =
    typeof resolved?.status === "string" ? resolved.status : "unverified";
  const statusFilter: Status = isStatus(filterRaw) ? filterRaw : "unverified";

  const supabase = createServiceClient();

  const propsRes = await (supabase
    .from("properties") as any)
    .select(
      "id, owner_user_id, address, status, created_at, updated_at, reviewed_at, reviewed_by, verified_at, verified_by, review_notes",
    )
    .eq("status", statusFilter)
    .order("created_at", { ascending: false });

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
        <Link className="text-sm underline" href="/dashboard">
          Back to dashboard
        </Link>
      </div>

      <div className="flex gap-2 flex-wrap">
        {STATUS_ORDER.map((s) => {
          const active = s === statusFilter;
          return (
            <Link
              key={s}
              href={`/admin/properties?status=${encodeURIComponent(s)}`}
              className={[
                "text-sm px-3 py-1 rounded-full border",
                active ? "bg-foreground text-background" : "hover:bg-muted",
              ].join(" ")}
            >
              {s.replace("_", " ")}
            </Link>
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
              <th className="p-3 w-[260px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={5}>
                  No properties found for status: {statusFilter}
                </td>
              </tr>
            ) : (
              rows.map((p: any) => (
                <tr key={p.id} className="border-t">
                  <td className="p-3">
                    <div className="font-medium">{p.address || "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      <Link
                        className="underline"
                        href={`/admin/properties/${p.id}`}
                      >
                        View audit
                      </Link>
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="font-mono text-xs break-all">
                      {p.owner_user_id}
                    </div>
                  </td>
                  <td className="p-3">
                    <span className="inline-flex items-center rounded-full border px-2 py-0.5">
                      {String(p.status)}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="text-xs text-muted-foreground break-words">
                      {p.review_notes ?? ""}
                    </div>
                  </td>
                  <td className="p-3">
                    <AdminPropertyActions
                      propertyId={p.id}
                      status={p.status}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
