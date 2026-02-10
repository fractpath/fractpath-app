import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function MePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?returnTo=${encodeURIComponent("/me")}`);
  }

  // Fetch grants for this user (RLS should allow "own rows" in deal_access_grants)
  const grantsRes = await supabase
    .from("deal_access_grants")
    .select("deal_id, role, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (grantsRes.error) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">My account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Couldn’t load your deal access list.
        </p>
        <div className="mt-4 rounded-md border p-3 text-sm">
          <div className="font-medium">Details</div>
          <div className="mt-1 text-muted-foreground break-words">
            {grantsRes.error.message}
          </div>
        </div>
      </main>
    );
  }

  const grants = grantsRes.data ?? [];
  const grantedDealIds = grants.map((g) => g.deal_id).filter(Boolean);

  // Fetch canonical deal rows for granted IDs.
  // IMPORTANT: some grants may reference legacy deals (not present in public.deals).
  const dealsRes =
    grantedDealIds.length > 0
      ? await supabase.from("deals").select("*").in("id", grantedDealIds)
      : { data: [], error: null as any };

  if (dealsRes.error) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-xl font-semibold">My account</h1>
          <div className="text-sm text-muted-foreground">{user.email}</div>
        </div>

        <div className="mt-6 rounded-md border p-4">
          <h2 className="text-sm font-medium">My deals</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Couldn’t load your deals.
          </p>
          <div className="mt-4 rounded-md border p-3 text-sm">
            <div className="font-medium">Details</div>
            <div className="mt-1 text-muted-foreground break-words">
              {dealsRes.error.message}
            </div>
          </div>
        </div>
      </main>
    );
  }

  const deals = (dealsRes.data ?? []) as Record<string, any>[];

  const byId = new Map<string, Record<string, any>>();
  for (const d of deals) byId.set(d.id, d);

  function labelForDeal(dealId: string) {
    const d = byId.get(dealId);
    return (
      d?.title ||
      d?.name ||
      d?.address ||
      d?.property_address ||
      d?.home_address ||
      dealId
    );
  }

  // Split grants into canonical vs legacy/missing (no deal row)
  const canonicalOwnerIds: string[] = [];
  const canonicalViewerIds: string[] = [];
  const missingOwnerIds: string[] = [];
  const missingViewerIds: string[] = [];

  for (const g of grants) {
    const id = g.deal_id;
    if (!id) continue;
    const existsInCanonical = byId.has(id);

    if (g.role === "OWNER") {
      if (existsInCanonical) canonicalOwnerIds.push(id);
      else missingOwnerIds.push(id);
    } else if (g.role === "VIEWER") {
      if (existsInCanonical) canonicalViewerIds.push(id);
      else missingViewerIds.push(id);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold">My account</h1>
        <div className="text-sm text-muted-foreground">{user.email}</div>
      </div>

      <div className="mt-6 grid gap-6">
        {/* My deals (canonical only) */}
        <section className="rounded-md border p-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-sm font-medium">My deals</h2>
            <span className="text-xs text-muted-foreground">
              {canonicalOwnerIds.length}
            </span>
          </div>

          {canonicalOwnerIds.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              You don’t have any deals yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {canonicalOwnerIds.map((id) => (
                <li
                  key={id}
                  className="flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {labelForDeal(id)}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {id}
                    </div>
                  </div>
                  <Link className="text-sm underline" href={`/deal/${id}`}>
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {missingOwnerIds.length > 0 && (
            <div className="mt-4 rounded-md border p-3">
              <div className="text-sm font-medium">Legacy deals</div>
              <div className="mt-1 text-xs text-muted-foreground">
                These IDs exist in your access list but don’t exist in the new
                deals table (likely from deals_legacy). They can’t be opened in
                the new deal view.
              </div>
              <ul className="mt-2 space-y-1">
                {missingOwnerIds.map((id) => (
                  <li key={id} className="text-xs text-muted-foreground">
                    {id}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Shared with me (canonical only) */}
        <section className="rounded-md border p-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-sm font-medium">Shared with me</h2>
            <span className="text-xs text-muted-foreground">
              {canonicalViewerIds.length}
            </span>
          </div>

          {canonicalViewerIds.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Nothing has been shared with you yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {canonicalViewerIds.map((id) => (
                <li
                  key={id}
                  className="flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {labelForDeal(id)}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {id}
                    </div>
                  </div>
                  <Link
                    className="text-sm underline"
                    href={`/deal/${id}?mode=shared`}
                  >
                    View
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {missingViewerIds.length > 0 && (
            <div className="mt-4 rounded-md border p-3">
              <div className="text-sm font-medium">Legacy shared deals</div>
              <div className="mt-1 text-xs text-muted-foreground">
                These IDs exist in your access list but don’t exist in the new
                deals table (likely from deals_legacy).
              </div>
              <ul className="mt-2 space-y-1">
                {missingViewerIds.map((id) => (
                  <li key={id} className="text-xs text-muted-foreground">
                    {id}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
