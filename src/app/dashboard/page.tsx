import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/layout/AppHeader";
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

const ACTIVE_VALUE_STATUSES = new Set([
  "UNDER_REVIEW",
  "ACTIVE",
  "ACCEPTED",
]);

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

function formatStatusLabel(raw: string): string {
  return STATUS_DISPLAY[raw.toUpperCase()] ?? raw;
}

function relativeAge(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return "Updated today";
  if (days === 1) return "Updated 1d ago";
  if (days < 30) return `Updated ${days}d ago`;
  const months = Math.floor(days / 30);
  return `Updated ${months}mo ago`;
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
  roleChipLabel: string;
  fmvRaw: number | null;
  dealStatus: string;
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

  const role: Persona =
    (user.user_metadata?.role as Persona | undefined) || "homeowner";
  const welcome = PERSONA_WELCOME[role];
  const steps = NEXT_STEPS[role];

  const grantsRes = await supabase
    .from("deal_access_grants")
    .select("deal_id, role, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (grantsRes.error) {
    return (
      <div>
        <AppHeader />
        <main className="mx-auto max-w-3xl p-6">
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="text-xl font-semibold">Dashboard</h1>
            <div className="text-sm text-muted-foreground">{user.email}</div>
          </div>

          <div className="mt-6 rounded-md border p-4">
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

  const snapRes =
    grants.length > 0
      ? await supabase
          .from("deal_latest_snapshots")
          .select("deal_id, snapshot_json, created_at")
          .in(
            "deal_id",
            grants.map((g) => g.deal_id),
          )
      : { data: [], error: null as any };

  const latestSnapByDeal = new Map<string, Record<string, any>>();
  const snapDateByDeal = new Map<string, string>();
  for (const s of snapRes.data ?? []) {
    if (s?.deal_id && s.snapshot_json) {
      latestSnapByDeal.set(s.deal_id, s.snapshot_json);
    }
    if (s?.deal_id && s.created_at) {
      snapDateByDeal.set(s.deal_id, s.created_at);
    }
  }

  function buildCardVm(dealId: string, grantRole: string): CardVm {
    const deal = byId.get(dealId);
    const snap = latestSnapByDeal.get(dealId);
    const meta = extractDealCardMeta(snap);

    const dealStatus = (deal?.status as string) || "IMPORTED";
    const statusLabel = formatStatusLabel(dealStatus);

    const href =
      grantRole === "OWNER" ? `/deal/${dealId}` : `/deal/${dealId}?mode=shared`;

    const title =
      meta.addressTitle ||
      deal?.title ||
      deal?.name ||
      deal?.address ||
      deal?.property_address ||
      deal?.home_address ||
      dealId;

    const secondaryFmvLabel = meta.fmv != null
      ? `FMV ${fmtMoneyAbbrev(meta.fmv)}`
      : null;

    const kpiLine = fmtUpfrontPlusMonthly(meta.upfront, meta.monthly);

    const parts: string[] = [];
    if (meta.exitYear != null) parts.push(`Exit Year ${meta.exitYear}`);
    parts.push(fmtVestedProgress(meta.vested.currentPct, meta.vested.totalPct));
    const age = relativeAge(snapDateByDeal.get(dealId) ?? null);
    if (age) parts.push(age);
    const metaLine = parts.filter(Boolean).join(" \u2022 ");

    return {
      dealId,
      href,
      title,
      secondaryFmvLabel,
      kpiLine: kpiLine === "\u2014" ? null : kpiLine,
      metaLine: metaLine || null,
      statusLabel,
      roleChipLabel: grantRole === "OWNER" ? "Owner" : "Shared",
      fmvRaw: meta.fmv,
      dealStatus: dealStatus.toUpperCase(),
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
    IN_PROGRESS_STATUSES.has(c.dealStatus),
  ).length;
  const sharedCount = viewerCards.length;

  const totalPotentialValue = ownerCards.reduce(
    (sum, c) => sum + (c.fmvRaw ?? 0),
    0,
  );
  const totalActiveValue = ownerCards
    .filter((c) => ACTIVE_VALUE_STATUSES.has(c.dealStatus))
    .reduce((sum, c) => sum + (c.fmvRaw ?? 0), 0);

  return (
    <div>
      <AppHeader />
      <main className="mx-auto max-w-3xl p-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">{welcome.tagline}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {welcome.description}
          </p>
        </header>

        {createFailed ? (
          <div className="mb-6 rounded-md border p-4">
            <div className="text-sm font-medium">Deal creation failed</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Please try again.{" "}
              {createCode ? (
                <span className="break-words">Error code: {createCode}</span>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="grid gap-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Total Deals
              </div>
              <div className="mt-1 text-lg font-semibold">{totalDeals}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                In Progress
              </div>
              <div className="mt-1 text-lg font-semibold">{inProgress}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Shared with Me
              </div>
              <div className="mt-1 text-lg font-semibold">{sharedCount}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Follow-ups Due
              </div>
              <div className="mt-1 text-lg font-semibold text-muted-foreground">
                0
              </div>
            </div>
          </div>

          {(totalPotentialValue > 0 || totalActiveValue > 0) ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Total Potential Value
                </div>
                <div className="mt-1 text-lg font-semibold">
                  {fmtMoneyAbbrev(totalPotentialValue)}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Total Active Value
                </div>
                <div className="mt-1 text-lg font-semibold">
                  {fmtMoneyAbbrev(totalActiveValue)}
                </div>
              </div>
            </div>
          ) : null}

          <section className="rounded-lg border p-5">
            <h2 className="text-sm font-semibold">Next steps</h2>
            <ol className="mt-3 list-decimal pl-5 text-sm text-muted-foreground space-y-1.5">
              {steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </section>

          <section>
            <div className="flex items-baseline justify-between gap-4 mb-3">
              <h2 className="text-sm font-semibold">My deals</h2>
              <span className="text-xs text-muted-foreground">
                {ownerCards.length}
              </span>
            </div>

            <div className="mb-3">
              <Link
                href="/deal/new"
                className="inline-flex items-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
              >
                + Create deal
              </Link>
            </div>

            {ownerCards.length === 0 ? (
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">
                  You don't have any deals yet.
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
                    roleChipLabel={vm.roleChipLabel}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-baseline justify-between gap-4 mb-3">
              <h2 className="text-sm font-semibold">Shared with me</h2>
              <span className="text-xs text-muted-foreground">
                {viewerCards.length}
              </span>
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
                    roleChipLabel={vm.roleChipLabel}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="rounded-lg border p-5">
            <h2 className="text-sm font-semibold">Need help?</h2>
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
        </div>
      </main>
    </div>
  );
}
