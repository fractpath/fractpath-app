import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { AppHeader } from "@/components/layout/AppHeader";
import { OnboardingGate } from "@/components/onboarding/OnboardingGate";

import { DealCard } from "@/components/dashboard/DealCard";
import {
  extractDealCardMeta,
  fmtMoneyAbbrev,
  fmtUpfrontPlusMonthly,
  fmtVestedProgress,
} from "@/lib/snapshotKpis";

type Persona = "homeowner" | "buyer" | "realtor";

const PERSONA_WELCOME: Record<
  Persona,
  { tagline: string; description: string }
> = {
  homeowner: {
    tagline: "Welcome, Homeowner",
    description: "You're exploring a new way to unlock equity without a loan.",
  },
  buyer: {
    tagline: "Welcome, Future Homeowner",
    description:
      "You're modeling a pathway to ownership through shared equity.",
  },
  realtor: {
    tagline: "Welcome, Partner",
    description: "You're participating as a referral partner and co-pilot.",
  },
};

const NEXT_STEPS: Record<Persona, string[]> = {
  homeowner: [
    "Schedule an intro call with our team",
    "Complete property appraisal coordination",
    "Connect with our title partner",
  ],
  buyer: [
    "Refine your terms and preferences",
    "Get matched with homeowner opportunities",
    "Review and finalize your pathway",
  ],
  realtor: [
    "Complete beta partner onboarding",
    "Set up your referral profile",
    "Access co-pilot resources",
  ],
};

const IN_PROGRESS_STATUSES = new Set([
  "DRAFT",
  "NEEDS_REVIEW",
  "UNDER_REVIEW",
  "ACTIVE",
  "IMPORTED",
]);

const ACTIVE_VALUE_STATUSES = new Set(["UNDER_REVIEW", "ACTIVE", "ACCEPTED"]);

const STATUS_DISPLAY: Record<string, string> = {
  IMPORTED: "Imported",
  DRAFT: "Draft",
  NEEDS_REVIEW: "Needs Review",
  UNDER_REVIEW: "Under Review",
  ACTIVE: "Active",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  ARCHIVED: "Archived",
  CLOSED: "Closed",
};

const STATUS_TONE: Record<string, string> = {
  DRAFT: "yellow",
  NEEDS_REVIEW: "amber",
  UNDER_REVIEW: "amber",
  ACTIVE: "green",
  ACCEPTED: "emerald",
  REJECTED: "red",
  ARCHIVED: "gray",
  CLOSED: "gray",
  IMPORTED: "blue",
};

const NOW_MS = Date.now();
const NOW_YEAR = new Date(NOW_MS).getFullYear();

function formatStatusLabel(raw: string): string {
  return STATUS_DISPLAY[raw.toUpperCase()] ?? raw;
}

