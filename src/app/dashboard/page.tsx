import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { DealCard } from "@/components/dashboard/DealCard";

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

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: SearchParams | Promise<SearchParams>;
};

type DealCardViewModel = {
  dealId: string;
  href: string;
  label: string;
  secondary?: string;
  statusLabel: string;
  kpis: {
    propertyValue?: number | null;
    upfront?: number | null;
    monthly?: number | null;
  };
  unreadCount?: number | null;
};

function safeNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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
          .select("deal_id, created_at, snapshot_json")
          .in(
            "deal_id",
            grants.map((g) => g.deal_id),
          )
          .order("created_at", { ascending: false })
          .limit(100)
      : { data: [], error: null as any };

  const latestSnapByDeal = new Map<string, Record<string, any>>();
  for (const s of snapRes.data ?? []) {
    if (!latestSnapByDeal.has(s.deal_id)) {
      latestSnapByDeal.set(s.deal_id, s.snapshot_json);
    }
  }

  function buildCardVm(
    dealId: string,
    grantRole: string,
  ): DealCardViewModel {
    const deal = byId.get(dealId);

    const label =
      deal?.title ||
      deal?.name ||
      deal?.address ||
      deal?.property_address ||
      deal?.home_address ||
      dealId;
    const isFallback = label === dealId;

    const statusLabel = deal?.status || "IMPORTED";

    const href =
      grantRole === "OWNER" ? `/deal/${dealId}` : `/deal/${dealId}?mode=shared`;

    const snap = latestSnapByDeal.get(dealId);
    const dt =
      snap?.inputs?.deal_terms ?? snap?.deal_terms ?? {};

    const kpis = {
      propertyValue: safeNum(dt.property_value),
      upfront: safeNum(dt.upfront_payment),
      monthly: safeNum(dt.monthly_payment),
    };

    return {
      dealId,
      href,
      label,
      secondary: isFallback ? undefined : dealId,
      statusLabel,
      kpis,
      unreadCount: null,
    };
  }

  const ownerCards = grants
    .filter((g) => g.role === "OWNER")
    .map((g) => buildCardVm(g.deal_id, g.role));

  const viewerCards = grants
    .filter((g) => g.role === "VIEWER")
    .map((g) => buildCardVm(g.deal_id, g.role));

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{welcome.tagline}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {welcome.description}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href="/deal/new"
              className="inline-flex items-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
            >
              Create deal
            </Link>
          </div>
        </div>

        <form method="post" action="/auth/logout" className="m-0">
          <button type="submit" className="rounded-md border px-3 py-2 text-sm">
            Sign out
          </button>
        </form>
      </header>

      {createFailed ? (
        <div className="mt-6 rounded-md border p-4">
          <div className="text-sm font-medium">Deal creation failed</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Please try again.{" "}
            {createCode ? (
              <span className="break-words">Error code: {createCode}</span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-6 grid gap-6">
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
                  label={vm.label}
                  secondary={vm.secondary}
                  statusLabel={vm.statusLabel}
                  kpis={vm.kpis}
                  unreadCount={vm.unreadCount}
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
                  label={vm.label}
                  secondary={vm.secondary}
                  statusLabel={vm.statusLabel}
                  kpis={vm.kpis}
                  unreadCount={vm.unreadCount}
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
  );
}
