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
   *   1. deal_events WHERE event_type = 'OFFER_ACCEPTED' — the actual proposal
   *      acceptance event written by /api/proposals/[id]/owner-decision.
   *   2. deal_events WHERE event_type = 'DEAL_ACCEPTED'  — alternative acceptance
   *      event written by /api/deals/[id]/accept.
   *   3. null — no timestamp available; time-based status falls back to stage label.
   *
   * NOTE: thread.created_at is NOT used as a fallback because the fallback path
   * selects deal_threads without created_at. thread.created_at also predates
   * acceptance (the thread is created with the first offer, not on acceptance).
   */
  acceptedAt?: string | null;
};

// ─── Utility functions ────────────────────────────────────────────────────────

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

function fmtCurrencyCompact(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${Math.round(v / 1_000)}k`;
  return `$${Math.round(v)}`;
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
    "fractpath_setup_fee_amount",
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

/**
 * Returns fractional elapsed years from an ISO timestamp to now.
 * Returns null when acceptedAt is absent or unparseable.
 */
function elapsedYears(acceptedAt: string | null | undefined): number | null {
  if (!acceptedAt) return null;
  const ms = new Date(acceptedAt).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, (Date.now() - ms) / MS_PER_YEAR);
}

/**
 * Contract year (1-indexed): Year 1 on day 1 of the agreement.
 * Returns null when acceptedAt is absent.
 */
function contractYear(acceptedAt: string | null | undefined): number | null {
  const y = elapsedYears(acceptedAt);
  if (y === null) return null;
  return Math.floor(y) + 1;
}

// ─── Status derivation ────────────────────────────────────────────────────────

/**
 * Maps canonical stage + elapsed time to a plain-language status string.
 *
 * Priority order:
 *   1. Terminal/signing canonical stages — these override time-based status.
 *   2. Time-based status from elapsed years + deal term milestones.
 *   3. Fallback to "Active" when no acceptance timestamp is available.
 */
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

// ─── Year-by-year buyout series ───────────────────────────────────────────────
//
// For year y = 0 … longStopYear:
//   FMV(y)   = propertyValue × (1 + annualAppreciation)^y
//   gain(y)  = max(0, FMV(y) − propertyValue)
//   buyout(y) = baseFunding + appreciationShare × gain(y)

type BuyoutPoint = { year: number; buyout: number };

function buildYearlyBuyoutSeries(
  propertyValue: number,
  annualAppreciation: number,
  baseFunding: number,
  appreciationShare: number,
  longStopYear: number,
): BuyoutPoint[] {
  const pts: BuyoutPoint[] = [];
  for (let y = 0; y <= Math.max(longStopYear, 1); y++) {
    const fmv = propertyValue * Math.pow(1 + annualAppreciation, y);
    const gain = Math.max(0, fmv - propertyValue);
    pts.push({ year: y, buyout: baseFunding + appreciationShare * gain });
  }
  return pts;
}

// ─── Chart ────────────────────────────────────────────────────────────────────

const SVG_W = 480;
const SVG_H = 175;
const PAD_L = 52;
const PAD_R = 18;
const PAD_T = 12;
const PAD_B = 32;
const PLOT_W = SVG_W - PAD_L - PAD_R;
const PLOT_H = SVG_H - PAD_T - PAD_B;

type AcceptedChartProps = {
  series: BuyoutPoint[];
  exitYear: number;
  exitBuyout: number;
  elapsedYears: number | null;
};

function AcceptedBuyoutLineChart({
  series,
  exitYear,
  exitBuyout,
  elapsedYears: elapsed,
}: AcceptedChartProps) {
  if (series.length < 2) return null;

  const maxYear = series[series.length - 1].year;
  const values = series.map((p) => p.buyout);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const valRange = maxVal - minVal || 1;

  function toX(year: number): number {
    return PAD_L + (year / maxYear) * PLOT_W;
  }
  function toY(val: number): number {
    return PAD_T + PLOT_H - ((val - minVal) / valRange) * PLOT_H;
  }

  const polylinePoints = series
    .map((p) => `${toX(p.year).toFixed(1)},${toY(p.buyout).toFixed(1)}`)
    .join(" ");

  // Y-axis grid
  const yGridCount = 3;
  const yGridLines = Array.from({ length: yGridCount + 1 }, (_, i) => {
    const val = minVal + (valRange * i) / yGridCount;
    return { val, y: toY(val) };
  });

  // X-axis ticks
  const xTickInterval = maxYear <= 8 ? 1 : maxYear <= 15 ? 2 : 3;
  const xTicks: number[] = [];
  for (let y = 0; y <= maxYear; y += xTickInterval) xTicks.push(y);
  if (xTicks[xTicks.length - 1] !== maxYear) xTicks.push(maxYear);

  // Exit year marker (modeled exit)
  const exitX = toX(exitYear);
  const exitYpx = toY(exitBuyout);

  // Current position marker (elapsed)
  const currentX =
    elapsed !== null && elapsed <= maxYear
      ? toX(Math.min(elapsed, maxYear))
      : null;
  const currentBuyout =
    elapsed !== null
      ? (() => {
          const frac = Math.min(elapsed, maxYear);
          const lo = series[Math.floor(frac)];
          const hi = series[Math.min(Math.ceil(frac), series.length - 1)];
          const t = frac - Math.floor(frac);
          return lo.buyout + t * (hi.buyout - lo.buyout);
        })()
      : null;
  const currentYpx =
    currentX !== null && currentBuyout !== null ? toY(currentBuyout) : null;

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      className="w-full"
      aria-label="Projected buyout by contract year"
      role="img"
    >
      {/* Y-axis grid */}
      {yGridLines.map(({ val, y }) => (
        <g key={val}>
          <line
            x1={PAD_L}
            x2={SVG_W - PAD_R}
            y1={y}
            y2={y}
            stroke="#e5e7eb"
            strokeWidth="1"
          />
          <text
            x={PAD_L - 5}
            y={y + 3.5}
            textAnchor="end"
            fontSize="9"
            fill="#9ca3af"
            fontFamily="system-ui, sans-serif"
          >
            {fmtCurrencyCompact(val)}
          </text>
        </g>
      ))}

      {/* X-axis ticks */}
      {xTicks.map((y) => (
        <g key={y}>
          <line
            x1={toX(y)}
            x2={toX(y)}
            y1={PAD_T + PLOT_H}
            y2={PAD_T + PLOT_H + 4}
            stroke="#d1d5db"
            strokeWidth="1"
          />
          <text
            x={toX(y)}
            y={SVG_H - PAD_B + 16}
            textAnchor="middle"
            fontSize="9"
            fill="#9ca3af"
            fontFamily="system-ui, sans-serif"
          >
            {y === 0 ? "Yr 0" : `Yr ${y}`}
          </text>
        </g>
      ))}

      {/* Exit year guide */}
      <line
        x1={exitX}
        x2={exitX}
        y1={PAD_T}
        y2={PAD_T + PLOT_H}
        stroke="#16a34a"
        strokeWidth="1"
        strokeDasharray="4 3"
        opacity="0.7"
      />

      {/* Buyout curve */}
      <polyline
        points={polylinePoints}
        fill="none"
        stroke="#2563eb"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Current position marker (amber) */}
      {currentX !== null && currentYpx !== null && (
        <>
          <line
            x1={currentX}
            x2={currentX}
            y1={PAD_T}
            y2={PAD_T + PLOT_H}
            stroke="#d97706"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.85"
          />
          <circle cx={currentX} cy={currentYpx} r="5" fill="#d97706" />
          <circle cx={currentX} cy={currentYpx} r="2.5" fill="white" />
          <text
            x={currentX + (currentX > SVG_W - PAD_R - 52 ? -6 : 6)}
            y={currentYpx - 8}
            textAnchor={currentX > SVG_W - PAD_R - 52 ? "end" : "start"}
            fontSize="9"
            fill="#b45309"
            fontWeight="600"
            fontFamily="system-ui, sans-serif"
          >
            Now
          </text>
        </>
      )}

      {/* Modeled exit year dot (green) */}
      <circle cx={exitX} cy={exitYpx} r="4.5" fill="#16a34a" />
      <circle cx={exitX} cy={exitYpx} r="2.5" fill="white" />
      <text
        x={exitX + (exitX > SVG_W - PAD_R - 48 ? -6 : 6)}
        y={exitYpx - 8}
        textAnchor={exitX > SVG_W - PAD_R - 48 ? "end" : "start"}
        fontSize="9"
        fill="#15803d"
        fontWeight="600"
        fontFamily="system-ui, sans-serif"
      >
        {`Yr ${exitYear}`}
      </text>
    </svg>
  );
}

// ─── Lifecycle timeline ───────────────────────────────────────────────────────

type TimelineMilestone = {
  label: string;
  subLabel: string;
  year: number;
};

type TimelineProps = {
  milestones: TimelineMilestone[];
  elapsedYears: number | null;
};

function LifecycleTimeline({ milestones, elapsedYears: elapsed }: TimelineProps) {
  if (milestones.length === 0) return null;

  return (
    <div className="relative">
      {/* Connector bar */}
      <div
        className="absolute left-3 top-3 w-0.5 bg-border"
        style={{ height: `calc(100% - 1.5rem)` }}
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
              {/* Node */}
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
                  <svg
                    viewBox="0 0 12 12"
                    fill="none"
                    className="h-3 w-3"
                    aria-hidden="true"
                  >
                    <path
                      d="M2 6l3 3 5-5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>

              {/* Label */}
              <div className="min-w-0 flex-1 pt-0.5">
                <p
                  className={`text-xs font-medium leading-tight ${
                    isCurrent
                      ? "text-blue-600 dark:text-blue-400"
                      : isPast
                        ? "text-foreground"
                        : "text-muted-foreground"
                  }`}
                >
                  {m.label}
                </p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                  {m.subLabel}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ─── Metric card ──────────────────────────────────────────────────────────────

type MetricCardProps = {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
};

function MetricCard({ label, value, sub, highlight }: MetricCardProps) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 flex flex-col gap-0.5 ${
        highlight ? "border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800" : "bg-muted/30"
      }`}
    >
      <span className="text-xs text-muted-foreground leading-tight">{label}</span>
      <span className="text-lg font-semibold tabular-nums leading-tight">{value}</span>
      {sub ? (
        <span className="text-xs text-muted-foreground leading-tight">{sub}</span>
      ) : null}
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
          scenario: {
            ...(snapScenario ?? {}),
            annual_appreciation: annualAppreciation,
          },
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
    if (
      inRec &&
      safeRecord((inRec as any).deal_terms) &&
      safeRecord((inRec as any).scenario)
    ) {
      const dealTerms = (inRec as any).deal_terms as AnyRecord;
      normalizedInputs = {
        ...(inRec as any),
        deal_terms: normalizeDealTermsForWidget(dealTerms),
      };
    }

    return {
      inputs: normalizedInputs ?? null,
      outputs: { results: outRec ? normalizeResultsForWidget(outRec) : null },
      compute_version: computeVersion ?? null,
      schema_version: (initialSnapshot as any)?.schema_version ?? null,
    } as AnyRecord;
  }, [initialSnapshot, inputs, results, computeVersion]);

  const defaultSeed = useMemo<AnyRecord>(
    () => ({
      inputs: { deal_terms: {}, scenario: {} },
      outputs: { results: null },
      compute_version: null,
      schema_version: "1",
    }),
    [],
  );

  const currentInputs = safeRecord((seedSnapshot as any)?.inputs);
  const currentResults = safeRecord((seedSnapshot as any)?.outputs?.results);
  const renderable = hasRenderableComputedSnapshot(currentInputs, currentResults);

  const dealTerms = safeRecord((currentInputs as any)?.deal_terms);
  const scenario = safeRecord((currentInputs as any)?.scenario);

  // Deal term values
  const propertyValue =
    safeNumber((dealTerms as any)?.property_value) ??
    CANONICAL_DEAL_TERM_DEFAULTS.property_value;
  const annualAppreciation =
    safeNumber((scenario as any)?.annual_appreciation) ??
    CANONICAL_SCENARIO_DEFAULTS.annual_appreciation;
  const exitYear =
    safeNumber((scenario as any)?.exit_year) ??
    CANONICAL_SCENARIO_DEFAULTS.exit_year;
  const longStopYear =
    safeNumber((dealTerms as any)?.long_stop_year) ??
    CANONICAL_DEAL_TERM_DEFAULTS.long_stop_year;
  const minimumHoldYears =
    safeNumber((dealTerms as any)?.minimum_hold_years) ??
    CANONICAL_DEAL_TERM_DEFAULTS.minimum_hold_years;
  const exitWindowStart =
    safeNumber((dealTerms as any)?.target_exit_window_start_year) ??
    CANONICAL_DEAL_TERM_DEFAULTS.target_exit_window_start_year;
  const exitWindowEnd =
    safeNumber((dealTerms as any)?.target_exit_window_end_year) ??
    CANONICAL_DEAL_TERM_DEFAULTS.target_exit_window_end_year;

  // Result values
  const totalBuyerFunding = safeNumber(
    (currentResults as any)?.total_scheduled_buyer_funding,
  );
  const appreciationShare = safeNumber(
    (currentResults as any)?.scheduled_buyer_appreciation_share,
  );
  const projectedExitCost = safeNumber(
    (currentResults as any)?.extension_adjusted_buyout_amount,
  );

  // Time-based computations
  const elapsed = elapsedYears(acceptedAt);
  const cYear = contractYear(acceptedAt);
  const statusLabel = resolveAcceptedStatus(
    canonicalStage ?? null,
    elapsed,
    dealTerms,
  );

  // Current modeled buyout (at elapsed years, from the projection formula)
  const currentModeledBuyout = useMemo(() => {
    if (!renderable || totalBuyerFunding === null || appreciationShare === null || elapsed === null) {
      return null;
    }
    const fmv = propertyValue * Math.pow(1 + annualAppreciation, elapsed);
    const gain = Math.max(0, fmv - propertyValue);
    return totalBuyerFunding + appreciationShare * gain;
  }, [renderable, totalBuyerFunding, appreciationShare, elapsed, propertyValue, annualAppreciation]);

  // Year-by-year chart data
  const yearlyChartData = useMemo((): {
    series: BuyoutPoint[];
    exitBuyout: number;
  } | null => {
    if (!renderable || totalBuyerFunding === null || appreciationShare === null) {
      return null;
    }

    const series = buildYearlyBuyoutSeries(
      propertyValue,
      annualAppreciation,
      totalBuyerFunding,
      appreciationShare,
      longStopYear,
    );

    if (series.length < 2) return null;

    const exitYearRounded = Math.round(exitYear);
    const exitPoint =
      series.find((p) => p.year === exitYearRounded) ??
      series[Math.min(exitYearRounded, series.length - 1)];

    return { series, exitBuyout: exitPoint.buyout };
  }, [
    renderable,
    propertyValue,
    annualAppreciation,
    totalBuyerFunding,
    appreciationShare,
    longStopYear,
    exitYear,
  ]);

  // Lifecycle timeline milestones
  const timelineMilestones = useMemo((): TimelineMilestone[] => {
    return [
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
    ];
  }, [acceptedAt, minimumHoldYears, exitWindowStart, exitWindowEnd, exitYear, longStopYear]);

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

      {/* Status metric cards */}
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

      {/* No acceptedAt warning */}
      {!acceptedAt && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
          Acceptance date is not recorded — Contract Year and time-based status
          are unavailable. Contact your account team if this needs to be
          corrected.
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

      {/* Charts and timeline — only when renderable */}
      {renderable && yearlyChartData ? (
        <>
          {/* Buyout chart */}
          <div className="rounded-lg border bg-card px-4 pt-4 pb-2">
            <p className="text-xs font-medium mb-1">
              Projected buyout by contract year
            </p>
            <p className="text-[10px] text-muted-foreground mb-3">
              Blue line — projected buyout. Amber marker = current modeled
              position. Green marker = Year {exitYear} (your modeled exit).
            </p>
            <AcceptedBuyoutLineChart
              series={yearlyChartData.series}
              exitYear={Math.round(exitYear)}
              exitBuyout={yearlyChartData.exitBuyout}
              elapsedYears={elapsed}
            />
            <p className="text-[10px] text-muted-foreground mt-2">
              Assumes {fmtPercent(annualAppreciation)} annual appreciation.
              Values are modeled projections, not posted payment data.
            </p>
          </div>

          {/* Lifecycle timeline */}
          <div className="rounded-lg border bg-muted/10 px-4 py-4">
            <p className="text-xs font-medium mb-3">Agreement timeline</p>
            <LifecycleTimeline
              milestones={timelineMilestones}
              elapsedYears={elapsed}
            />
          </div>

          {/* Projection summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-lg border bg-muted/20 px-4 py-3 space-y-2">
              <p className="text-xs font-semibold">Projected at exit</p>
              <dl className="space-y-1">
                <div className="flex justify-between text-xs">
                  <dt className="text-muted-foreground">Projected exit cost</dt>
                  <dd className="font-medium">
                    {projectedExitCost !== null
                      ? fmtCurrency(projectedExitCost)
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between text-xs">
                  <dt className="text-muted-foreground">Modeled exit year</dt>
                  <dd className="font-medium">Year {exitYear}</dd>
                </div>
                <div className="flex justify-between text-xs">
                  <dt className="text-muted-foreground">Appreciation share</dt>
                  <dd className="font-medium">
                    {appreciationShare !== null
                      ? fmtPercent(appreciationShare)
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between text-xs">
                  <dt className="text-muted-foreground">Annual appreciation</dt>
                  <dd className="font-medium">
                    {fmtPercent(annualAppreciation)}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-lg border bg-muted/20 px-4 py-3 space-y-2">
              <p className="text-xs font-semibold">Agreement milestones</p>
              <dl className="space-y-1">
                <div className="flex justify-between text-xs">
                  <dt className="text-muted-foreground">Minimum hold</dt>
                  <dd className="font-medium">Year {minimumHoldYears}</dd>
                </div>
                <div className="flex justify-between text-xs">
                  <dt className="text-muted-foreground">Exit window</dt>
                  <dd className="font-medium">
                    Year {exitWindowStart} – {exitWindowEnd}
                  </dd>
                </div>
                <div className="flex justify-between text-xs">
                  <dt className="text-muted-foreground">Long-stop date</dt>
                  <dd className="font-medium">Year {longStopYear}</dd>
                </div>
              </dl>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
