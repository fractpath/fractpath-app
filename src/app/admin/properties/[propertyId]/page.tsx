import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";
import { AdminPropertyActions } from "@/components/admin/AdminPropertyActions";

const BUCKET = "property-verification";
const SIGNED_URL_TTL = 600;

const DOC_TYPE_LABELS: Record<string, string> = {
  selfie: "Selfie",
  drivers_license: "Driver License",
  utility_bill: "Utility / Bill",
};

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
      "id, owner_user_id, address_line1, address_line2, city, state, postal_code, status, created_at, updated_at, reviewed_at, reviewed_by, verified_at, verified_by, review_notes",
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

  const addressDisplay = [p.address_line1, p.address_line2, p.city, p.state, p.postal_code]
    .filter(Boolean)
    .join(", ");

  const [auditRes, docsRes] = await Promise.all([
    (supabase.from("property_status_audit") as any)
      .select("id, from_status, to_status, changed_by, actor_type, changed_at, notes")
      .eq("property_id", propertyId)
      .order("changed_at", { ascending: false }),
    (supabase.from("property_documents") as any)
      .select("id, doc_type, storage_path, content_type, created_at")
      .eq("property_id", propertyId),
  ]);

  const auditRows = (auditRes.data ?? []) as any[];
  const docRows = (docsRes.data ?? []) as any[];

  const docsWithUrls = await Promise.all(
    docRows.map(async (d: any) => {
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(d.storage_path, SIGNED_URL_TTL);
      return { ...d, signed_url: signed?.signedUrl ?? null };
    }),
  );

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
        <p className="text-sm text-muted-foreground">{addressDisplay || p.id}</p>
      </div>

      <div className="rounded-lg border p-4 text-sm space-y-1">
        <div>
          <span className="text-muted-foreground">Status:</span>{" "}
          {String(p.status)}
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

      <div className="flex gap-2">
        <AdminPropertyActions propertyId={propertyId} status={p.status} />
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="text-base font-semibold mb-3">Verification documents</h2>
        {docsWithUrls.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents uploaded.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {docsWithUrls.map((d: any) => (
              <div key={d.id} className="rounded-md border p-3 space-y-2">
                <div className="text-sm font-medium">
                  {DOC_TYPE_LABELS[d.doc_type] ?? d.doc_type}
                </div>
                {d.signed_url ? (
                  d.content_type?.startsWith("image/") ? (
                    <a href={d.signed_url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={d.signed_url}
                        alt={d.doc_type}
                        className="w-full h-32 object-cover rounded border"
                      />
                    </a>
                  ) : (
                    <a
                      href={d.signed_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded border p-3 text-center text-xs hover:bg-muted"
                    >
                      View document (PDF)
                    </a>
                  )
                ) : (
                  <div className="text-xs text-muted-foreground">
                    URL unavailable
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground">
                  {d.content_type}
                </div>
              </div>
            ))}
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
            ) : auditRows.length === 0 ? (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={4}>
                  No audit events yet.
                </td>
              </tr>
            ) : (
              auditRows.map((a: any) => (
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
