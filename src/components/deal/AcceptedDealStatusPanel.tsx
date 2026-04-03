"use client";

import { useMemo } from "react";
import { normalizeDealTermsForWidget } from "@/lib/normalizeDealTermsForWidget";
import {
  normalizeResultsForWidget,
} from "@/components/deal/widgetNormalization";
import { DealWidgetShell } from "@/components/deal/DealWidgetShell";
import {
  CANONICAL_DEAL_TERM_DEFAULTS,
  CANONICAL_SCENARIO_DEFAULTS,
} from "@/lib/canonicalDefaults";
import {
  buildMonthlyBuyoutSeries,
  computeSetupFee,
  interpolateBuyoutAtMonth,
} from "@/lib/deal/buyoutProjection";
import { BuyoutProjectionChart } from "@/components/deal/BuyoutProjectionChart";

type AnyRecord = Record<string, unknown>;

type AcceptedDealStatusPanelProps = {
  dealId: string;
  initialSnapshot?: AnyRecord | null;
  inputs: AnyRecord | null;
  results: AnyRecord | null;
  computeVersion?: string | null;
  persona?: string;
  canonicalStage?: string | null;
  /**
   * ISO timestamp of the acceptance event.
   *
   * Derivation order (most to least grounded):
   *   1. deal_events WHERE event_type = 'OFFER_ACCEPTED'
   *   2. deal_events WHERE event_type = 'DEAL_ACCEPTED'
   *   3. null — time-based status falls back to canonical stage label.
   */
  acceptedAt?: string | null;
};

// ─── Utility ──────────────────────────────────────────────────────────────────

function safeRecord(v: unknown): AnyRecord | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as AnyRecord)
    : null;
}

function safeNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmtCurrency(v: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);
}

function fmtPercent(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function hasSubstantiveData(snap: AnyRecord | null): boolean {
  if (!snap) return false;
  const inputs = safeRecord((snap as any)?.inputs);
  const results = safeRecord((snap as any)?.outputs?.results);
  return !!(inputs || results);
}

function hasRenderableComputedSnapshot(
  inputs: AnyRecord | null,
  results: AnyRecord | null,
): boolean {
  if (!inputs || !results) return false;

  const dealTerms = safeRecord((inputs as any)?.deal_terms);
  const scenario = safeRecord((inputs as any)?.scenario);

  if (!dealTerms || !scenario) return false;

  const requiredResultKeys = [
    "total_scheduled_buyer_funding",
    "scheduled_buyer_appreciation_share",
    "extension_adjusted_buyout_amount",
    "base_buyout_amount",
  ];

  for (const key of requiredResultKeys) {
    const v = (results as any)?.[key];
    if (typeof v !== "number" || !Number.isFinite(v)) return false;
  }

  if (
    typeof (scenario as any)?.annual_appreciation !== "number" ||
    !Number.isFinite((scenario as any).annual_appreciation)
  ) {
    return false;
  }

  return true;
}

// ─── Time helpers ─────────────────────────────────────────────────────────────

const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000;

function elapsedYears(acceptedAt: string | null | undefined): number | null {
  if (!acceptedAt) return null;
  const ms = new Date(acceptedAt).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, (Date.now() - ms) / MS_PER_YEAR);
}

function contractYear(acceptedAt: string | null | undefined): number | null {
  const y = elapsedYears(acceptedAt);
  if (y === null) return null;
  return Math.floor(y) + 1;
}

// ─── Status derivation ────────────────────────────────────────────────────────

