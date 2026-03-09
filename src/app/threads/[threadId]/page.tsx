import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { AppHeader } from "@/components/layout/AppHeader";
import { ThreadDetailView } from "@/components/threads/ThreadDetailView";

type PageProps = {
  params: Promise<{ threadId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ThreadReviewPage(ctx: PageProps) {
  const { threadId } = await ctx.params;
  const searchParams = (await Promise.resolve(ctx.searchParams)) ?? {};

  const debug =
    (typeof searchParams.debug === "string"
      ? searchParams.debug
      : undefined) === "1";

  const fromDeal =
    (typeof (searchParams as any).from === "string"
      ? (searchParams as any).from
      : undefined) === "deal";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?returnTo=${encodeURIComponent(`/threads/${threadId}`)}`);
  }

  const svc = createServiceClient();

  const { data: thread, error: threadErr } = await (
    svc.from("deal_threads") as any
  )
    .select(
      "id,status,property_id,buyer_user_id,owner_user_id,created_at,updated_at",
    )
    .eq("id", threadId)
    .maybeSingle();

  if (threadErr) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-3xl p-6 space-y-4">
          <h1 className="text-xl font-semibold">Thread load error</h1>
          <pre className="text-xs overflow-auto">{threadErr.message}</pre>
        </main>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-3xl p-6 space-y-4">
          <h1 className="text-xl font-semibold">Thread not found</h1>
          <p className="text-sm text-muted-foreground">
            No thread exists for id {threadId}.
          </p>
        </main>
      </div>
    );
  }

  const { data: property, error: propErr } = await (
    svc.from("properties") as any
  )
    .select("id,status,owner_user_id,normalized_address")
    .eq("id", thread.property_id)
    .maybeSingle();

  if (propErr) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-3xl p-6 space-y-4">
          <h1 className="text-xl font-semibold">Property load error</h1>
          <pre className="text-xs overflow-auto">{propErr.message}</pre>
        </main>
      </div>
    );
  }

  const directOwnerMatches =
    !!property?.owner_user_id && property.owner_user_id === user.id;

  const threadOwnerMatches =
    !!thread?.owner_user_id && thread.owner_user_id === user.id;

  const buyerMatches =
    !!thread?.buyer_user_id && thread.buyer_user_id === user.id;

  let participantMatches = false;
  const { data: participant } = await (
    svc.from("deal_thread_participants") as any
  )
    .select("user_id,status,role")
    .eq("thread_id", threadId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  participantMatches = !!participant;

  let inviteMatches = false;
  if (user.email) {
    const { data: invite } = await (svc.from("thread_invites") as any)
      .select("id,intended_role,expires_at")
      .eq("thread_id", threadId)
      .eq("invitee_email", user.email.toLowerCase())
      .limit(1)
      .maybeSingle();

    if (invite) {
      const notExpired =
        !invite.expires_at || new Date(invite.expires_at) > new Date();
      inviteMatches = notExpired;
    }
  }

  const ownerMatches =
    directOwnerMatches ||
    threadOwnerMatches ||
    buyerMatches ||
    participantMatches ||
    inviteMatches;

  if (!ownerMatches) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-3xl p-6 space-y-6">
          <h1 className="text-xl font-semibold">Access denied</h1>
          <p className="text-sm text-muted-foreground">
            You don’t have access to this thread.
          </p>

          {debug ? (
            <section className="rounded-lg border p-4 bg-muted/30 space-y-2">
              <h2 className="font-medium">Debug</h2>
              <pre className="text-xs overflow-auto">
                {JSON.stringify(
                  {
                    threadIdParam: threadId,
                    auth: { userId: user.id, email: user.email },
                    thread,
                    property,
                    directOwnerMatches,
                    threadOwnerMatches,
                    buyerMatches,
                    participantMatches,
                    inviteMatches,
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

  // Get latest proposal for this thread (MVP)
  const { data: proposal, error: proposalErr } = await (
    svc.from("deal_proposals") as any
  )
    .select("id,thread_id,status,created_at,updated_at")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let dealId: string | null = null;
  let offerEvent: any = null;

  if (proposal?.id) {
    const { data: ev, error: evErr } = await (svc.from("deal_events") as any)
      .select("id,deal_id,event_type,payload,created_at")
      .eq("event_type", "offer_submitted")
      .eq("payload->>proposal_id", proposal.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!evErr && ev?.deal_id) {
      dealId = ev.deal_id;
      offerEvent = ev;
    }
  }

  // Redirect to deal offer view unless:
  // - arriving from deal page (prevents loop)
  // - thread is pending_owner (owner needs Accept/Reject on this page)
  if (!debug && !fromDeal && dealId && thread.status !== "pending_owner") {
    redirect(`/deal/${dealId}#offer`);
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-5xl p-6 space-y-6">
        {/* Header shell stays */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Thread review</h1>
          <div className="text-xs">
            <Link className="underline" href="/dashboard">
              Back to dashboard
            </Link>
          </div>
        </div>

        {/* Render your real thread UI (includes ThreadActionPanel inside) */}
        <ThreadDetailView threadId={threadId} />

        {/* Debug-only deal link + loop note */}
        {debug && dealId ? (
          <div className="rounded-lg border p-4 space-y-2">
            <div className="text-sm">
              Deal resolved:{" "}
              <Link className="underline" href={`/deal/${dealId}#offer`}>
                /deal/{dealId}#offer
              </Link>
            </div>

            {fromDeal ? (
              <div className="text-xs text-muted-foreground">
                Arrived from /deal. Staying on the thread view to avoid a
                redirect loop.
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                Remove <code>?debug=1</code> to auto-redirect.
              </div>
            )}
          </div>
        ) : null}

        {debug ? (
          <section className="rounded-lg border p-4 bg-muted/30 space-y-2">
            <h2 className="font-medium">Debug</h2>
            <pre className="text-xs overflow-auto">
              {JSON.stringify(
                {
                  threadIdParam: threadId,
                  auth: { userId: user.id, email: user.email },
                  thread,
                  property: property ?? null,
                  ownerMatches,
                  proposal: proposal ?? null,
                  offerEvent: offerEvent ?? null,
                  dealId,
                  errors: { proposalErr: proposalErr?.message ?? null },
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
