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
    description: "You’re exploring a new way to unlock equity without a loan.",
  },
  buyer: {
    tagline: "Welcome, Future Homeowner",
    description:
      "You’re modeling a pathway to ownership through shared equity.",
  },
  realtor: {
    tagline: "Welcome, Partner",
    description: "You’re participating as a referral partner and co-pilot.",
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

const ACTIVE_STATUSES = new Set([
  "DRAFT",
  "NEEDS_REVIEW",
  "UNDER_REVIEW",
  "ACTIVE",
  "IMPORTED",
]);

const NEEDS_ATTENTION_STATUSES = new Set(["NEEDS_REVIEW", "UNDER_REVIEW"]);

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

function shortId(id: string): string {
  if (id.length <= 12) return id;
  return `Deal ${id.slice(0, 4)}…${id.slice(-5)}`;
}

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: SearchParams | Promise<SearchParams>;
};

type CardVm = {
  dealId: string;
  href: string;
  title: string;
  secondaryId: string | null;
  statusLabel: string;
  rawStatus: string;
  roleChipLabel: string | null;
  fmvLabel: string | null;
  upfrontMonthlyLabel: string | null;
  vestedLabel: string | null;
  exitYearLabel: string | null;
  updatedLabel: string | null;
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
        <main className="mx-auto max-w-3xl p-6 space-y-8">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <div className="rounded-lg border p-4">
            <div className="text-sm font-medium">Couldn’t load your deals</div>
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
          .from("deal_snapshots")
          .select("deal_id, snapshot_json, created_at")
          .in(
            "deal_id",
            grants.map((g) => g.deal_id),
          )
      : { data: [], error: null as any };


  // TEMP DEBUG: inspect one snapshot payload
  const __s0: any = (snapRes as any)?.data?.[0];
  console.log("dash.snap.sample", {
    deal_id: __s0?.deal_id,
    created_at: __s0?.created_at,
    top_keys: __s0?.snapshot_json ? Object.keys(__s0.snapshot_json) : null,
    deal_terms_keys: __s0?.snapshot_json?.deal_terms ? Object.keys(__s0.snapshot_json.deal_terms) : null,
    inputs_keys: __s0?.snapshot_json?.inputs ? Object.keys(__s0.snapshot_json.inputs) : null,
    basics_keys: __s0?.snapshot_json?.basic_results ? Object.keys(__s0.snapshot_json.basic_results) : null,
    upfront: __s0?.snapshot_json?.deal_terms?.upfront_payment ?? __s0?.snapshot_json?.inputs?.upfront_payment ?? null,
    monthly: __s0?.snapshot_json?.deal_terms?.monthly_payment ?? __s0?.snapshot_json?.inputs?.monthly_payment ?? null,
    vested_inputs: __s0?.snapshot_json?.inputs?.vested_equity ?? null,
    vested_basic: __s0?.snapshot_json?.basic_results?.vested_equity ?? __s0?.snapshot_json?.basic_results?.vested_equity_pct ?? null,
  });

  const latestSnapByDeal = new Map<string, Record<string, any>>();
  const snapDateByDeal = new Map<string, string>();
  for (const s of snapRes.data ?? []) {
    if (s?.deal_id && s.snapshot_json) {
      if (!latestSnapByDeal.has(s.deal_id)) latestSnapByDeal.set(s.deal_id, s.snapshot_json);
    }
    if (s?.deal_id && s.created_at) {
      snapDateByDeal.set(s.deal_id, s.created_at);
    }
  }

  function buildCardVm(dealId: string, grantRole: string): CardVm {
    const deal = byId.get(dealId);
    const snap = latestSnapByDeal.get(dealId);
    const meta = extractDealCardMeta(snap);

    const rawStatus = ((deal?.status as string) || "IMPORTED").toUpperCase();
    const statusLabel = formatStatusLabel(rawStatus);

    const href =
      grantRole === "OWNER" ? `/deal/${dealId}` : `/deal/${dealId}?mode=shared`;

    const addressTitle = meta.addressTitle;
    const title = addressTitle || shortId(dealId);
    const secondaryId = addressTitle ? shortId(dealId) : null;

    const fmvLabel = meta.fmv != null ? fmtMoneyAbbrev(meta.fmv) : null;

    const upfrontMonthly = fmtUpfrontPlusMonthly(meta.upfront, meta.monthly);
    const upfrontMonthlyLabel = upfrontMonthly === "\u2014" ? null : upfrontMonthly;

    const vestedLabel =
        ACTIVE_VALUE_STATUSES.has(rawStatus) && meta.vested.totalPct != null
          ? fmtVestedProgress(meta.vested.currentPct, meta.vested.totalPct)
          : null;

    const exitYearLabel =
      meta.exitYear != null ? `Exit ${NOW_YEAR + meta.exitYear}` : null;

    const updatedLabel = relativeAge(snapDateByDeal.get(dealId) ?? null, NOW_MS);

    return {
      dealId,
      href,
      title,
      secondaryId,
      statusLabel,
      rawStatus,
      roleChipLabel: grantRole === "VIEWER" ? "Shared" : null,
      fmvLabel,
      upfrontMonthlyLabel,
      vestedLabel,
      exitYearLabel,
      updatedLabel: updatedLabel || null,
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

  const totalModeledValue = ownerCards.reduce(
    (sum, c) => sum + (c.fmvRaw ?? 0),
    0,
  );
  const activeDeals = allCards.filter((c) =>
    ACTIVE_STATUSES.has(c.rawStatus),
  ).length;
  const needsAttention = allCards.filter((c) =>
    NEEDS_ATTENTION_STATUSES.has(c.rawStatus),
  ).length;
  const sharedCount = viewerCards.length;

  return (
    <div>
      <AppHeader />
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
              Total Modeled Value
            </div>
            <div className="mt-1 text-lg font-semibold">
              {totalModeledValue > 0 ? fmtMoneyAbbrev(totalModeledValue) : "\u2014"}
            </div>
          </div>
          <div className="rounded-lg border bg-background p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Active Deals
            </div>
            <div className="mt-1 text-lg font-semibold">{activeDeals}</div>
          </div>
          <div className="rounded-lg border bg-background p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Needs Attention
            </div>
            <div className="mt-1 text-lg font-semibold">{needsAttention}</div>
          </div>
          <div className="rounded-lg border bg-background p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Shared With Me
            </div>
            <div className="mt-1 text-lg font-semibold">{sharedCount}</div>
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
          <div>
            <h2 className="text-lg font-semibold">My deals</h2>
            <p className="text-sm text-muted-foreground">
              Deals you own and manage
            </p>
          </div>

          <div className="space-y-2">
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

            {ownerCards.map((vm) => (
              <DealCard
                key={vm.dealId}
                href={vm.href}
                title={vm.title}
                secondaryId={vm.secondaryId}
                statusLabel={vm.statusLabel}
                roleChipLabel={vm.roleChipLabel}
                fmvLabel={vm.fmvLabel}
                upfrontMonthlyLabel={vm.upfrontMonthlyLabel}
                vestedLabel={vm.vestedLabel}
                exitYearLabel={vm.exitYearLabel}
                updatedLabel={vm.updatedLabel}
              />
            ))}

            {ownerCards.length === 0 ? (
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">
                  You don’t have any deals yet. Create one above to get started.
                </p>
              </div>
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
                  secondaryId={vm.secondaryId}
                  statusLabel={vm.statusLabel}
                  roleChipLabel={vm.roleChipLabel}
                  fmvLabel={vm.fmvLabel}
                  upfrontMonthlyLabel={vm.upfrontMonthlyLabel}
                  vestedLabel={vm.vestedLabel}
                  exitYearLabel={vm.exitYearLabel}
                  updatedLabel={vm.updatedLabel}
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
