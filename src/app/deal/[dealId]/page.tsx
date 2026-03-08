import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { AppHeader } from "@/components/layout/AppHeader";
import { DealPageShell } from "@/components/deal/DealPageShell";
import { DealDetailWidgetPanel } from "@/components/deal/DealDetailWidgetPanel";
import { DealActivityFeed } from "@/components/deal/DealActivityFeed";
import { NegotiationSection } from "@/components/deal/NegotiationSection";
import { WaitingBanner } from "@/components/deal/WaitingBanner";
import { RecomputeSnapshotButton } from "@/components/deal/RecomputeSnapshotButton";

type PageProps = {
  params: Promise<{ dealId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type AnyRecord = Record<string, unknown>;

async function loadNegotiationState(
  svc: ReturnType<typeof createServiceClient>,
  activeThread: any,
  userId: string,
) {
  if (!activeThread) {
    return {
      currentProposal: null,
      previousProposal: null,
      isResponder: false,
      isSender: false,
      isBuyer: false,
      isOwnerSide: false,
    };
  }

  const { data: proposals } = await (svc.from("deal_proposals") as any)
    .select("id, status, created_by_user_id, terms_snapshot, created_at")
    .eq("thread_id", activeThread.id)
    .order("created_at", { ascending: false })
    .limit(10);

  const all = proposals ?? [];
  const currentProposal = all.find((p: any) => p.status === "submitted") ?? null;
  const previousProposal =
    all.find(
      (p: any) =>
        p.id !== currentProposal?.id &&
        ["countered", "submitted"].includes(p.status),
    ) ?? null;

  const isBuyer = activeThread.buyer_user_id === userId;
  const isSender = currentProposal?.created_by_user_id === userId;
  const isResponder = !!currentProposal && !isSender;

  return {
    currentProposal,
    previousProposal,
    isResponder,
    isSender,
    isBuyer,
    isOwnerSide: !isBuyer,
  };
}

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
    .select("id, owner_user_id, status, created_at, archived_at")
    .eq("id", dealId)
    .maybeSingle();

  if (deal && (deal as any).archived_at) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-3xl p-6 space-y-6">
          <h1 className="text-xl font-semibold">
            This deal has been archived.
          </h1>
          <p className="text-sm text-muted-foreground">
            Archived deals are no longer accessible. Records are retained for
            compliance.
          </p>
          <Link className="underline text-sm" href="/dashboard">
            Back to dashboard
          </Link>
        </main>
      </div>
    );
  }

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

    const snapJson = (latestSnap as any)?.snapshot_json ?? null;
    const snapHeader = snapJson?.meta?.header ?? {};
    const headerTitle = headerPayload.title ?? snapHeader.title ?? null;
    const resolvedPropertyId =
      headerPayload.property_id ?? snapHeader.property_id ?? null;

    let livePropertyStatus: string | null = null;
    let liveOwnershipStatus: string | null = null;

    if (resolvedPropertyId) {
      const { data: liveProp } = await (svc.from("properties") as any)
        .select("status, ownership_status")
        .eq("id", resolvedPropertyId)
        .maybeSingle();

      if (liveProp) {
        livePropertyStatus = liveProp.status ?? null;
        liveOwnershipStatus = liveProp.ownership_status ?? null;
      }
    }

    const headerProperty = resolvedPropertyId
      ? {
          property_id: resolvedPropertyId,
          display_address:
            headerPayload.display_address ?? snapHeader.display_address ?? "",
          property_status:
            livePropertyStatus ??
            headerPayload.property_status ??
            snapHeader.property_status ??
            null,
          ownership_status:
            liveOwnershipStatus ??
            headerPayload.ownership_status ??
            snapHeader.ownership_status ??
            null,
        }
      : null;

    const { data: activeThreads } = await (svc.from("deal_threads") as any)
      .select("id, status, buyer_user_id, owner_user_id")
      .eq("deal_id", dealId)
      .in("status", ["pending_owner", "negotiating"])
      .limit(1);

    const activeThread =
      activeThreads && activeThreads.length > 0 ? activeThreads[0] : null;

    const negState = await loadNegotiationState(svc, activeThread, user.id);
    const locked = !!activeThread;

    const inputs = snapJson ? (snapJson.inputs ?? null) : null;
    const results = snapJson ? (snapJson.outputs?.results ?? null) : null;

    const { data: events } = await (svc.from("deal_events") as any)
      .select("id, deal_id, event_type, payload, created_by, created_at")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(50);

    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-5xl p-6 space-y-6">
          <DealPageShell
            dealId={dealId}
            isOwner={isOwner}
            locked={locked}
            activeThread={activeThread}
            initialTitle={headerTitle}
            initialProperty={headerProperty}
          />

          {negState.isSender && activeThread && (
            <WaitingBanner
              threadId={activeThread.id}
              isBuyer={negState.isBuyer}
            />
          )}

          {negState.isResponder && negState.currentProposal && activeThread && (
            <NegotiationSection
              threadId={activeThread.id}
              proposalId={negState.currentProposal.id}
              proposalStatus={negState.currentProposal.status}
              currentTerms={negState.currentProposal.terms_snapshot ?? null}
              previousTerms={negState.previousProposal?.terms_snapshot ?? null}
              isOwnerSide={negState.isOwnerSide}
            />
          )}

          <DealDetailWidgetPanel
            dealId={dealId}
            initialSnapshot={snapJson}
            inputs={inputs}
            results={results}
            computeVersion={snapJson?.compute_version ?? null}
            canEdit={isOwner && !locked}
            persona="homeowner"
          />

          {isOwner && !locked && snapJson && (
            <RecomputeSnapshotButton
              dealId={dealId}
              initialInputs={snapJson?.inputs ?? null}
            />
          )}

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
                    negState: {
                      isResponder: negState.isResponder,
                      isSender: negState.isSender,
                      isBuyer: negState.isBuyer,
                      isOwnerSide: negState.isOwnerSide,
                      currentProposalId: negState.currentProposal?.id ?? null,
                      previousProposalId: negState.previousProposal?.id ?? null,
                    },
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

  let ownerMatches = false;
  let thread: any = null;
  let property: any = null;
  let resolvedThreadId: string | null = threadId ?? null;

  if (resolvedThreadId) {
    const { data: t } = await (svc.from("deal_threads") as any)
      .select("id,status,property_id,buyer_user_id,owner_user_id,deal_id")
      .eq("id", resolvedThreadId)
      .maybeSingle();

    thread = t ?? null;
  }

  if (!thread) {
    const { data: inferredThread } = await (svc.from("deal_threads") as any)
      .select("id,status,property_id,buyer_user_id,owner_user_id,deal_id")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (inferredThread) {
      thread = inferredThread;
      resolvedThreadId = inferredThread.id;
    }
  }

  const offerPayload: any =
    offerEv && typeof offerEv === "object" && "payload" in (offerEv as any)
      ? (offerEv as any).payload
      : null;

  if (!thread && offerPayload) {
    const payloadThreadId =
      offerPayload?.thread_id ?? offerPayload?.threadId ?? null;

    if (payloadThreadId) {
      const { data: eventThread } = await (svc.from("deal_threads") as any)
        .select("id,status,property_id,buyer_user_id,owner_user_id,deal_id")
        .eq("id", payloadThreadId)
        .maybeSingle();

      if (eventThread) {
        thread = eventThread;
        resolvedThreadId = eventThread.id;
      }
    }
  }

  if (thread?.property_id) {
    const { data: p } = await (svc.from("properties") as any)
      .select("id,status,owner_user_id,normalized_address")
      .eq("id", thread.property_id)
      .maybeSingle();

    property = p ?? null;
  }

  const directOwnerMatches =
    !!property?.owner_user_id && property.owner_user_id === user.id;

  const threadOwnerMatches =
    !!thread?.owner_user_id && thread.owner_user_id === user.id;

  const buyerMatches =
    !!thread?.buyer_user_id && thread.buyer_user_id === user.id;

  let participantMatches = false;
  if (resolvedThreadId) {
    const { data: participant } = await (
      svc.from("deal_thread_participants") as any
    )
      .select("user_id,status,role")
      .eq("thread_id", resolvedThreadId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    participantMatches = !!participant;
  }

  let grantMatches = false;
  const { data: grant } = await (svc.from("deal_access_grants") as any)
    .select("user_id,role,revoked_at,expires_at")
    .eq("deal_id", dealId)
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();

  if (grant) {
    const notExpired =
      !grant.expires_at || new Date(grant.expires_at) > new Date();
    grantMatches = notExpired;
  }

  let inviteMatches = false;
  if (resolvedThreadId && user.email) {
    const { data: invite } = await (svc.from("thread_invites") as any)
      .select("id,intended_role,expires_at")
      .eq("thread_id", resolvedThreadId)
      .eq("invitee_email", user.email.toLowerCase())
      .limit(1)
      .maybeSingle();

    if (invite) {
      const notExpired =
        !invite.expires_at || new Date(invite.expires_at) > new Date();
      inviteMatches = notExpired;
    }
  }

  ownerMatches =
    directOwnerMatches ||
    threadOwnerMatches ||
    buyerMatches ||
    participantMatches ||
    grantMatches ||
    inviteMatches;

  const allowDealFallback = ownerMatches;

  if (allowDealFallback) {
    const { data: archivedCheck } = await (svc.from("deals") as any)
      .select("archived_at")
      .eq("id", dealId)
      .maybeSingle();

    if ((archivedCheck as any)?.archived_at) {
      return (
        <div className="min-h-screen">
          <AppHeader />
          <main className="mx-auto max-w-3xl p-6 space-y-6">
            <h1 className="text-xl font-semibold">
              This deal has been archived.
            </h1>
            <p className="text-sm text-muted-foreground">
              Archived deals are no longer accessible. Records are retained for
              compliance.
            </p>
            <Link className="underline text-sm" href="/dashboard">
              Back to dashboard
            </Link>
          </main>
        </div>
      );
    }

    let fallbackDeal: any = null;

    const { data: fallbackDealRow } = await (svc.from("deals") as any)
      .select("id, owner_user_id, status, created_at, archived_at")
      .eq("id", dealId)
      .maybeSingle();

    fallbackDeal = fallbackDealRow ?? null;

    const { data: headerEv } = await (svc.from("deal_events") as any)
      .select("payload")
      .eq("deal_id", dealId)
      .eq("event_type", "DEAL_HEADER_UPDATED")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const headerPayload = headerEv?.payload ?? {};

    const { data: latestSnap } = await (svc.from("deal_snapshots") as any)
      .select("id, snapshot_json, contract_version, schema_version")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const snapJson = (latestSnap as any)?.snapshot_json ?? null;
    const snapHeader = snapJson?.meta?.header ?? {};
    const headerTitle = headerPayload.title ?? snapHeader.title ?? null;
    const resolvedPropertyId =
      headerPayload.property_id ?? snapHeader.property_id ?? null;

    let livePropertyStatus: string | null = null;
    let liveOwnershipStatus: string | null = null;

    if (resolvedPropertyId) {
      const { data: liveProp } = await (svc.from("properties") as any)
        .select("status, ownership_status")
        .eq("id", resolvedPropertyId)
        .maybeSingle();

      if (liveProp) {
        livePropertyStatus = liveProp.status ?? null;
        liveOwnershipStatus = liveProp.ownership_status ?? null;
      }
    }

    const headerProperty = resolvedPropertyId
      ? {
          property_id: resolvedPropertyId,
          display_address:
            headerPayload.display_address ?? snapHeader.display_address ?? "",
          property_status:
            livePropertyStatus ??
            headerPayload.property_status ??
            snapHeader.property_status ??
            null,
          ownership_status:
            liveOwnershipStatus ??
            headerPayload.ownership_status ??
            snapHeader.ownership_status ??
            null,
        }
      : null;

    const activeThread =
      thread && ["pending_owner", "negotiating"].includes(thread.status)
        ? thread
        : null;

    const negState = await loadNegotiationState(svc, activeThread, user.id);
    const locked = !!activeThread;

    const inputs = snapJson ? (snapJson.inputs ?? null) : null;
    const results = snapJson ? (snapJson.outputs?.results ?? null) : null;

    const { data: events } = await (svc.from("deal_events") as any)
      .select("id, deal_id, event_type, payload, created_by, created_at")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(50);

    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-5xl p-6 space-y-6">
          <DealPageShell
            dealId={dealId}
            isOwner={true}
            locked={locked}
            activeThread={activeThread}
            initialTitle={headerTitle}
            initialProperty={headerProperty}
          />

          {negState.isSender && activeThread && (
            <WaitingBanner
              threadId={activeThread.id}
              isBuyer={negState.isBuyer}
            />
          )}

          {negState.isResponder && negState.currentProposal && activeThread && (
            <NegotiationSection
              threadId={activeThread.id}
              proposalId={negState.currentProposal.id}
              proposalStatus={negState.currentProposal.status}
              currentTerms={negState.currentProposal.terms_snapshot ?? null}
              previousTerms={negState.previousProposal?.terms_snapshot ?? null}
              isOwnerSide={negState.isOwnerSide}
            />
          )}

          <DealDetailWidgetPanel
            dealId={dealId}
            initialSnapshot={snapJson}
            inputs={inputs}
            results={results}
            computeVersion={snapJson?.compute_version ?? null}
            canEdit={false}
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
                    fallbackDeal,
                    offerEvErr: offerEvErr?.message ?? null,
                    offerEv: offerEv ?? null,
                    threadId,
                    resolvedThreadId,
                    thread,
                    property,
                    ownerMatches,
                    allowDealFallback,
                    activeThread,
                    negState: {
                      isResponder: negState.isResponder,
                      isSender: negState.isSender,
                      isBuyer: negState.isBuyer,
                      isOwnerSide: negState.isOwnerSide,
                      currentProposalId: negState.currentProposal?.id ?? null,
                      previousProposalId: negState.previousProposal?.id ?? null,
                    },
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

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-3xl p-6 space-y-6">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm text-muted-foreground">
          You don't have access to this deal (or it may no longer exist).
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
                  allowDealFallback,
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
