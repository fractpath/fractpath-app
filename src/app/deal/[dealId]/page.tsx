// src/app/deal/[dealId]/page.tsx

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ShareDealCard } from "@/components/ShareDealCard";
import { getLatestDealSnapshot } from "@/lib/dealSnapshotDb";
import {
  extractSnapshotDisplay,
  formatValue,
  humanLabel,
} from "@/lib/dealSnapshotDisplay";

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  params: { dealId?: string } | Promise<{ dealId?: string }>;
  searchParams?: SearchParams | Promise<SearchParams>;
};

function getParam(
  searchParams: SearchParams | undefined,
  key: string,
): string | null {
  const v = searchParams?.[key];
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function isUuid(v: string | undefined): v is string {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      v,
    )
  );
}

export default async function DealPage({ params, searchParams }: PageProps) {
  const resolvedParams = await Promise.resolve(params as any);
  const resolvedSearchParams = await Promise.resolve(searchParams as any);

  const dealId = resolvedParams?.dealId as string | undefined;

  if (!isUuid(dealId)) {
    redirect("/me");
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?returnTo=${encodeURIComponent(`/deal/${dealId}`)}`);
  }

  const viewMode = getParam(resolvedSearchParams, "mode");
  const isSharedMode = viewMode === "shared";

  const dealRes = await supabase
    .from("deals")
    .select("*")
    .eq("id", dealId)
    .maybeSingle();

  if (dealRes.error || !dealRes.data) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don’t have access to this deal (or it may no longer exist).
        </p>

        <div className="mt-4">
          <Link className="text-sm underline" href="/me">
            Go to my account
          </Link>
        </div>
      </main>
    );
  }

  const deal = dealRes.data as Record<string, any>;

  let role: "OWNER" | "VIEWER" =
    deal.owner_user_id === user.id ? "OWNER" : "VIEWER";

  if (role !== "OWNER") {
    const grantRes = await supabase
      .from("deal_access_grants")
      .select("role")
      .eq("deal_id", dealId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (grantRes.data?.role === "OWNER" || grantRes.data?.role === "VIEWER") {
      role = grantRes.data.role;
    }
  }

  const readOnly = role === "VIEWER" || isSharedMode;

  const snapResult = await getLatestDealSnapshot(supabase, dealId);
  const snapshotRow = snapResult.ok ? snapResult.snapshot : null;
  const display = extractSnapshotDisplay(snapshotRow);

  // Deal events timeline (read-only)
  const eventsRes = await supabase
    .from("deal_events")
    .select("id, event_type, payload, created_by, created_at")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false })
    .limit(50);

  const events = (eventsRes.data ?? []) as Array<Record<string, any>>;

  return (
    <main className="mx-auto max-w-3xl p-6">
      {readOnly ? (
        <div className="mb-4 rounded-md border p-3">
          <div className="text-sm font-medium">Read-only shared deal</div>
          <div className="mt-1 text-sm text-muted-foreground">
            You can view this deal, but you can’t make changes.
          </div>
        </div>
      ) : null}

      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold">Deal</h1>
        <div className="text-sm text-muted-foreground">
          Role: <span className="font-medium text-foreground">{role}</span>
        </div>
      </div>

      <div className="mt-4 rounded-md border p-4 text-sm">
        <div className="grid gap-2">
          <div>
            <span className="font-medium">Deal ID:</span>{" "}
            <span className="break-words">{dealId}</span>
          </div>
          <div>
            <span className="font-medium">Mode:</span> {deal.mode ?? "(none)"}
          </div>
          <div>
            <span className="font-medium">Editable:</span>{" "}
            {readOnly ? "No" : "Yes"}
          </div>
        </div>
      </div>

      <section className="mt-6 rounded-md border p-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-base font-semibold">Scenario snapshot</h2>
          <div className="text-xs text-muted-foreground">
            Latest saved snapshot (read-only; no recompute)
          </div>
        </div>

        {!display ? (
          <div className="mt-3 space-y-2">
            <p className="text-sm font-medium">
              No scenario snapshot saved yet
            </p>
            <p className="text-sm text-muted-foreground">
              A snapshot will appear here once the calculator widget saves one
              for this deal. No numbers are computed in this app.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-4 text-sm">
            <div className="grid gap-2">
              <div>
                <span className="font-medium">Contract version:</span>{" "}
                {display.contractVersion}
              </div>
              <div>
                <span className="font-medium">Schema version:</span>{" "}
                {display.schemaVersion}
              </div>
              <div>
                <span className="font-medium">Created:</span>{" "}
                {display.createdAt}
              </div>
              <div>
                <span className="font-medium">Input hash:</span>{" "}
                <span className="break-words">{display.inputHash}</span>
              </div>
              <div>
                <span className="font-medium">Output hash:</span>{" "}
                <span className="break-words">{display.outputHash}</span>
              </div>
            </div>

            {display.inputs ? (
              <div>
                <div className="font-medium">Inputs</div>
                <div className="mt-2 grid gap-1 rounded-md bg-muted p-3 text-xs">
                  {Object.entries(display.inputs).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4">
                      <span className="text-muted-foreground">
                        {humanLabel(k)}
                      </span>
                      <span className="font-medium">{formatValue(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <div className="font-medium">Inputs</div>
                <p className="mt-2 text-xs text-muted-foreground">{"\u2014"}</p>
              </div>
            )}

            {display.outputs ? (
              <div>
                <div className="font-medium">Outputs</div>
                <div className="mt-2 grid gap-1 rounded-md bg-muted p-3 text-xs">
                  {Object.entries(display.outputs).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4">
                      <span className="text-muted-foreground">
                        {humanLabel(k)}
                      </span>
                      <span className="font-medium">{formatValue(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <div className="font-medium">Outputs</div>
                <p className="mt-2 text-xs text-muted-foreground">{"\u2014"}</p>
              </div>
            )}

            {display.chartSeries ? (
              <div>
                <div className="font-medium">Projection series</div>
                <pre className="mt-2 overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed">
                  {JSON.stringify(display.chartSeries, null, 2)}
                </pre>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section className="mt-6 rounded-md border p-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-base font-semibold">Deal events</h2>
          <div className="text-xs text-muted-foreground">Latest 50</div>
        </div>

        {eventsRes.error ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Unable to load events.
          </p>
        ) : events.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No events recorded for this deal.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {events.map((e) => (
              <div key={e.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-sm font-medium">{e.event_type}</div>
                  <div className="text-xs text-muted-foreground">
                    {e.created_at}
                  </div>
                </div>
                <pre className="mt-2 overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed">
                  {JSON.stringify(e.payload ?? {}, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </section>

      {role === "OWNER" && !readOnly ? (
        <div className="mt-6">
          <ShareDealCard dealId={dealId} />
        </div>
      ) : null}

      <div className="mt-6 flex gap-4">
        <Link className="text-sm underline" href="/me">
          Back to my account
        </Link>
      </div>
    </main>
  );
}
