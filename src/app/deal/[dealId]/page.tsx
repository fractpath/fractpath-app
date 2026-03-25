import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { AppHeader } from "@/components/layout/AppHeader";
import { DealPageShell } from "@/components/deal/DealPageShell";
import { DealDetailWidgetPanel } from "@/components/deal/DealDetailWidgetPanel";
import { DealActivityFeed } from "@/components/deal/DealActivityFeed";
import { NegotiationSection } from "@/components/deal/NegotiationSection";
import { AcceptedPendingReviewBanner } from "@/components/deal/AcceptedPendingReviewBanner";
import { WaitingBanner } from "@/components/deal/WaitingBanner";
import { RecomputeSnapshotButton } from "@/components/deal/RecomputeSnapshotButton";
import { SignatureCard } from "@/components/deal/SignatureCard";
import type { SignaturePacketView, SignatureRecipientView } from "@/components/deal/SignatureCard";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getArtifactSignedUrls } from "@/lib/signature/artifacts";

type PageProps = {
  params: Promise<{ dealId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type AnyRecord = Record<string, unknown>;

function safeRecord(v: unknown): AnyRecord | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as AnyRecord)
    : null;
}

function toEffectiveSnapshot(
  proposalTermsSnapshot: AnyRecord | null,
  fallbackSnapshot: AnyRecord | null,
): AnyRecord | null {
  const proposal = safeRecord(proposalTermsSnapshot);
  const fallback = safeRecord(fallbackSnapshot);

  if (!proposal) return fallback;

  const proposalInputs = safeRecord((proposal as any).inputs);
  if (proposalInputs) {
    return {
      ...proposal,
      schema_version:
        (proposal as any).schema_version ??
        (fallback as any)?.schema_version ??
        "1",
      compute_version:
        (proposal as any).compute_version ??
        (fallback as any)?.compute_version ??
        null,
    };
  }

  const topLevelDealTerms = safeRecord((proposal as any).deal_terms);
  const topLevelScenario = safeRecord((proposal as any).scenario);

  if (topLevelDealTerms || topLevelScenario) {
    return {
      inputs: {
        deal_terms: topLevelDealTerms ?? {},
        scenario: topLevelScenario ?? {},
      },
      outputs: {
        results: null,
      },
      schema_version: (fallback as any)?.schema_version ?? "1",
      compute_version: (fallback as any)?.compute_version ?? null,
    } as AnyRecord;
  }

  return fallback;
}

