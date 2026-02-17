// src/app/deal/[dealId]/page.tsx

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ShareDealCard } from "@/components/ShareDealCard";
import { DealSummary } from "@/components/deal/DealSummary";
import { buildDealSummaryViewModel } from "@/lib/dealSummaryViewModel";
import { DealCalculatorEmbed } from "@/components/deal/DealCalculatorEmbed";
import { RecomputeSnapshotButton } from "@/components/deal/RecomputeSnapshotButton";
import { VersionTimelineCard } from "@/components/deal/VersionTimelineCard";
import { shouldRenderDealCalculator } from "@/lib/dealCalculatorGating";
import { selectBaseSnapshotId } from "@/lib/counterBaseSnapshot";
import { getDealSnapshots } from "@/lib/dealSnapshotDb";
import { getDealVersions } from "@/lib/dealVersionDb";
import { getDealEvents, buildDealTimeline } from "@/lib/dealTimeline";
import { extractSnapshotDisplay } from "@/lib/dealSnapshotDisplay";

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

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * A snapshot counts as "computed" if it has canonical outputs.results AND at least
 * one anchor KPI is a finite number. This avoids treating "present but garbage" rows
 * as the default snapshot.
 */
function hasValidComputedResults(
  results: Record<string, unknown> | null | undefined,
): boolean {
  if (!results) return false;

  const invested = (results as any).invested_capital_total;
  const settlement = (results as any).isa_settlement;
  const fmv = (results as any).projected_fmv;
  const multiple = (results as any).investor_multiple;
  const irr = (results as any).investor_irr_annual;

  // any one anchor KPI is sufficient to consider it computed
  if (isFiniteNumber(invested)) return true;
  if (isFiniteNumber(settlement)) return true;
  if (isFiniteNumber(fmv)) return true;
  if (isFiniteNumber(multiple)) return true;
  if (isFiniteNumber(irr)) return true;

  return false;
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
    .select("id, owner_user_id, mode")
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

  let role: "OWNER" | "VIEWER" | "COUNTERPARTY" =
    deal.owner_user_id === user.id ? "OWNER" : "VIEWER";

  if (role !== "OWNER") {
    const grantRes = await supabase
      .from("deal_access_grants")
      .select("role")
      .eq("deal_id", dealId)
      .eq("user_id", user.id)
      .maybeSingle();

    const grantRole = grantRes.data?.role;
    if (
      grantRole === "OWNER" ||
      grantRole === "VIEWER" ||
      grantRole === "COUNTERPARTY"
    ) {
      role = grantRole;
    }
  }

  const readOnly = role === "VIEWER" || isSharedMode;

  const snapshotsResult = await getDealSnapshots(supabase, dealId, 20);
  const snapshots = snapshotsResult.ok ? snapshotsResult.snapshots : [];

  const selectedSnapshotId = getParam(resolvedSearchParams, "snapshot");

  // Find the newest snapshot that looks like a valid computed canonical snapshot.
  const latestComputedSnapshot =
    snapshots.find((s) => {
      const d = extractSnapshotDisplay(s as any);
      return hasValidComputedResults(d?.outputs ?? null);
    }) ?? null;

  // Default selection behavior:
  // - If user explicitly selected a snapshot via query param, honor it.
  // - Otherwise, default to latest *computed* snapshot (fallback to newest row).
  const effectiveSnapshotRow =
    selectedSnapshotId != null
      ? (snapshots.find((s) => s.id === selectedSnapshotId) ?? null)
      : (latestComputedSnapshot ??
        (snapshots.length > 0 ? snapshots[0] : null));

  // "Latest" in UI/gating should mean latest computed snapshot (not merely latest row).
  const latestSnapshotId =
    (latestComputedSnapshot ?? (snapshots.length > 0 ? snapshots[0] : null))
      ?.id ?? null;
  const isLatest = effectiveSnapshotRow
    ? effectiveSnapshotRow.id === latestSnapshotId
    : true;

  const display = extractSnapshotDisplay(effectiveSnapshotRow as any);
  const summaryVm = buildDealSummaryViewModel(display ?? {});

  const [versionsResult, eventsResult] = await Promise.all([
    getDealVersions(supabase, dealId, 50),
    getDealEvents(supabase, dealId, 50),
  ]);
  const versions = versionsResult.ok ? versionsResult.versions : [];
  const eventRows = eventsResult.ok ? eventsResult.events : [];

  const timeline = buildDealTimeline({
    dealId,
    snapshots: snapshots.map((s) => ({
      id: s.id,
      created_at: s.created_at,
      contract_version: s.contract_version,
      schema_version: s.schema_version,
    })),
    versions: versions.map((v) => ({
      id: v.id,
      created_at: v.created_at,
      version_number: v.version_number,
      version_type: v.version_type,
      proposed_snapshot_id: v.proposed_snapshot_id,
      base_snapshot_id: v.base_snapshot_id,
      note: v.note,
      meta: v.meta,
    })),
    events: eventRows.map((e) => ({
      id: e.id,
      event_type: e.event_type,
      created_at: e.created_at,
      payload: null,
    })),
  });

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
            {isLatest
              ? "Latest computed snapshot (read-only; no recompute)"
              : "Viewing older snapshot"}
          </div>
        </div>

        {!isLatest && effectiveSnapshotRow ? (
          <div className="mt-2 flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
            <span className="text-xs text-muted-foreground">
              You are viewing a previous snapshot from{" "}
              {new Date(
                (effectiveSnapshotRow as any).created_at,
              ).toLocaleString()}
            </span>
            <Link
              className="text-xs font-medium underline"
              href={`/deal/${dealId}${isSharedMode ? "?mode=shared" : ""}`}
            >
              Back to latest
            </Link>
          </div>
        ) : null}

        <div className="mt-4">
          <DealSummary vm={summaryVm} />
        </div>
      </section>

      {role === "OWNER" && isLatest && !readOnly ? (
        <RecomputeSnapshotButton
          dealId={dealId}
          initialInputs={
            display?.inputs
              ? ((effectiveSnapshotRow as any)?.snapshot_json?.inputs ?? null)
              : null
          }
        />
      ) : null}

      {shouldRenderDealCalculator({ role, isLatest }) ? (
        <DealCalculatorEmbed
          dealId={dealId}
          role={role}
          currentSnapshotId={
            selectBaseSnapshotId({
              selectedSnapshotId: selectedSnapshotId,
              latestSnapshotId: latestSnapshotId,
            }) ?? undefined
          }
        />
      ) : null}

      {snapshots.length > 1 ? (
        <section className="mt-6 rounded-md border p-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-base font-semibold">Snapshot history</h2>
            <div className="text-xs text-muted-foreground">
              {snapshots.length} snapshot{snapshots.length !== 1 ? "s" : ""}
            </div>
          </div>

          <div className="mt-3 space-y-1">
            {snapshots.map((s) => {
              const isCurrent = effectiveSnapshotRow?.id === s.id;
              const modeParam = isSharedMode ? "&mode=shared" : "";
              const href =
                s.id === latestSnapshotId
                  ? `/deal/${dealId}${isSharedMode ? "?mode=shared" : ""}`
                  : `/deal/${dealId}?snapshot=${s.id}${modeParam}`;

              return (
                <Link
                  key={s.id}
                  href={href}
                  className={`flex items-center justify-between gap-3 rounded-md px-3 py-2 text-xs transition-colors ${
                    isCurrent
                      ? "bg-primary/10 font-medium"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {s.id === latestSnapshotId ? (
                      <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium">
                        Latest
                      </span>
                    ) : null}
                    <span className="text-muted-foreground">
                      v{s.contract_version} / s{s.schema_version}
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    {new Date(s.created_at).toLocaleString()}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="mt-6 rounded-md border p-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-base font-semibold">Timeline</h2>
          <div className="text-xs text-muted-foreground">
            {timeline.length} entr{timeline.length !== 1 ? "ies" : "y"}
          </div>
        </div>

        {timeline.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No activity recorded for this deal.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {timeline.map((entry) =>
              entry.type === "VERSION" ? (
                <VersionTimelineCard
                  key={`${entry.type}-${entry.id}`}
                  entry={entry}
                />
              ) : (
                <div
                  key={`${entry.type}-${entry.id}`}
                  className="flex items-start gap-3 rounded-md px-3 py-2 text-xs hover:bg-muted/50"
                >
                  <span
                    className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      entry.type === "SNAPSHOT"
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                    }`}
                  >
                    {entry.type === "SNAPSHOT" ? "SNAP" : "EVT"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      {entry.href ? (
                        <Link
                          href={entry.href}
                          className="font-medium underline"
                        >
                          {entry.title}
                        </Link>
                      ) : (
                        <span className="font-medium">{entry.title}</span>
                      )}
                      <span className="shrink-0 text-muted-foreground">
                        {entry.created_at
                          ? new Date(entry.created_at).toLocaleString()
                          : "—"}
                      </span>
                    </div>
                    {entry.subtitle ? (
                      <div className="mt-0.5 text-muted-foreground">
                        {entry.subtitle}
                      </div>
                    ) : null}
                  </div>
                </div>
              ),
            )}
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
