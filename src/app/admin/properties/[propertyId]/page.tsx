import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";

export default async function AdminPropertyAuditPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;

  const admin = await requireAdmin();
  if (!admin.ok) {
    redirect(
      `/login?returnTo=${encodeURIComponent(`/admin/properties/${propertyId}`)}`,
    );
  }

  const supabase = createServiceClient();

  const propRes = await (supabase.from("properties") as any)
    .select(
      "id, owner_user_id, address, status, created_at, updated_at, reviewed_at, reviewed_by, verified_at, verified_by, review_notes",
    )
    .eq("id", propertyId)
    .maybeSingle();

  if (propRes.error || !propRes.data) {
    return (
      <main className="mx-auto max-w-4xl p-6 space-y-4">
        <Link className="text-sm underline" href="/admin/properties">
          &larr; Back
        </Link>
        <h1 className="text-2xl font-semibold">Audit</h1>
        <div className="rounded-lg border p-4 text-sm text-muted-foreground">
          Property not found (or failed to load).
        </div>
      </main>
    );
  }

  const p: any = propRes.data;

  const auditRes = await (supabase.from("property_status_audit") as any)
    .select(
      "id, from_status, to_status, changed_by, actor_type, changed_at, notes",
    )
    .eq("property_id", propertyId)
    .order("changed_at", { ascending: false });

  const rows = (auditRes.data ?? []) as any[];

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Link className="text-sm underline" href="/admin/properties">
          &larr; Back
        </Link>
        <Link
          className="text-sm underline"
          href={`/admin/properties?status=${encodeURIComponent(p.status)}`}
        >
          View list ({p.status})
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">Property audit</h1>
        <p className="text-sm text-muted-foreground">{p.address || p.id}</p>
      </div>

      <div className="rounded-lg border p-4 text-sm space-y-1">
        <div>
          <span className="text-muted-foreground">Status:</span>{" "}
          {String(p.status)}
        </div>
        <div>
          <span className="text-muted-foreground">Owner:</span>{" "}
          <span className="font-mono text-xs break-all">
            {p.owner_user_id}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Reviewed:</span>{" "}
          {p.reviewed_at ? String(p.reviewed_at) : "—"}
        </div>
        <div>
          <span className="text-muted-foreground">Verified:</span>{" "}
          {p.verified_at ? String(p.verified_at) : "—"}
        </div>
        {p.review_notes && (
          <div className="pt-2">
            <span className="text-muted-foreground">Notes:</span>{" "}
            {p.review_notes}
          </div>
        )}
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-3">When</th>
              <th className="p-3">Transition</th>
              <th className="p-3">By</th>
              <th className="p-3">Notes</th>
            </tr>
          </thead>
          <tbody>
            {auditRes.error ? (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={4}>
                  Failed to load audit: {auditRes.error.message}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={4}>
                  No audit events yet.
                </td>
              </tr>
            ) : (
              rows.map((a: any) => (
                <tr key={a.id} className="border-t">
                  <td className="p-3 whitespace-nowrap">
                    {String(a.changed_at)}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    {a.from_status} &rarr; {a.to_status}
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({a.actor_type})
                    </span>
                  </td>
                  <td className="p-3">
                    <span className="font-mono text-xs break-all">
                      {a.changed_by}
                    </span>
                  </td>
                  <td className="p-3 break-words">{a.notes ?? ""}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
