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
  const ownerDealIds = grants
    .filter((g) => g.role === "OWNER")
    .map((g) => g.deal_id);
  const viewerDealIds = grants
    .filter((g) => g.role === "VIEWER")
    .map((g) => g.deal_id);

  // Optional: fetch deal rows to show something nicer than UUIDs.
  // If your deals table doesn’t have "title" or similar columns, we’ll fall back to IDs.
  //
  // RLS should allow SELECT if you have a grant row (Step 5 policies).
  const dealsRes =
    grants.length > 0
      ? await supabase
          .from("deals")
          .select("*")
          .in(
            "id",
            grants.map((g) => g.deal_id),
          )
      : { data: [], error: null as any };

  const deals = (dealsRes.data ?? []) as Record<string, any>[];

  const byId = new Map<string, Record<string, any>>();
  for (const d of deals) byId.set(d.id, d);

  function labelForDeal(dealId: string) {
    const d = byId.get(dealId);
    // Try common “label-ish” fields, otherwise fall back to UUID
    return (
      d?.title ||
      d?.name ||
      d?.address ||
      d?.property_address ||
      d?.home_address ||
      dealId
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold">My account</h1>
        <div className="text-sm text-muted-foreground">{user.email}</div>
      </div>

      <div className="mt-6 grid gap-6">
        {/* My deals */}
        <section className="rounded-md border p-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-sm font-medium">My deals</h2>
            <span className="text-xs text-muted-foreground">
              {ownerDealIds.length}
            </span>
          </div>

          {ownerDealIds.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              You don’t have any deals yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {ownerDealIds.map((id) => (
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
        </section>

        {/* Shared with me */}
        <section className="rounded-md border p-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-sm font-medium">Shared with me</h2>
            <span className="text-xs text-muted-foreground">
              {viewerDealIds.length}
            </span>
          </div>

          {viewerDealIds.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Nothing has been shared with you yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {viewerDealIds.map((id) => (
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
        </section>
      </div>
    </main>
  );
}