function relativeAge(dateStr: string | null, nowMs: number): string {
  if (!dateStr) return "";
  const diff = nowMs - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return "Updated today";
  if (days === 1) return "Updated 1 day ago";
  if (days < 30) return `Updated ${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "Updated 1 month ago";
  return `Updated ${months} months ago`;
}

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: Promise<SearchParams>;
};

type CardVm = {
  dealId: string;
  href: string;
  title: string;
  secondaryFmvLabel: string | null;
  kpiLine: string | null;
  metaLine: string | null;
  statusLabel: string;
  statusTone: string;
  rawStatus: string;
  roleChipLabel: string | null;
  fmvRaw: number | null;
};

type NextStepVm = {
  key: string;
  title: string;
  description?: string | null;
  href: string;
  cta: string;
};

function pickFirst<T>(arr: T[] | null | undefined): T | null {
  return arr && arr.length ? arr[0] : null;
}

function safeRecord(v: unknown): Record<string, any> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, any>)
    : null;
}

function toEffectiveSnapshot(
  proposalTermsSnapshot: Record<string, any> | null,
  fallbackSnapshot: Record<string, any> | null,
): Record<string, any> | null {
  const proposal = safeRecord(proposalTermsSnapshot);
  const fallback = safeRecord(fallbackSnapshot);

  if (!proposal) return fallback;

  const proposalInputs = safeRecord(proposal.inputs);
  if (proposalInputs) {
    return {
      ...proposal,
      schema_version: proposal.schema_version ?? fallback?.schema_version ?? "1",
      compute_version:
        proposal.compute_version ?? fallback?.compute_version ?? null,
    };
  }

  const topLevelDealTerms = safeRecord(proposal.deal_terms);
  const topLevelScenario = safeRecord(proposal.scenario);

  if (topLevelDealTerms || topLevelScenario) {
    return {
      inputs: {
        deal_terms: topLevelDealTerms ?? {},
        scenario: topLevelScenario ?? {},
      },
      outputs: { results: null },
      schema_version: fallback?.schema_version ?? "1",
      compute_version: fallback?.compute_version ?? null,
    };
  }

  return fallback;
}

async function loadLatestSubmittedByThread(
  svc: ReturnType<typeof createServiceClient>,
  threadIds: string[],
) {
  const ids = Array.from(new Set(threadIds.filter(Boolean)));
  const map = new Map<string, any>();

  if (ids.length === 0) return map;

  const { data } = await (svc.from("deal_proposals") as any)
    .select(
      "thread_id, id, status, created_by_user_id, terms_snapshot, created_at",
    )
    .in("thread_id", ids)
    .eq("status", "submitted")
    .order("created_at", { ascending: false });

  for (const row of data ?? []) {
    if (row?.thread_id && !map.has(row.thread_id)) {
      map.set(row.thread_id, row);
    }
  }

  return map;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await Promise.resolve(searchParams as any)) as
    | SearchParams
    | undefined;

  const draftToken = (await cookies()).get("fractpath_draft_token")?.value;
  if (draftToken) {
    redirect(`/resume?token=${encodeURIComponent(draftToken)}`);
  }

  const createFailed =
    (typeof resolvedSearchParams?.create === "string"
      ? resolvedSearchParams.create
      : null) === "failed";

  const createCode =
    typeof resolvedSearchParams?.code === "string"
      ? resolvedSearchParams.code
      : null;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?returnTo=${encodeURIComponent("/dashboard")}`);
  }

  const personaFromMeta =
    user.user_metadata?.persona ?? user.user_metadata?.role;

  const persona: Persona =
    personaFromMeta === "homeowner" ||
    personaFromMeta === "buyer" ||
    personaFromMeta === "realtor"
      ? personaFromMeta
      : "homeowner";

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("nickname")
    .eq("user_id", user.id)
    .maybeSingle();

  const nickname: string | null =
    typeof profileRow?.nickname === "string" && profileRow.nickname.trim()
      ? profileRow.nickname.trim()
      : null;

  const baseWelcome = PERSONA_WELCOME[persona];
  const welcome = {
    ...baseWelcome,
    tagline: nickname ? `Welcome, ${nickname}` : baseWelcome.tagline,
  };

  let steps: any[] = NEXT_STEPS[persona] as any[];

  const grantsRes = await supabase
    .from("deal_access_grants")
    .select("deal_id, role, created_at")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  const svcEarly = createServiceClient();
  const userEmail = user.email?.toLowerCase() ?? "";

  const [ownerVisibleThreadsRes, acceptedOwnerThreadsRes, invitedThreadsRes] =
    await Promise.all([
      (svcEarly.from("deal_threads") as any)
        .select(
          `
        id,
        deal_id,
        status,
        property_id,
        buyer_user_id,
        properties!inner(owner_user_id)
      `,
        )
        .in("status", ["pending_owner", "negotiating"])
        .eq("properties.owner_user_id", user.id)
        .neq("buyer_user_id", user.id)
        .order("created_at", { ascending: false }),
      (svcEarly.from("deal_threads") as any)
        .select(
          `
        id,
        deal_id,
        status,
        property_id,
        buyer_user_id,
        properties!inner(owner_user_id)
      `,
        )
        .eq("status", "accepted")
        .eq("properties.owner_user_id", user.id)
        .neq("buyer_user_id", user.id)
        .order("created_at", { ascending: false }),
      userEmail
        ? (svcEarly.from("thread_invites") as any)
            .select("thread_id, intended_role, invitee_email")
            .eq("invitee_email", userEmail)
            .is("used_at", null)
            .eq("intended_role", "owner")
        : { data: [] },
    ]);

  const ownerVisibleThreads = ownerVisibleThreadsRes.data ?? [];
  const acceptedOwnerThreads = acceptedOwnerThreadsRes.data ?? [];

  const inviteThreadIds = (invitedThreadsRes.data ?? [])
    .map((inv: any) => inv?.thread_id)
    .filter(Boolean) as string[];

  let invitedThreads: any[] = [];
  if (inviteThreadIds.length > 0) {
    const { data: invThreads } = await (svcEarly.from("deal_threads") as any)
      .select("id, deal_id, status, property_id, buyer_user_id")
      .in("id", inviteThreadIds)
      .in("status", ["pending_owner", "negotiating"])
      .neq("buyer_user_id", user.id);
    invitedThreads = invThreads ?? [];
  }

  const ownerActionableThreadMap = new Map<string, any>();
  const ownerCandidateThreads = [...ownerVisibleThreads, ...invitedThreads];

  const ownerLatestSubmittedByThread = await loadLatestSubmittedByThread(
    svcEarly,
    ownerCandidateThreads
      .map((t: any) => t?.id)
      .filter(Boolean) as string[],
  );

  for (const t of ownerCandidateThreads) {
    if (!t?.id) continue;
    const latest = ownerLatestSubmittedByThread.get(t.id);
    if (!latest) continue;
    if (latest.created_by_user_id !== user.id) {
      ownerActionableThreadMap.set(t.id, t);
    }
  }

  const ownerActionableThreads = Array.from(ownerActionableThreadMap.values());

  const acceptedOwnerDealIds = new Set(
    (acceptedOwnerThreads as any[])
      .map((t: any) => t.deal_id)
      .filter(Boolean) as string[],
  );

  if (grantsRes.error) {
    return (
      <div>
        <AppHeader />
        <main className="mx-auto max-w-3xl p-6 space-y-8">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <div className="rounded-lg border p-4">
            <div className="text-sm font-medium">Couldn't load your deals</div>
            <div className="mt-2 text-sm text-muted-foreground break-words">
              {grantsRes.error.message}
            </div>
            <div className="mt-4">
              <Link className="text-sm underline" href="/me">
                Go to my account
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ------------------------------
  // Sprint 13 Phase 5: Dynamic Next Steps (minimal drift)
  // ------------------------------

  // 1) property needs verification
  const [{ data: myProperties }, { data: myThreads }] = await Promise.all([
    supabase
      .from("properties")
      .select("id,status,created_at")
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(25),

    supabase
      .from("deal_threads")
      .select(
        "id,status,deal_id,property_id,owner_user_id,buyer_user_id,created_at",
      )
      .or(`owner_user_id.eq.${user.id},buyer_user_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const threads = myThreads ?? [];
  const props = myProperties ?? [];

  const dealIdsWithThreads = new Set(
    threads.map((t: any) => t.deal_id).filter(Boolean) as string[],
  );

  const myLatestSubmittedByThread = await loadLatestSubmittedByThread(
    svcEarly,
    threads.map((t: any) => t?.id).filter(Boolean) as string[],
  );

  const buyerWaitingThreads = threads.filter((t: any) => {
    if (!["pending_owner", "negotiating"].includes(t.status)) return false;
    if (t.buyer_user_id !== user.id) return false;
    const latest = myLatestSubmittedByThread.get(t.id);
    return !!latest && latest.created_by_user_id === user.id;
  });

  const buyerWaitingStatusByDealId = new Map<string, { label: string; tone: string; raw: string }>();
  for (const t of buyerWaitingThreads) {
    if (!t?.deal_id) continue;
    buyerWaitingStatusByDealId.set(
      t.deal_id,
      t.status === "negotiating"
        ? { label: "Counter submitted", tone: "blue", raw: "COUNTER_SUBMITTED" }
        : { label: "Offer submitted", tone: "blue", raw: "OFFER_SUBMITTED" },
    );
  }

  const buyerPendingDealIds = new Set(
    buyerWaitingThreads.map((t: any) => t.deal_id).filter(Boolean) as string[],
  );

  const pendingOwnerDealIds = Array.from(
    new Set(
      ownerActionableThreads
        .map((t: any) => t?.deal_id)
        .filter(Boolean) as string[],
    ),
  );
  const acceptedThreadDealIds = new Set(
    threads
      .filter((t: any) => t.status === "accepted")
      .map((t: any) => t.deal_id)
      .filter(Boolean) as string[],
  );

  const declinedThreadDealIds = new Set(
    threads
      .filter((t: any) => t.status === "closed")
      .map((t: any) => t.deal_id)
      .filter(Boolean) as string[],
  );

  // deals I own (for "ready to submit" check)
  const myDealsRes = await supabase
    .from("deals")
    .select("id,created_at,created_by_user_id,user_id")
    .or(`created_by_user_id.eq.${user.id},user_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(50);

  const myDeals = myDealsRes.data ?? [];
  const myDealIds = myDeals.map((d: any) => d.id).filter(Boolean) as string[];

  // snapshots for my deals (presence indicates "ready")
  const mySnapshotsRes =
    myDealIds.length > 0
      ? await supabase
          .from("deal_snapshots")
          .select("deal_id,created_at")
          .in("deal_id", myDealIds)
          .order("created_at", { ascending: false })
      : { data: [] as any[] };

  const mySnapshots = (mySnapshotsRes as any).data ?? [];
  const hasSnapshot = (dealId: string) =>
    mySnapshots.some((s: any) => s.deal_id === dealId);

  // Priority 1: needs verification
  const needsVerification = pickFirst(
    props.filter((p: any) => p.status && p.status !== "verified"),
  );

  // Priority 2: owner has offer to review (via property ownership OR invite email)
  const ownerPendingThread = pickFirst(ownerActionableThreads);

  // Priority 3: buyer deal ready to submit (owned by me + has snapshot + no active thread)
  const buyerReadyDeal = pickFirst(
    myDeals.filter((d: any) => {
      const dealId = d.id as string;
      const ownedByMe =
        d.created_by_user_id === user.id || d.user_id === user.id;
      return (
        ownedByMe && hasSnapshot(dealId) && !dealIdsWithThreads.has(dealId)
      );
    }),
  );

  // Priority 4: buyer waiting for owner
  const buyerWaitingThread = pickFirst(buyerWaitingThreads);

  const dynamicSteps: any[] = [];

  if (needsVerification) {
    dynamicSteps.push({
      key: "verify-property",
      title: "Verify your property",
      description: "Complete verification to unlock offers and deal workflows.",
      href: "/me",
      cta: "Go to verification",
    });
  } else if (ownerPendingThread?.deal_id) {
    dynamicSteps.push({
      key: "owner-review-offer",
      title: "Review an offer",
      description: "You have a deal waiting for your review.",
      href: `/deal/${ownerPendingThread.deal_id}#offer`,
      cta: "Review offer",
    });
  } else if (buyerReadyDeal?.id) {
    dynamicSteps.push({
      key: "buyer-submit-offer",
      title: "Submit your offer",
      description:
        "Your deal has a snapshot and is ready to send to the owner.",
      href: `/deal/${buyerReadyDeal.id}#offer`,
      cta: "Submit offer",
    });
  } else if (buyerWaitingThread?.deal_id) {
    dynamicSteps.push({
      key: "buyer-waiting",
      title: "Waiting on the owner",
      description: "Your offer is pending the owner’s review.",
      href: `/deal/${buyerWaitingThread.deal_id}#offer`,
      cta: "View offer",
    });
  }

  if (dynamicSteps.length) {
    steps = dynamicSteps;
  }

  // (rest of your DashboardPage continues unchanged…)

  const grants = grantsRes.data ?? [];

  const dealsRes =
    grants.length > 0
      ? await supabase
          .from("deals")
          .select("id, status, owner_user_id, mode, archived_at")
          .in(
            "id",
            grants.map((g) => g.deal_id),
          )
      : { data: [], error: null as any };

  const deals = ((dealsRes.data ?? []) as Record<string, any>[]).filter(
    (d) => !d.archived_at,
  );
  const byId = new Map<string, Record<string, any>>();
  for (const d of deals) byId.set(d.id, d);

  const dealIds = grants.map((g) => g.deal_id);

  const snapRes =
    dealIds.length > 0
      ? await supabase
          .from("deal_snapshots")
          .select("deal_id, snapshot_json, created_at")
          .in("deal_id", dealIds)
          .order("created_at", { ascending: false })
      : { data: [], error: null as any };

  const latestSnapByDeal = new Map<string, Record<string, any>>();
  const snapDateByDeal = new Map<string, string>();
  for (const s of snapRes.data ?? []) {
    if (s?.deal_id && s.snapshot_json && !latestSnapByDeal.has(s.deal_id)) {
      latestSnapByDeal.set(s.deal_id, s.snapshot_json);
    }
    if (s?.deal_id && s.created_at && !snapDateByDeal.has(s.deal_id)) {
      snapDateByDeal.set(s.deal_id, s.created_at);
    }
  }

  const allThreadIdsForEffectiveState = Array.from(
    new Set(
      [...threads, ...ownerVisibleThreads, ...invitedThreads]
        .map((t: any) => t?.id)
        .filter(Boolean) as string[],
    ),
  );

  const latestSubmittedByThread = await loadLatestSubmittedByThread(
    svcEarly,
    allThreadIdsForEffectiveState,
  );

  const effectiveSnapshotByDeal = new Map<string, Record<string, any>>();
  const effectiveStatusByDealId = new Map<
    string,
    { label: string; tone: string; raw: string }
  >();

  const threadCandidates = [...threads, ...ownerVisibleThreads, ...invitedThreads];
  const latestThreadByDealId = new Map<string, any>();

  for (const t of threadCandidates) {
    if (!t?.deal_id) continue;
    if (!latestThreadByDealId.has(t.deal_id)) {
      latestThreadByDealId.set(t.deal_id, t);
    }
  }

  for (const [dealId, thread] of latestThreadByDealId.entries()) {
    const proposal = latestSubmittedByThread.get(thread.id) ?? null;
    const fallbackSnap = latestSnapByDeal.get(dealId) ?? null;
    const effectiveSnap = toEffectiveSnapshot(
      proposal?.terms_snapshot ?? null,
      fallbackSnap,
    );

    if (effectiveSnap) {
      effectiveSnapshotByDeal.set(dealId, effectiveSnap);
    }

    if (proposal) {
      const isSender = proposal.created_by_user_id === user.id;
      const hasPriorRound = thread.status === "negotiating";

      if (isSender) {
        effectiveStatusByDealId.set(
          dealId,
          hasPriorRound
            ? {
                label: "Counter submitted",
                tone: "blue",
                raw: "COUNTER_SUBMITTED",
              }
            : {
                label: "Offer submitted",
                tone: "blue",
                raw: "OFFER_SUBMITTED",
              },
        );
      } else {
        effectiveStatusByDealId.set(
          dealId,
          hasPriorRound
            ? {
                label: "Counter offer",
                tone: "amber",
                raw: "COUNTER_OFFER",
              }
            : {
                label: "Awaiting approval",
                tone: "amber",
                raw: "AWAITING_APPROVAL",
              },
        );
      }
    }
  }

  for (const id of acceptedOwnerDealIds) {
    acceptedThreadDealIds.add(id);
  }

  const threadRelatedDealIds = [
    ...pendingOwnerDealIds,
    ...Array.from(acceptedThreadDealIds),
  ];

  if (threadRelatedDealIds.length > 0) {
    const svc = createServiceClient();
    const extraIds = threadRelatedDealIds.filter((id) => !byId.has(id));
    if (extraIds.length > 0) {
      const [extraDealsRes, extraSnapsRes] = await Promise.all([
        (svc.from("deals") as any)
          .select("id, owner_user_id, status, created_at, archived_at")
          .in("id", extraIds)
          .is("archived_at", null),
        (svc.from("deal_snapshots") as any)
          .select("deal_id, snapshot_json, created_at")
          .in("deal_id", extraIds)
          .order("created_at", { ascending: false }),
      ]);
      for (const d of extraDealsRes.data ?? []) {
        if (d?.id) byId.set(d.id, d);
      }
      for (const s of extraSnapsRes.data ?? []) {
        if (s?.deal_id && s.snapshot_json && !latestSnapByDeal.has(s.deal_id)) {
          latestSnapByDeal.set(s.deal_id, s.snapshot_json);
        }
        if (s?.deal_id && s.created_at && !snapDateByDeal.has(s.deal_id)) {
          snapDateByDeal.set(s.deal_id, s.created_at);
        }
      }
    }
  }

  const allKnownDealIds = Array.from(byId.keys());
  const headerEventByDeal = new Map<string, Record<string, any>>();
  const sigPacketsByDealId = new Map<string, any>();

  const acceptedDealIdsForSig = Array.from(acceptedThreadDealIds);

  const [headerFetchResult, sigFetchResult] = await Promise.all([
    allKnownDealIds.length > 0
      ? ((): Promise<any> => {
          const svcHeaders = createServiceClient();
          return (svcHeaders.from("deal_events") as any)
            .select("deal_id, payload")
            .in("deal_id", allKnownDealIds)
            .eq("event_type", "DEAL_HEADER_UPDATED")
            .order("created_at", { ascending: false });
        })()
      : Promise.resolve({ data: [] }),
    acceptedDealIdsForSig.length > 0
      ? ((): Promise<any> => {
          const svcSig = createServiceClient();
          return (svcSig.from("deal_signature_packets") as any)
            .select(
              "deal_id, status, packet_version, sent_at, completed_at, declined_at, voided_at, updated_at, created_at",
            )
            .in("deal_id", acceptedDealIdsForSig)
            .order("created_at", { ascending: false });
        })()
      : Promise.resolve({ data: [] }),
  ]);

  for (const ev of headerFetchResult.data ?? []) {
    if (ev?.deal_id && ev?.payload && !headerEventByDeal.has(ev.deal_id)) {
      headerEventByDeal.set(ev.deal_id, ev.payload);
    }
  }

  for (const pkt of sigFetchResult.data ?? []) {
    if (pkt?.deal_id && !sigPacketsByDealId.has(pkt.deal_id)) {
      sigPacketsByDealId.set(pkt.deal_id, pkt);
    }
  }

  function getHeaderForDeal(dealId: string): {
    title: string | null;
    display_address: string | null;
    property_id: string | null;
    property_status: string | null;
    ownership_status: string | null;
  } {
    const ev = headerEventByDeal.get(dealId);
    const snap = latestSnapByDeal.get(dealId);
    const h = snap?.meta?.header ?? null;

    return {
      title:
        (typeof ev?.title === "string" ? ev.title : null) ??
        (typeof h?.title === "string" ? h.title : null),
      display_address:
        (typeof ev?.display_address === "string" ? ev.display_address : null) ??
        (typeof h?.display_address === "string" ? h.display_address : null),
      property_id:
        (typeof ev?.property_id === "string" ? ev.property_id : null) ??
        (typeof h?.property_id === "string" ? h.property_id : null),
      property_status:
        (typeof ev?.property_status === "string" ? ev.property_status : null) ??
        (typeof h?.property_status === "string" ? h.property_status : null),
      ownership_status:
        (typeof ev?.ownership_status === "string" ? ev.ownership_status : null) ??
        (typeof h?.ownership_status === "string" ? h.ownership_status : null),
    };
  }

  type SigNotificationVm = {
    dealId: string;
    href: string;
    dealTitle: string;
    dealAddress: string | null;
    milestoneLabel: string;
    tone: string;
    timestamp: string | null;
    priority: number;
  };

  const SIG_MILESTONE_MAP: Record<
    string,
    { label: string; tone: string; priority: number }
  > = {
    prepared: { label: "Agreement prepared", tone: "amber", priority: 2 },
    sent: { label: "Signature request sent", tone: "blue", priority: 2 },
    delivered: { label: "Signature request sent", tone: "blue", priority: 2 },
    partially_signed: { label: "Partially signed", tone: "blue", priority: 2 },
    completed: {
      label: "Agreement fully executed",
      tone: "emerald",
      priority: 1,
    },
    declined: { label: "Signature declined", tone: "red", priority: 1 },
    voided: { label: "Signature voided", tone: "gray", priority: 3 },
    error: { label: "Signature needs attention", tone: "red", priority: 1 },
  };

  const SIG_TONE_CLASSES: Record<string, string> = {
    amber: "bg-amber-100 text-amber-800",
    blue: "bg-blue-100 text-blue-800",
    emerald: "bg-emerald-100 text-emerald-800",
    red: "bg-red-100 text-red-800",
    gray: "bg-gray-100 text-gray-700",
  };

  const sigNotifications: SigNotificationVm[] = [];
  for (const [dealId, pkt] of sigPacketsByDealId.entries()) {
    const milestone = SIG_MILESTONE_MAP[pkt.status as string];
    if (!milestone) continue;
    const header = getHeaderForDeal(dealId);
    const ts: string | null =
      pkt.completed_at ??
      pkt.declined_at ??
      pkt.voided_at ??
      pkt.sent_at ??
      pkt.updated_at ??
      pkt.created_at ??
      null;
    sigNotifications.push({
      dealId,
      href: `/deal/${dealId}`,
      dealTitle:
        (header.title ?? "").trim() !== "" ? header.title! : "Untitled deal",
      dealAddress: header.display_address,
      milestoneLabel: milestone.label,
      tone: milestone.tone,
      timestamp: ts,
      priority: milestone.priority,
    });
  }
  sigNotifications.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tb - ta;
  });

  function buildCardVm(
    dealId: string,
    grantRole: string,
    overrideStatus?: { label: string; tone: string; raw: string },
  ): CardVm {
    const deal = byId.get(dealId);
    const snap = effectiveSnapshotByDeal.get(dealId) ?? latestSnapByDeal.get(dealId);
    const meta = extractDealCardMeta(snap);

    const header = getHeaderForDeal(dealId);

    const inferredStatus = effectiveStatusByDealId.get(dealId);
    const rawStatus =
      overrideStatus?.raw ??
      inferredStatus?.raw ??
      (((deal?.status as string) || "IMPORTED").toUpperCase());
    const statusLabel =
      overrideStatus?.label ??
      inferredStatus?.label ??
      formatStatusLabel(rawStatus);
    const tone =
      overrideStatus?.tone ??
      inferredStatus?.tone ??
      (STATUS_TONE[rawStatus] ?? "gray");

    const href =
      grantRole === "OWNER" ? `/deal/${dealId}` : `/deal/${dealId}?mode=shared`;

    const title = (header.title ?? "").trim() || "Untitled deal";

    const propertyLabel =
      (header.display_address ?? "").trim() ||
      (meta.addressTitle ?? "").trim() ||
      "No property selected";

    const secondaryFmvLabel = propertyLabel;

    const fmvStr = meta.fmv != null ? fmtMoneyAbbrev(meta.fmv) : null;

    const upfrontMonthly = fmtUpfrontPlusMonthly(meta.upfront, meta.monthly);
    const vestedStr =
      meta.vested.totalPct != null
        ? fmtVestedProgress(meta.vested.currentPct, meta.vested.totalPct)
        : null;

    const kpiParts: string[] = [];
    if (upfrontMonthly !== "\u2014") kpiParts.push(upfrontMonthly);
    if (fmvStr) kpiParts.push(`FMV ${fmvStr}`);
    if (vestedStr) kpiParts.push(vestedStr);

    const kpiLine = kpiParts.length > 0 ? kpiParts.join("  \u00B7  ") : null;

    const exitStr =
      meta.exitYear != null ? `Exit ${NOW_YEAR + meta.exitYear}` : null;

    const metaParts: string[] = [];
    if (exitStr) metaParts.push(exitStr);

    const updated = relativeAge(snapDateByDeal.get(dealId) ?? null, NOW_MS);
    if (updated) metaParts.push(updated);

    const metaLine = metaParts.length > 0 ? metaParts.join("  \u00B7  ") : null;

    return {
      dealId,
      href,
      title,
      secondaryFmvLabel,
      kpiLine,
      metaLine,
      statusLabel,
      statusTone: tone,
      rawStatus,
      roleChipLabel: grantRole === "VIEWER" ? "Shared" : null,
      fmvRaw: meta.fmv,
    };
  }

  const BUYER_SUBMITTED_STATUS = {
    label: "Offer submitted",
    tone: "blue",
    raw: "OFFER_SUBMITTED",
  };
  const BUYER_COUNTER_SUBMITTED_STATUS = {
    label: "Counter submitted",
    tone: "blue",
    raw: "COUNTER_SUBMITTED",
  };
  const OWNER_AWAITING_STATUS = {
    label: "Awaiting approval",
    tone: "amber",
    raw: "AWAITING_APPROVAL",
  };
  const ACTIVE_DEAL_STATUS = { label: "Active", tone: "green", raw: "ACTIVE" };

  const pendingOwnerDealIdSetForFilter = new Set(pendingOwnerDealIds);

  const ownerCards = grants
    .filter((g) => g.role === "OWNER")
    .filter((g) => byId.has(g.deal_id))
    .filter((g) => !pendingOwnerDealIdSetForFilter.has(g.deal_id))
    .filter((g) => !acceptedThreadDealIds.has(g.deal_id))
    .filter((g) => !declinedThreadDealIds.has(g.deal_id))
    .map((g) => {
      const override =
        buyerWaitingStatusByDealId.get(g.deal_id) ??
        (buyerPendingDealIds.has(g.deal_id)
          ? BUYER_SUBMITTED_STATUS
          : undefined);

      return buildCardVm(g.deal_id, g.role, override);
    });

  const viewerCards = grants
    .filter((g) => g.role === "VIEWER")
    .filter((g) => byId.has(g.deal_id))
    .map((g) => buildCardVm(g.deal_id, g.role));

  const pendingApprovalCards = pendingOwnerDealIds
    .filter((id) => byId.has(id))
    .map((dealId) =>
      buildCardVm(dealId, "OWNER", OWNER_AWAITING_STATUS),
    ).map((vm) => ({ ...vm, href: `/deal/${vm.dealId}#offer` }));

  const activeDealCardIds = Array.from(acceptedThreadDealIds).filter((id) =>
    byId.has(id),
  );
  const activeCards = activeDealCardIds.map((dealId) =>
    buildCardVm(dealId, "OWNER", ACTIVE_DEAL_STATUS),
  );

  const allCards = [...ownerCards, ...viewerCards, ...activeCards];

  const totalDeals = allCards.length;
  const inProgress = allCards.filter((c) =>
    IN_PROGRESS_STATUSES.has(c.rawStatus),
  ).length;
  const sharedCount = viewerCards.length;
  const followUpsDue = 0;

  const totalPotentialValue = [...ownerCards, ...activeCards].reduce(
    (sum, c) => sum + (c.fmvRaw ?? 0),
    0,
  );
  const totalActiveValue = [...ownerCards, ...activeCards]
    .filter((c) => ACTIVE_VALUE_STATUSES.has(c.rawStatus))
    .reduce((sum, c) => sum + (c.fmvRaw ?? 0), 0);

  return (
    <div>
      <AppHeader />
      <OnboardingGate />
      <main className="mx-auto max-w-3xl p-6 space-y-8">
        <header>
          <h1 className="text-2xl font-semibold">{welcome.tagline}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {welcome.description}
          </p>
        </header>

        {createFailed ? (
          <div className="rounded-lg border p-4">
            <div className="text-sm font-medium">Deal creation failed</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Please try again.{" "}
              {createCode ? (
                <span className="break-words">Error code: {createCode}</span>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-lg border bg-background p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Total Deals
            </div>
            <div className="mt-1 text-lg font-semibold">{totalDeals}</div>
          </div>
          <div className="rounded-lg border bg-background p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              In Progress
            </div>
            <div className="mt-1 text-lg font-semibold">{inProgress}</div>
          </div>
          <div className="rounded-lg border bg-background p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Shared With Me
            </div>
            <div className="mt-1 text-lg font-semibold">{sharedCount}</div>
          </div>
          <div className="rounded-lg border bg-background p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Follow-ups Due
            </div>
            <div className="mt-1 text-lg font-semibold">{followUpsDue}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border bg-background p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Total Potential Value
            </div>
            <div className="mt-1 text-lg font-semibold">
              {totalPotentialValue > 0
                ? fmtMoneyAbbrev(totalPotentialValue)
                : "\u2014"}
            </div>
          </div>
          <div className="rounded-lg border bg-background p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Total Active Value
            </div>
            <div className="mt-1 text-lg font-semibold">
              {totalActiveValue > 0
                ? fmtMoneyAbbrev(totalActiveValue)
                : "\u2014"}
            </div>
          </div>
        </div>

        <section className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Next steps</h2>
            <p className="text-sm text-muted-foreground">
              Your personalized action items
            </p>
          </div>

          <div className="rounded-lg border p-5">
            <ol className="list-decimal pl-5 text-sm text-muted-foreground space-y-1.5">
              {steps.map((step: any, i: number) => {
                const title =
                  typeof step === "string"
                    ? step
                    : typeof step?.title === "string"
                      ? step.title
                      : typeof step?.label === "string"
                        ? step.label
                        : "Next step";

                const href =
                  typeof step?.href === "string"
                    ? step.href
                    : typeof step?.to === "string"
                      ? step.to
                      : null;

                const cta =
                  typeof step?.cta === "string"
                    ? step.cta
                    : typeof step?.actionLabel === "string"
                      ? step.actionLabel
                      : null;

                return (
                  <li key={i}>
                    {href ? (
                      <Link
                        href={href}
                        className="underline hover:text-foreground"
                      >
                        {title}
                        {cta ? ` — ${cta}` : ""}
                      </Link>
                    ) : (
                      title
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {pendingApprovalCards.length > 0 && (
          <section className="space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">Offers waiting approval</h2>
                <span className="inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-800 text-xs font-semibold min-w-[20px] h-5 px-1.5">
                  {pendingApprovalCards.length}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Review and decide on pending offers
              </p>
            </div>

            <div className="space-y-2">
              {pendingApprovalCards.map((vm) => (
                <DealCard
                  key={vm.dealId}
                  href={vm.href}
                  title={vm.title}
                  secondaryFmvLabel={vm.secondaryFmvLabel}
                  kpiLine={vm.kpiLine}
                  metaLine={vm.metaLine}
                  statusLabel={vm.statusLabel}
                  statusTone={vm.statusTone}
                  roleChipLabel={vm.roleChipLabel}
                />
              ))}
            </div>
          </section>
        )}

        {activeCards.length > 0 && (
          <section className="space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">Active Deals</h2>
                <span className="inline-flex items-center justify-center rounded-full bg-green-100 text-green-800 text-xs font-semibold min-w-[20px] h-5 px-1.5">
                  {activeCards.length}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Deals with accepted offers
              </p>
            </div>

            <div className="space-y-2">
              {activeCards.map((vm) => (
                <DealCard
                  key={vm.dealId}
                  href={vm.href}
                  title={vm.title}
                  secondaryFmvLabel={vm.secondaryFmvLabel}
                  kpiLine={vm.kpiLine}
                  metaLine={vm.metaLine}
                  statusLabel={vm.statusLabel}
                  statusTone={vm.statusTone}
                  roleChipLabel={vm.roleChipLabel}
                />
              ))}
            </div>
          </section>
        )}

        {sigNotifications.length > 0 && (
          <section className="space-y-4" data-testid="signature-milestones-section">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">Signature milestones</h2>
                <span className="inline-flex items-center justify-center rounded-full bg-blue-100 text-blue-800 text-xs font-semibold min-w-[20px] h-5 px-1.5">
                  {sigNotifications.length}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Agreement signature status for your active deals
              </p>
            </div>

            <div className="rounded-lg border divide-y overflow-hidden">
              {sigNotifications.map((n) => (
                <a
                  key={n.dealId}
                  href={n.href}
                  className="flex items-start justify-between p-4 hover:bg-muted/50 transition-colors"
                  data-testid="sig-notification-row"
                >
                  <div className="space-y-0.5 min-w-0 mr-3">
                    <div className="text-sm font-medium truncate">{n.dealTitle}</div>
                    {n.dealAddress && (
                      <div className="text-xs text-muted-foreground truncate">
                        {n.dealAddress}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${SIG_TONE_CLASSES[n.tone] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      {n.milestoneLabel}
                    </span>
                    {n.timestamp && (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {relativeAge(n.timestamp, NOW_MS)}
                      </span>
                    )}
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">My deals</h2>
              <p className="text-sm text-muted-foreground">
                Deals you own and manage
              </p>
            </div>
            <Link
              href="/deal/new"
              className="inline-flex items-center rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background"
            >
              + Create Deal
            </Link>
          </div>

          {ownerCards.length === 0 ? (
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">
                You don't have any deals yet. Create one to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {ownerCards.map((vm) => (
                <DealCard
                  key={vm.dealId}
                  href={vm.href}
                  title={vm.title}
                  secondaryFmvLabel={vm.secondaryFmvLabel}
                  kpiLine={vm.kpiLine}
                  metaLine={vm.metaLine}
                  statusLabel={vm.statusLabel}
                  statusTone={vm.statusTone}
                  roleChipLabel={vm.roleChipLabel}
                />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Shared with me</h2>
            <p className="text-sm text-muted-foreground">
              Deals others have shared with you
            </p>
          </div>

          {viewerCards.length === 0 ? (
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">
                Nothing has been shared with you yet.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {viewerCards.map((vm) => (
                <DealCard
                  key={vm.dealId}
                  href={vm.href}
                  title={vm.title}
                  secondaryFmvLabel={vm.secondaryFmvLabel}
                  kpiLine={vm.kpiLine}
                  metaLine={vm.metaLine}
                  statusLabel={vm.statusLabel}
                  statusTone={vm.statusTone}
                  roleChipLabel={vm.roleChipLabel}
                />
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border p-5">
          <h2 className="text-lg font-semibold">Need help?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Our team is here to guide you through every step.
          </p>
          <a
            href="mailto:support@fractpath.com"
            className="mt-3 inline-block rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            Contact FractPath
          </a>
        </section>

        <footer className="pt-4 border-t text-xs text-muted-foreground text-center">
          Signed in as {user.email}
        </footer>
      </main>
    </div>
  );
}
