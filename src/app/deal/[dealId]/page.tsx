import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { AppHeader } from "@/components/layout/AppHeader";
import { DealHeader } from "@/components/deals/DealHeader";
import { DealDetailWidgetPanel } from "@/components/deal/DealDetailWidgetPanel";
import { DealActivityFeed } from "@/components/deal/DealActivityFeed";
import { ActiveThreadBanner } from "@/components/deal/ActiveThreadBanner";

type PageProps = {
  params: Promise<{ dealId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DealPage(ctx: PageProps) {
  const { dealId } = await ctx.params;
  const searchParams = (await Promise.resolve(ctx.searchParams)) ?? {};
  const debug =
    (typeof searchParams.debug === "string"
      ? searchParams.debug
      : undefined) === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?returnTo=${encodeURIComponent(`/deal/${dealId}`)}`);
  }

  // --- Primary path: load deal via RLS (buyer/participant with grants) ---
  const { data: deal } = await supabase
    .from("deals")
    .select("id, owner_user_id, status, created_at")
    .eq("id", dealId)
    .maybeSingle();

  if (deal) {
    const { data: grant } = await supabase
      .from("deal_access_grants")
      .select("role")
      .eq("deal_id", dealId)
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .maybeSingle();

    const userRole = grant?.role ?? null;
    const isOwner =
      userRole === "OWNER" || (deal as any).owner_user_id === user.id;

    const svc = createServiceClient();

    const { data: headerEv } = await (svc.from("deal_events") as any)
      .select("payload")
      .eq("deal_id", dealId)
      .eq("event_type", "DEAL_HEADER_UPDATED")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const headerPayload = headerEv?.payload ?? {};

    const { data: latestSnap } = await supabase
      .from("deal_snapshots")
      .select("id, snapshot_json, contract_version, schema_version")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const snapJson = (latestSnap as any)?.snapshot_json ?? {};
    const snapHeader = snapJson?.meta?.header ?? {};
    const headerTitle = headerPayload.title ?? snapHeader.title ?? null;
    const headerProperty =
      (headerPayload.property_id ?? snapHeader.property_id)
        ? {
            property_id: headerPayload.property_id ?? snapHeader.property_id,
            display_address:
              headerPayload.display_address ?? snapHeader.display_address ?? "",
            property_status:
              headerPayload.property_status ??
              snapHeader.property_status ??
              null,
            ownership_status:
              headerPayload.ownership_status ??
              snapHeader.ownership_status ??
              null,
          }
        : null;

    const { data: activeThreads } = await (svc.from("deal_threads") as any)
      .select("id, status, buyer_user_id")
      .eq("deal_id", dealId)
      .in("status", ["pending_owner"])
      .limit(1);

    const activeThread =
      activeThreads && activeThreads.length > 0 ? activeThreads[0] : null;

    const isPropertyOwner = user.id === (deal as any).owner_user_id;
    const isBuyer = !!activeThread && activeThread.buyer_user_id === user.id;
    const isPendingOwner = activeThread?.status === "pending_owner";

    if (isPendingOwner && isPropertyOwner && activeThread) {
      redirect(`/threads/${activeThread.id}`);
    }

    const locked = !!(isPendingOwner && isBuyer);

    const inputs = snapJson?.inputs ?? null;
    const results = snapJson?.outputs?.results ?? null;

    const { data: events } = await (svc.from("deal_events") as any)
      .select("id, deal_id, event_type, payload, created_by, created_at")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(50);

    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-5xl p-6 space-y-6">
          <DealHeader
            dealId={dealId}
            readOnly={!isOwner}
            activeThread={activeThread}
            initialTitle={headerTitle}
            initialProperty={headerProperty}
            locked={locked}
          />

          {isPendingOwner && isBuyer && activeThread && (
            <ActiveThreadBanner
              threadId={activeThread.id}
              threadStatus={activeThread.status}
              isBuyer={true}
            />
          )}

          <DealDetailWidgetPanel
            dealId={dealId}
            initialSnapshot={snapJson}
            inputs={inputs}
            results={results}
            computeVersion={snapJson?.compute_version ?? null}
            canEdit={isOwner}
            persona="homeowner"
          />

          {events && events.length > 0 && (
            <section>
              <h2 className="text-base font-semibold mb-3">Activity</h2>
              <DealActivityFeed
                items={events.map((e: any) => ({
                  id: e.id,
                  event_type: e.event_type,
                  payload: e.payload,
                  created_at: e.created_at,
                  created_by_user_id: e.created_by ?? null,
                }))}
              />
            </section>
          )}

          {debug && (
            <section className="rounded-lg border p-4 bg-muted/30 space-y-2">
              <h2 className="font-medium">Debug</h2>
              <pre className="text-xs overflow-auto">
                {JSON.stringify(
                  {
                    dealId,
                    auth: { userId: user.id, email: user.email },
                    deal,
                    userRole,
                    headerPayload,
                    snapHeader,
                    activeThread,
                  },
                  null,
                  2,
                )}
              </pre>
            </section>
          )}
        </main>
      </div>
    );
  }

  // --- Owner fallback path (bypass RLS, prove entitlement via thread+property) ---
  const svc = createServiceClient();

  // 1) Find offer_submitted event for this deal -> get thread_id
  const { data: offerEv, error: offerEvErr } = await svc
    .from("deal_events")
    .select("id,deal_id,event_type,payload,created_at")
    .eq("deal_id", dealId)
    .eq("event_type", "offer_submitted")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const threadId =
    (offerEv as any)?.payload?.thread_id &&
    typeof (offerEv as any).payload.thread_id === "string"
      ? (offerEv as any).payload.thread_id
      : null;

  // 2) Load thread + property and confirm owner
  let ownerMatches = false;
  let thread: any = null;
  let property: any = null;

  if (threadId) {
    const { data: t } = await svc
      .from("deal_threads")
      .select("id,status,property_id")
      .eq("id", threadId)
      .maybeSingle();
    thread = t ?? null;

    if (thread?.property_id) {
      const { data: p } = await (svc.from("properties") as any)
        .select("id,status,owner_user_id,normalized_address")
        .eq("id", thread.property_id)
        .maybeSingle();
      property = p ?? null;
      ownerMatches = !!p?.owner_user_id && p.owner_user_id === user.id;
    }
  }

  // If owner matches, allow viewing deal even if RLS/participant grants deny it.
  if (ownerMatches) {
    // Sprint 13: owners should review/decide on offers via the thread surface.
    // This avoids duplicating offer UI inside /deal while we finish accept/reject wiring.
    if (!threadId) {
      return (
        <div className="min-h-screen">
          <AppHeader />
          <main className="mx-auto max-w-3xl p-6 space-y-6">
            <h1 className="text-xl font-semibold">
              Deal linked thread not found
            </h1>
            {debug ? (
              <section className="rounded-lg border p-4 bg-muted/30 space-y-2">
                <h2 className="font-medium">Debug (owner fallback)</h2>
                <pre className="text-xs overflow-auto">
                  {JSON.stringify(
                    {
                      dealId,
                      auth: { userId: user.id, email: user.email },
                      offerEv: offerEv ?? null,
                      threadId,
                      thread,
                      property,
                      ownerMatches,
                    },
                    null,
                    2,
                  )}
                </pre>
              </section>
            ) : null}
            <Link className="underline text-sm" href="/dashboard">
              Back to dashboard
            </Link>
          </main>
        </div>
      );
    }

    // If not debugging, route owners to the thread surface (Sprint 13).
    if (!debug) {
      redirect(`/threads/${threadId}?from=deal`);
    }

    // Debug mode: stay on /deal and show deal status so we can verify lifecycle.
    const { data: deal, error: dealErr } = await svc
      .from("deals")
      .select(
        "id, owner_user_id, status, created_from, source_ref, created_at, mode, accepted_at, executed_at, funded_at, closed_at",
      )
      .eq("id", dealId)
      .maybeSingle();

    const { data: events, error: eventsErr } = await svc
      .from("deal_events")
      .select("id,deal_id,event_type,created_at,payload")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(10);

    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-5xl p-6 space-y-6">
          <h1 className="text-xl font-semibold">Deal debug</h1>

          <div className="rounded-lg border p-4 space-y-2">
            <div className="text-sm">
              Back to thread:{" "}
              <Link
                className="underline"
                href={`/threads/${threadId}?from=deal`}
              >
                /threads/{threadId}
              </Link>
            </div>
          </div>

          <section className="rounded-lg border p-4 bg-muted/30 space-y-2">
            <h2 className="font-medium">Debug (deal page)</h2>
            <pre className="text-xs overflow-auto">
              {JSON.stringify(
                {
                  dealId,
                  auth: { userId: user.id, email: user.email },
                  offerEv: offerEv ?? null,
                  threadId,
                  thread,
                  property,
                  ownerMatches,
                  dealErr: dealErr?.message ?? null,
                  deal: deal ?? null,
                  eventsErr: eventsErr?.message ?? null,
                  events: events ?? null,
                },
                null,
                2,
              )}
            </pre>
          </section>
        </main>
      </div>
    );
  }

  // If not owner, fall back to your existing Access Denied UI
  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-3xl p-6 space-y-6">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm text-muted-foreground">
          You don’t have access to this deal (or it may no longer exist).
        </p>
        <Link className="underline text-sm" href="/account">
          Go to my account
        </Link>

        {debug ? (
          <section className="rounded-lg border p-4 bg-muted/30 space-y-2">
            <h2 className="font-medium">Debug</h2>
            <pre className="text-xs overflow-auto">
              {JSON.stringify(
                {
                  dealId,
                  auth: { userId: user.id, email: user.email },
                  offerEvErr: offerEvErr?.message ?? null,
                  offerEv: offerEv ?? null,
                  threadId,
                  thread,
                  property,
                  ownerMatches,
                },
                null,
                2,
              )}
            </pre>
          </section>
        ) : null}
      </main>
    </div>
  );
}
