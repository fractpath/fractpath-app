import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
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
  searchParams?: SearchParams | Promise<SearchParams>;
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

  const welcome = PERSONA_WELCOME[persona];
  const steps = NEXT_STEPS[persona];

  const grantsRes = await supabase
    .from("deal_access_grants")
    .select("deal_id, role, created_at")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

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

  const grants = grantsRes.data ?? [];

  const dealsRes =
    grants.length > 0
      ? await supabase
          .from("deals")
          .select("id, status, owner_user_id, mode")
          .in(
            "id",
            grants.map((g) => g.deal_id),
          )
      : { data: [], error: null as any };

  const deals = (dealsRes.data ?? []) as Record<string, any>[];
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

  function getHeaderFromSnapshot(snap: any): {
    title: string | null;
    display_address: string | null;
    property_id: string | null;
    property_status: string | null;
    ownership_status: string | null;
  } {
    const h = snap?.meta?.header ?? null;
    return {
      title: typeof h?.title === "string" ? h.title : null,
      display_address:
        typeof h?.display_address === "string" ? h.display_address : null,
      property_id: typeof h?.property_id === "string" ? h.property_id : null,
      property_status:
        typeof h?.property_status === "string" ? h.property_status : null,
      ownership_status:
        typeof h?.ownership_status === "string" ? h.ownership_status : null,
    };
  }

  function buildCardVm(dealId: string, grantRole: string): CardVm {
    const deal = byId.get(dealId);
    const snap = latestSnapByDeal.get(dealId);
    const meta = extractDealCardMeta(snap);

    const header = getHeaderFromSnapshot(snap);

    const rawStatus = ((deal?.status as string) || "IMPORTED").toUpperCase();
    const statusLabel = formatStatusLabel(rawStatus);
    const tone = STATUS_TONE[rawStatus] ?? "gray";

    const href =
      grantRole === "OWNER"
        ? `/deal/${dealId}`
        : `/deal/${dealId}?mode=shared`;

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

    const metaLine =
      metaParts.length > 0 ? metaParts.join("  \u00B7  ") : null;

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

  const ownerCards = grants
    .filter((g) => g.role === "OWNER")
    .map((g) => buildCardVm(g.deal_id, g.role));

  const viewerCards = grants
    .filter((g) => g.role === "VIEWER")
    .map((g) => buildCardVm(g.deal_id, g.role));

  const allCards = [...ownerCards, ...viewerCards];

  const totalDeals = allCards.length;
  const inProgress = allCards.filter((c) =>
    IN_PROGRESS_STATUSES.has(c.rawStatus),
  ).length;
  const sharedCount = viewerCards.length;
  const followUpsDue = 0;

  const totalPotentialValue = ownerCards.reduce(
    (sum, c) => sum + (c.fmvRaw ?? 0),
    0,
  );
  const totalActiveValue = ownerCards
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
                {steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          </section>

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

              {ownerCards.length === 0 ? (
                <Link
                  href="/deal/new"
                  className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 transition-colors hover:bg-muted/40 cursor-pointer"
                >
                  <span className="text-2xl text-muted-foreground">+</span>
                  <span className="text-sm font-medium">Create Deal</span>
                  <span className="text-xs text-muted-foreground">
                    Start a new scenario
                  </span>
                </Link>
              ) : null}
            </div>
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