function resolveAcceptedStatus(
  canonicalStage: string | null,
  elapsed: number | null,
  dealTerms: AnyRecord | null,
): string {
  switch (canonicalStage) {
    case "deal_closed":
      return "Closed";
    case "agreement_signed":
      return "Agreement signed";
    case "agreement_out_for_signatures":
      return "Agreement out for signatures";
    case "ready_for_signatures":
      return "Agreement being prepared";
    default:
      break;
  }

  if (elapsed === null) return "Active";

  const minHold =
    safeNumber((dealTerms as any)?.minimum_hold_years) ??
    CANONICAL_DEAL_TERM_DEFAULTS.minimum_hold_years;
  const exitWindowEnd =
    safeNumber((dealTerms as any)?.target_exit_window_end_year) ??
    CANONICAL_DEAL_TERM_DEFAULTS.target_exit_window_end_year;
  const longStop =
    safeNumber((dealTerms as any)?.long_stop_year) ??
    CANONICAL_DEAL_TERM_DEFAULTS.long_stop_year;

  const firstExtStart = safeNumber(
    (dealTerms as any)?.first_extension_start_year,
  );
  const firstExtEnd = safeNumber((dealTerms as any)?.first_extension_end_year);
  const secondExtStart = safeNumber(
    (dealTerms as any)?.second_extension_start_year,
  );
  const secondExtEnd = safeNumber(
    (dealTerms as any)?.second_extension_end_year,
  );

  if (elapsed < minHold) return "Active — before exit window";
  if (elapsed <= exitWindowEnd) return "In target exit window";
  if (
    firstExtStart !== null &&
    firstExtEnd !== null &&
    elapsed >= firstExtStart &&
    elapsed <= firstExtEnd
  ) {
    return "In first extension";
  }
  if (
    secondExtStart !== null &&
    secondExtEnd !== null &&
    elapsed >= secondExtStart &&
    elapsed <= secondExtEnd
  ) {
    return "In second extension";
  }
  if (elapsed <= longStop) return "In extension";
  return "Past long-stop";
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

type TimelineMilestone = { label: string; subLabel: string; year: number };

type TimelineProps = { milestones: TimelineMilestone[]; elapsedYears: number | null };

function LifecycleTimeline({ milestones, elapsedYears: elapsed }: TimelineProps) {
  if (milestones.length === 0) return null;
  return (
    <div className="relative">
      <div
        className="absolute left-3 top-3 w-0.5 bg-border"
        style={{ height: "calc(100% - 1.5rem)" }}
        aria-hidden="true"
      />
      <ol className="space-y-3 pl-0">
        {milestones.map((m, i) => {
          const isPast = elapsed !== null && elapsed >= m.year;
          const isCurrent =
            elapsed !== null &&
            elapsed >= m.year &&
            (i === milestones.length - 1 || elapsed < milestones[i + 1].year);
          return (
            <li key={m.label} className="relative flex items-start gap-3 pl-8">
              <span
                className={`absolute left-0 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold ${
                  isCurrent
                    ? "border-blue-500 bg-blue-500 text-white"
                    : isPast
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-muted-foreground/30 bg-background text-muted-foreground/50"
                }`}
              >
                {isPast ? (
                  <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3" aria-hidden="true">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className={`text-xs font-medium leading-tight ${isCurrent ? "text-blue-600 dark:text-blue-400" : isPast ? "text-foreground" : "text-muted-foreground"}`}>
                  {m.label}
                </p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{m.subLabel}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ─── Metric card ──────────────────────────────────────────────────────────────

type MetricCardProps = { label: string; value: string; sub?: string; highlight?: boolean };

function MetricCard({ label, value, sub, highlight }: MetricCardProps) {
  return (
    <div className={`rounded-lg border px-4 py-3 flex flex-col gap-0.5 ${highlight ? "border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800" : "bg-muted/30"}`}>
      <span className="text-xs text-muted-foreground leading-tight">{label}</span>
      <span className="text-lg font-semibold tabular-nums leading-tight">{value}</span>
      {sub ? <span className="text-xs text-muted-foreground leading-tight">{sub}</span> : null}
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function AcceptedDealStatusPanel({
  dealId: _dealId,
  initialSnapshot,
  inputs,
  results,
  computeVersion,
  persona = "homeowner",
  canonicalStage,
  acceptedAt,
}: AcceptedDealStatusPanelProps) {
  const seedSnapshot = useMemo(() => {
    const snap = safeRecord(initialSnapshot);

    if (snap && hasSubstantiveData(snap)) {
      const snapInputs = safeRecord((snap as any)?.inputs);
      const snapDealTerms = safeRecord((snapInputs as any)?.deal_terms);
      const snapScenario = safeRecord((snapInputs as any)?.scenario);
      const snapResults = safeRecord((snap as any)?.outputs?.results);

      const annualAppreciation =
        typeof (snapScenario as any)?.annual_appreciation === "number" &&
        Number.isFinite((snapScenario as any).annual_appreciation)
          ? (snapScenario as any).annual_appreciation
          : CANONICAL_SCENARIO_DEFAULTS.annual_appreciation;

      return {
        ...snap,
        inputs: {
          ...(snapInputs ?? {}),
          deal_terms: normalizeDealTermsForWidget(snapDealTerms ?? {}),
          scenario: { ...(snapScenario ?? {}), annual_appreciation: annualAppreciation },
        },
        outputs: {
          ...(safeRecord((snap as any)?.outputs) ?? {}),
          results: snapResults ? normalizeResultsForWidget(snapResults) : null,
        },
      } as AnyRecord;
    }

    const inRec = safeRecord(inputs);
    const outRec = safeRecord(results);
    if (!inRec && !outRec) return null;

    let normalizedInputs: AnyRecord | null = inRec;
    if (inRec && safeRecord((inRec as any).deal_terms) && safeRecord((inRec as any).scenario)) {
      const dealTerms = (inRec as any).deal_terms as AnyRecord;
      normalizedInputs = { ...(inRec as any), deal_terms: normalizeDealTermsForWidget(dealTerms) };
    }

    return {
      inputs: normalizedInputs ?? null,
      outputs: { results: outRec ? normalizeResultsForWidget(outRec) : null },
      compute_version: computeVersion ?? null,
      schema_version: (initialSnapshot as any)?.schema_version ?? null,
    } as AnyRecord;
  }, [initialSnapshot, inputs, results, computeVersion]);

  const defaultSeed = useMemo<AnyRecord>(
    () => ({ inputs: { deal_terms: {}, scenario: {} }, outputs: { results: null }, compute_version: null, schema_version: "1" }),
    [],
  );

  const currentInputs = safeRecord((seedSnapshot as any)?.inputs);
  const currentResults = safeRecord((seedSnapshot as any)?.outputs?.results);
  const renderable = hasRenderableComputedSnapshot(currentInputs, currentResults);

  const dealTerms = safeRecord((currentInputs as any)?.deal_terms);
  const scenario = safeRecord((currentInputs as any)?.scenario);

  // Deal term values
  const propertyValue =
    safeNumber((dealTerms as any)?.property_value) ?? CANONICAL_DEAL_TERM_DEFAULTS.property_value;
  const annualAppreciation =
    safeNumber((scenario as any)?.annual_appreciation) ?? CANONICAL_SCENARIO_DEFAULTS.annual_appreciation;
  const exitYear =
    safeNumber((scenario as any)?.exit_year) ?? CANONICAL_SCENARIO_DEFAULTS.exit_year;
  const longStopYear =
    safeNumber((dealTerms as any)?.long_stop_year) ?? CANONICAL_DEAL_TERM_DEFAULTS.long_stop_year;
  const minimumHoldYears =
    safeNumber((dealTerms as any)?.minimum_hold_years) ?? CANONICAL_DEAL_TERM_DEFAULTS.minimum_hold_years;
  const exitWindowStart =
    safeNumber((dealTerms as any)?.target_exit_window_start_year) ?? CANONICAL_DEAL_TERM_DEFAULTS.target_exit_window_start_year;
  const exitWindowEnd =
    safeNumber((dealTerms as any)?.target_exit_window_end_year) ?? CANONICAL_DEAL_TERM_DEFAULTS.target_exit_window_end_year;
  const servicingFeeMonthly =
    safeNumber((dealTerms as any)?.servicing_fee_monthly) ?? CANONICAL_DEAL_TERM_DEFAULTS.servicing_fee_monthly;
  const exitAdminFee =
    safeNumber((dealTerms as any)?.exit_admin_fee_amount) ?? CANONICAL_DEAL_TERM_DEFAULTS.exit_admin_fee_amount;

  // Setup fee: prefer engine result; derive from formula as fallback.
  const setupFeeFromEngine = safeNumber((currentResults as any)?.fractpath_setup_fee_amount);
  const setupFeePct =
    safeNumber((dealTerms as any)?.setup_fee_pct) ?? CANONICAL_DEAL_TERM_DEFAULTS.setup_fee_pct;
  const setupFeeFloor =
    safeNumber((dealTerms as any)?.setup_fee_floor) ?? CANONICAL_DEAL_TERM_DEFAULTS.setup_fee_floor;
  const setupFeeCap =
    safeNumber((dealTerms as any)?.setup_fee_cap) ?? CANONICAL_DEAL_TERM_DEFAULTS.setup_fee_cap;
  const setupFee =
    setupFeeFromEngine !== null
      ? setupFeeFromEngine
      : propertyValue > 0
        ? computeSetupFee(propertyValue, setupFeePct, setupFeeFloor, setupFeeCap)
        : null;

  // Result values
  const totalBuyerFunding = safeNumber((currentResults as any)?.total_scheduled_buyer_funding);
  const appreciationShare = safeNumber((currentResults as any)?.scheduled_buyer_appreciation_share);
  const projectedExitCost = safeNumber((currentResults as any)?.extension_adjusted_buyout_amount);

  // Time-based computations
  const elapsed = elapsedYears(acceptedAt);
  const elapsedMonths = elapsed !== null ? elapsed * 12 : null;
  const cYear = contractYear(acceptedAt);
  const statusLabel = resolveAcceptedStatus(canonicalStage ?? null, elapsed, dealTerms);

  // Current modeled buyout at elapsed months — from monthly series via interpolation
  const currentModeledBuyout = useMemo(() => {
    if (!renderable || totalBuyerFunding === null || appreciationShare === null || elapsedMonths === null) {
      return null;
    }
    const series = buildMonthlyBuyoutSeries(
      propertyValue, annualAppreciation, totalBuyerFunding, appreciationShare, longStopYear,
    );
    return interpolateBuyoutAtMonth(series, elapsedMonths);
  }, [renderable, totalBuyerFunding, appreciationShare, elapsedMonths, propertyValue, annualAppreciation, longStopYear]);

  // Monthly chart data
  const chartData = useMemo(() => {
    if (!renderable || totalBuyerFunding === null || appreciationShare === null) return null;

    const series = buildMonthlyBuyoutSeries(
      propertyValue, annualAppreciation, totalBuyerFunding, appreciationShare, longStopYear,
    );
    if (series.length < 2) return null;

    const exitMonthRounded = Math.round(exitYear * 12);
    const exitPoint =
      series.find((p) => p.month === exitMonthRounded) ??
      series[Math.min(exitMonthRounded, series.length - 1)];

    return { series, exitBuyout: exitPoint.buyout };
  }, [renderable, propertyValue, annualAppreciation, totalBuyerFunding, appreciationShare, longStopYear, exitYear]);

  // Timeline milestones
  const timelineMilestones = useMemo((): TimelineMilestone[] => [
    {
      label: "Agreement accepted",
      subLabel: acceptedAt
        ? `Started ${new Date(acceptedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`
        : "Start of agreement",
      year: 0,
    },
    {
      label: "Minimum hold period ends",
      subLabel: `Year ${minimumHoldYears} — exit available after this`,
      year: minimumHoldYears,
    },
    {
      label: "Target exit window",
      subLabel: `Year ${exitWindowStart} – ${exitWindowEnd}`,
      year: exitWindowStart,
    },
    {
      label: "Modeled exit",
      subLabel: `Year ${exitYear} — your modeled scenario`,
      year: exitYear,
    },
    {
      label: "Long-stop date",
      subLabel: `Year ${longStopYear} — contract must settle`,
      year: longStopYear,
    },
  ], [acceptedAt, minimumHoldYears, exitWindowStart, exitWindowEnd, exitYear, longStopYear]);

  return (
    <div className="border-t pt-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Agreement Status</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Modeled from your accepted agreement and scheduled payments.
          </p>
        </div>
        <span className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {statusLabel}
        </span>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricCard
          label="Current Buyout"
          value={
            currentModeledBuyout !== null
              ? fmtCurrency(currentModeledBuyout)
              : projectedExitCost !== null
                ? fmtCurrency(projectedExitCost)
                : "—"
          }
          sub={
            elapsed !== null
              ? `Modeled at Year ${elapsed.toFixed(1).replace(".0", "")}`
              : "Modeled from agreement"
          }
          highlight
        />
        <MetricCard
          label="Contract Year"
          value={cYear !== null ? `Year ${cYear}` : "—"}
          sub={
            acceptedAt
              ? `Since ${new Date(acceptedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
              : "Acceptance date not recorded"
          }
        />
        <MetricCard
          label="Current Status"
          value={statusLabel}
          sub={
            elapsed !== null
              ? `${elapsed.toFixed(1).replace(".0", "")} years elapsed`
              : "Based on agreement stage"
          }
        />
      </div>

      {!acceptedAt && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
          Acceptance date is not recorded — Contract Year and time-based status
          are unavailable. Contact your account team if this needs to be corrected.
        </p>
      )}

      {/* Compact saved terms (read-only) */}
      <DealWidgetShell
        initialSnapshot={seedSnapshot ?? defaultSeed}
        canEdit={false}
        persona={persona}
        onSave={undefined}
        initiallyOpenEditor={false}
      />

      {renderable && chartData ? (
        <>
          {/* Monthly buyout chart */}
          <div className="rounded-lg border bg-card px-4 pt-4 pb-2">
            <BuyoutProjectionChart
              series={chartData.series}
              exitYear={exitYear}
              exitBuyout={chartData.exitBuyout}
              elapsedMonths={elapsedMonths}
              chartLabel="Projected buyout by contract month"
              chartSubLabel={`Blue = projected buyout. Amber = current modeled position. Green = Year ${exitYear} (modeled exit). Hover any point to see buyout options.`}
              chartFootnote="Values are modeled projections based on scheduled payments, not actual payment history."
            />
          </div>

          {/* Lifecycle timeline */}
          <div className="rounded-lg border bg-muted/10 px-4 py-4">
            <p className="text-xs font-medium mb-3">Agreement timeline</p>
            <LifecycleTimeline milestones={timelineMilestones} elapsedYears={elapsed} />
          </div>

          {/* Projection + fee summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-lg border bg-muted/20 px-4 py-3 space-y-2">
              <p className="text-xs font-semibold">Projected at exit</p>
              <dl className="space-y-1">
                <div className="flex justify-between text-xs">
                  <dt className="text-muted-foreground">Projected exit cost</dt>
                  <dd className="font-medium">
                    {projectedExitCost !== null ? fmtCurrency(projectedExitCost) : "—"}
                  </dd>
                </div>
                <div className="flex justify-between text-xs">
                  <dt className="text-muted-foreground">Modeled exit year</dt>
                  <dd className="font-medium">Year {exitYear}</dd>
                </div>
                <div className="flex justify-between text-xs">
                  <dt className="text-muted-foreground">Appreciation share</dt>
                  <dd className="font-medium">
                    {appreciationShare !== null ? fmtPercent(appreciationShare) : "—"}
                  </dd>
                </div>
                <div className="flex justify-between text-xs">
                  <dt className="text-muted-foreground">Annual appreciation</dt>
                  <dd className="font-medium">{fmtPercent(annualAppreciation)}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-lg border bg-muted/20 px-4 py-3 space-y-2">
              <p className="text-xs font-semibold">Fee summary</p>
              <dl className="space-y-1">
                {setupFee !== null ? (
                  <div className="flex justify-between text-xs">
                    <dt className="text-muted-foreground">One-time setup fee</dt>
                    <dd className="font-medium">{fmtCurrency(setupFee)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between text-xs">
                  <dt className="text-muted-foreground">Monthly servicing fee</dt>
                  <dd className="font-medium">{fmtCurrency(servicingFeeMonthly)}/mo</dd>
                </div>
                <div className="flex justify-between text-xs">
                  <dt className="text-muted-foreground">Exit admin fee</dt>
                  <dd className="font-medium">{fmtCurrency(exitAdminFee)}</dd>
                </div>
              </dl>
              <p className="text-[10px] text-muted-foreground pt-1">
                Fees are included in the projected exit cost above.
              </p>
            </div>
          </div>

          {/* Milestone summary */}
          <div className="rounded-lg border bg-muted/20 px-4 py-3 space-y-1">
            <p className="text-xs font-semibold mb-2">Agreement milestones</p>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
              <div className="flex flex-col text-xs">
                <dt className="text-muted-foreground">Minimum hold</dt>
                <dd className="font-medium">Year {minimumHoldYears}</dd>
              </div>
              <div className="flex flex-col text-xs">
                <dt className="text-muted-foreground">Exit window</dt>
                <dd className="font-medium">Yr {exitWindowStart} – {exitWindowEnd}</dd>
              </div>
              <div className="flex flex-col text-xs">
                <dt className="text-muted-foreground">Long-stop</dt>
                <dd className="font-medium">Year {longStopYear}</dd>
              </div>
            </dl>
          </div>
        </>
      ) : null}
    </div>
  );
}