async function loadNegotiationState(
  svc: ReturnType<typeof createServiceClient>,
  effectiveThread: any,
  userId: string,
) {
  if (!effectiveThread) {
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
    .eq("thread_id", effectiveThread.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const all = proposals ?? [];
  const currentProposal =
    all.find((p: any) => p.status === "submitted" || p.status === "accepted") ??
    null;

  const currentIdx = currentProposal
    ? all.findIndex((p: any) => p.id === currentProposal.id)
    : -1;

  const previousProposal =
    currentIdx >= 0
      ? (all.slice(currentIdx + 1).find((p: any) => !!p?.terms_snapshot) ??
        null)
      : null;

  const isBuyer = effectiveThread.buyer_user_id === userId;
  const isSender = currentProposal?.created_by_user_id === userId;
  const isResponder =
    !!currentProposal && !isSender && effectiveThread.status !== "accepted";

  return {
    currentProposal,
    previousProposal,
    isResponder,
    isSender,
    isBuyer,
    isOwnerSide: !isBuyer,
  };
}

// ============================================================
// Signature data helper
// ============================================================

type SignatureData = {
  packet: SignaturePacketView | null;
  recipients: SignatureRecipientView[];
  execAgreementUrl: string | null;
  certificateUrl: string | null;
};

async function loadSignatureData(
  svc: ReturnType<typeof createServiceClient>,
  dealId: string,
): Promise<SignatureData> {
  try {
    const { data: packet } = await (svc.from("deal_signature_packets") as any)
      .select(
        "id, status, provider, sent_at, completed_at, voided_at, declined_at, " +
        "executed_document_path, certificate_document_path"
      )
      .eq("deal_id", dealId)
      .order("packet_version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!packet) return { packet: null, recipients: [], execAgreementUrl: null, certificateUrl: null };

    const { data: recipRows } = await (svc.from("deal_signature_recipients") as any)
      .select("role, display_name, email, provider_status, signed_at")
      .eq("packet_id", packet.id)
      .order("routing_order", { ascending: true });

    const recipients: SignatureRecipientView[] = (recipRows ?? []).map((r: any) => ({
      role: r.role,
      display_name: r.display_name ?? null,
      email: r.email ?? null,
      provider_status: r.provider_status ?? null,
      signed_at: r.signed_at ?? null,
    }));

    let execAgreementUrl: string | null = null;
    let certificateUrl: string | null = null;

    if (packet.status === "completed") {
      try {
        const urls = await getArtifactSignedUrls(
          packet.executed_document_path ?? null,
          packet.certificate_document_path ?? null,
        );
        execAgreementUrl = urls.executed_agreement_url;
        certificateUrl = urls.certificate_url;
      } catch {
        // non-fatal
      }
    }

    return {
      packet: {
        id: packet.id,
        status: packet.status,
        provider: packet.provider ?? "docusign",
        sent_at: packet.sent_at ?? null,
        completed_at: packet.completed_at ?? null,
        voided_at: packet.voided_at ?? null,
        declined_at: packet.declined_at ?? null,
        executed_document_path: packet.executed_document_path ?? null,
        certificate_document_path: packet.certificate_document_path ?? null,
      },
      recipients,
      execAgreementUrl,
      certificateUrl,
    };
  } catch {
    return { packet: null, recipients: [], execAgreementUrl: null, certificateUrl: null };
  }
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
    .select(
      "id, owner_user_id, created_by_user_id, user_id, status, created_at, archived_at",
    )
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
      userRole === "OWNER" ||
      (deal as any).owner_user_id === user.id ||
      (deal as any).created_by_user_id === user.id ||
      (deal as any).user_id === user.id;

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

    const { data: candidateThreads } = await (svc.from("deal_threads") as any)
      .select("id, status, buyer_user_id, owner_user_id, created_at")
      .eq("deal_id", dealId)
      .in("status", ["pending_owner", "negotiating", "accepted"])
      .order("created_at", { ascending: false })
      .limit(5);

    const effectiveThread =
      candidateThreads && candidateThreads.length > 0
        ? candidateThreads[0]
        : null;

    const negState = await loadNegotiationState(svc, effectiveThread, user.id);

    const editingLocked =
      !!effectiveThread &&
      ["pending_owner", "negotiating", "accepted"].includes(
        effectiveThread.status,
      );

    const showNegotiationUi =
      !!effectiveThread &&
      ["pending_owner", "negotiating"].includes(effectiveThread.status);

    const effectiveSnapshot = toEffectiveSnapshot(
      negState.currentProposal?.terms_snapshot ?? null,
      snapJson,
    );

    const effectiveSnapshotRecord = safeRecord(effectiveSnapshot);
    const effectiveOutputs = safeRecord(
      (effectiveSnapshotRecord as any)?.outputs,
    );

    const inputs = safeRecord((effectiveSnapshotRecord as any)?.inputs);
    const results = safeRecord((effectiveOutputs as any)?.results);

    const { data: events } = await (svc.from("deal_events") as any)
      .select("id, deal_id, event_type, payload, created_by, created_at")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(50);

    const [sigData, adminResult] = await Promise.all([
      loadSignatureData(svc, dealId),
      requireAdmin(),
    ]);
    const isAdmin = adminResult.ok;

    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-5xl p-6 space-y-6">
          <DealPageShell
            dealId={dealId}
            isOwner={isOwner}
            locked={editingLocked}
            activeThread={effectiveThread}
            initialTitle={headerTitle}
            initialProperty={headerProperty}
            effectiveSnapshot={effectiveSnapshotRecord}
          />

          {effectiveThread?.status === "accepted" && (
            <AcceptedPendingReviewBanner />
          )}

          {showNegotiationUi && negState.isSender && effectiveThread && (
            <WaitingBanner
              threadId={effectiveThread.id}
              isBuyer={negState.isBuyer}
            />
          )}

          {showNegotiationUi &&
            negState.isResponder &&
            negState.currentProposal &&
            effectiveThread && (
              <NegotiationSection
                threadId={effectiveThread.id}
                proposalId={negState.currentProposal.id}
                proposalStatus={negState.currentProposal.status}
                currentTerms={negState.currentProposal.terms_snapshot ?? null}
                previousTerms={
                  negState.previousProposal?.terms_snapshot ?? null
                }
                isOwnerSide={negState.isOwnerSide}
              />
            )}

          {sigData.packet && (
            <SignatureCard
              dealId={dealId}
              threadStatus={effectiveThread?.status ?? null}
              packet={sigData.packet}
              recipients={sigData.recipients}
              isAdmin={isAdmin}
              execAgreementUrl={sigData.execAgreementUrl}
              certificateUrl={sigData.certificateUrl}
            />
          )}

          <DealDetailWidgetPanel
            dealId={dealId}
            initialSnapshot={effectiveSnapshotRecord}
            inputs={inputs}
            results={results}
            computeVersion={
              typeof (effectiveSnapshotRecord as any)?.compute_version ===
              "string"
                ? (effectiveSnapshotRecord as any).compute_version
                : null
            }
            canEdit={isOwner && !editingLocked}
            persona="homeowner"
          />

          {isOwner && !editingLocked && snapJson && (
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
                    effectiveThread,
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

  let allowDealFallback = ownerMatches;

  // Admin override: if no normal entitlement path matches, allow authenticated
  // admins to view the deal via the service-client fallback path.
  // fallbackIsOwner will be false (no edit rights), fallbackIsAdmin will be true.
  if (!allowDealFallback) {
    const adminCheck = await requireAdmin();
    if (adminCheck.ok) {
      allowDealFallback = true;
    }
  }

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

    const effectiveThread =
      thread &&
      ["pending_owner", "negotiating", "accepted"].includes(thread.status)
        ? thread
        : null;

    const negState = await loadNegotiationState(svc, effectiveThread, user.id);

    const editingLocked =
      !!effectiveThread &&
      ["pending_owner", "negotiating", "accepted"].includes(
        effectiveThread.status,
      );

    const showNegotiationUi =
      !!effectiveThread &&
      ["pending_owner", "negotiating"].includes(effectiveThread.status);

    const effectiveSnapshot = toEffectiveSnapshot(
      negState.currentProposal?.terms_snapshot ?? null,
      snapJson,
    );

    const effectiveSnapshotRecord = safeRecord(effectiveSnapshot);
    const effectiveOutputs = safeRecord(
      (effectiveSnapshotRecord as any)?.outputs,
    );

    const inputs = safeRecord((effectiveSnapshotRecord as any)?.inputs);
    const results = safeRecord((effectiveOutputs as any)?.results);

    const { data: events } = await (svc.from("deal_events") as any)
      .select("id, deal_id, event_type, payload, created_by, created_at")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(50);

    const fallbackCanEdit =
      (directOwnerMatches || threadOwnerMatches || grantMatches) &&
      !editingLocked;

    const fallbackIsOwner =
      directOwnerMatches || threadOwnerMatches || grantMatches;

    const [fallbackSigData, fallbackAdminResult] = await Promise.all([
      loadSignatureData(svc, dealId),
      requireAdmin(),
    ]);
    const fallbackIsAdmin = fallbackAdminResult.ok;

    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-5xl p-6 space-y-6">
          <DealPageShell
            dealId={dealId}
            isOwner={fallbackIsOwner}
            locked={editingLocked}
            activeThread={effectiveThread}
            initialTitle={headerTitle}
            initialProperty={headerProperty}
            effectiveSnapshot={effectiveSnapshotRecord}
          />

          {effectiveThread?.status === "accepted" && (
            <AcceptedPendingReviewBanner />
          )}

          {showNegotiationUi && negState.isSender && effectiveThread && (
            <WaitingBanner
              threadId={effectiveThread.id}
              isBuyer={negState.isBuyer}
            />
          )}

          {showNegotiationUi &&
            negState.isResponder &&
            negState.currentProposal &&
            effectiveThread && (
              <NegotiationSection
                threadId={effectiveThread.id}
                proposalId={negState.currentProposal.id}
                proposalStatus={negState.currentProposal.status}
                currentTerms={negState.currentProposal.terms_snapshot ?? null}
                previousTerms={
                  negState.previousProposal?.terms_snapshot ?? null
                }
                isOwnerSide={negState.isOwnerSide}
              />
            )}

          {fallbackSigData.packet && (
            <SignatureCard
              dealId={dealId}
              threadStatus={effectiveThread?.status ?? null}
              packet={fallbackSigData.packet}
              recipients={fallbackSigData.recipients}
              isAdmin={fallbackIsAdmin}
              execAgreementUrl={fallbackSigData.execAgreementUrl}
              certificateUrl={fallbackSigData.certificateUrl}
            />
          )}

          <DealDetailWidgetPanel
            dealId={dealId}
            initialSnapshot={effectiveSnapshotRecord}
            inputs={inputs}
            results={results}
            computeVersion={
              typeof (effectiveSnapshotRecord as any)?.compute_version ===
              "string"
                ? (effectiveSnapshotRecord as any).compute_version
                : null
            }
            canEdit={fallbackCanEdit}
            persona="homeowner"
          />

          {fallbackIsOwner && !editingLocked && snapJson && (
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
                    fallbackDeal,
                    offerEvErr: offerEvErr?.message ?? null,
                    offerEv: offerEv ?? null,
                    threadId,
                    resolvedThreadId,
                    thread,
                    property,
                    ownerMatches,
                    allowDealFallback,
                    effectiveThread,
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
