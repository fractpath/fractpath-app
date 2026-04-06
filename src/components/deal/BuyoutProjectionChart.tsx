"use client";

import { useRef, useState, useCallback } from "react";
import type { BuyoutPoint, ExtensionWindowConfig } from "@/lib/deal/buyoutProjection";

// ─── Layout constants ─────────────────────────────────────────────────────────

const SVG_W = 480;
const SVG_H = 175;
const PAD_L = 56;
const PAD_R = 20;
const PAD_T = 14;
const PAD_B = 32;
const PLOT_W = SVG_W - PAD_L - PAD_R;
const PLOT_H = SVG_H - PAD_T - PAD_B;

// ─── Formatting ───────────────────────────────────────────────────────────────

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

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1).replace(".0", "")}%`;
}

// ─── Hover state ─────────────────────────────────────────────────────────────

type HoverState = {
  svgX: number;
  svgY: number;
  month: number;
  baseBuyout: number;
  extensionPremiumPct: number;
  buyout: number;
  windowLabel: string;
};

// ─── Extension band descriptors ──────────────────────────────────────────────

type BandDescriptor = {
  startYear: number;
  endYear: number;
  label: string;
  fillColor: string;
};

function buildBands(
  cfg: ExtensionWindowConfig,
  maxYear: number,
): BandDescriptor[] {
  const bands: BandDescriptor[] = [];

  // Minimum hold (pre-exit) band
  if (cfg.minimumHoldYears > 0) {
    bands.push({
      startYear: 0,
      endYear: Math.min(cfg.minimumHoldYears, maxYear),
      label: "Hold",
      fillColor: "rgba(148,163,184,0.15)",
    });
  }

  // Target exit window (no premium) — green tint
  const targetStart = Math.max(cfg.targetExitStart, 0);
  const targetEnd = Math.min(cfg.targetExitEnd, maxYear);
  if (targetEnd > targetStart) {
    bands.push({
      startYear: targetStart,
      endYear: targetEnd,
      label: "Exit window",
      fillColor: "rgba(134,239,172,0.18)",
    });
  }

  // First extension — amber tint
  if (cfg.firstExtStart !== null && cfg.firstExtEnd !== null) {
    const s = Math.max(cfg.firstExtStart, 0);
    const e = Math.min(cfg.firstExtEnd, maxYear);
    if (e > s) {
      bands.push({
        startYear: s,
        endYear: e,
        label: `+${fmtPct(cfg.firstExtPremiumPct)}`,
        fillColor: "rgba(253,224,71,0.18)",
      });
    }
  }

  // Second extension — orange tint
  if (cfg.secondExtStart !== null && cfg.secondExtEnd !== null) {
    const s = Math.max(cfg.secondExtStart, 0);
    const e = Math.min(cfg.secondExtEnd, maxYear);
    if (e > s) {
      bands.push({
        startYear: s,
        endYear: e,
        label: `+${fmtPct(cfg.secondExtPremiumPct)}`,
        fillColor: "rgba(251,146,60,0.18)",
      });
    }
  }

  return bands;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export type BuyoutProjectionChartProps = {
  series: BuyoutPoint[];
  exitYear: number;
  exitBuyout: number;
  elapsedMonths?: number | null;
  chartLabel?: string;
  chartSubLabel?: string;
  chartFootnote?: string;
  /**
   * Extension window configuration.
   * When provided, shaded bands and boundary markers are rendered
   * and the tooltip shows window label + premium breakdown.
   */
  extensionConfig?: ExtensionWindowConfig;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function BuyoutProjectionChart({
  series,
  exitYear,
  exitBuyout,
  elapsedMonths,
  chartLabel = "Projected buyout by month",
  chartSubLabel,
  chartFootnote,
  extensionConfig,
}: BuyoutProjectionChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<HoverState | null>(null);

  if (series.length < 2) return null;

  const maxMonth = series[series.length - 1].month;
  const maxYear = maxMonth / 12;
  const values = series.map((p) => p.buyout);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const valRange = maxVal - minVal || 1;

  function toX(month: number): number {
    return PAD_L + (month / maxMonth) * PLOT_W;
  }
  function toY(val: number): number {
    return PAD_T + PLOT_H - ((val - minVal) / valRange) * PLOT_H;
  }

  // Reduced series for the polyline
  const stride = Math.max(1, Math.floor(maxMonth / (PLOT_W / 2)));
  const reducedSeries: BuyoutPoint[] = [];
  for (let i = 0; i < series.length; i += stride) reducedSeries.push(series[i]);
  if (reducedSeries[reducedSeries.length - 1] !== series[series.length - 1]) {
    reducedSeries.push(series[series.length - 1]);
  }

  const polylinePoints = reducedSeries
    .map((p) => `${toX(p.month).toFixed(1)},${toY(p.buyout).toFixed(1)}`)
    .join(" ");

  // Y-axis grid
  const yGridCount = 3;
  const yGridLines = Array.from({ length: yGridCount + 1 }, (_, i) => {
    const val = minVal + (valRange * i) / yGridCount;
    return { val, y: toY(val) };
  });

  // X-axis year ticks
  const totalYears = maxYear;
  const xTickInterval = totalYears <= 8 ? 1 : totalYears <= 15 ? 2 : 3;
  const xTicks: number[] = [];
  for (let y = 0; y <= totalYears; y += xTickInterval) xTicks.push(y);
  if (xTicks[xTicks.length - 1] !== totalYears) xTicks.push(totalYears);

  // Exit year marker
  const exitMonth = Math.round(exitYear * 12);
  const exitMonthClamped = Math.min(exitMonth, maxMonth);
  const exitX = toX(exitMonthClamped);
  const exitYpx = toY(exitBuyout);

  // Current position marker
  const elapsedM = elapsedMonths ?? null;
  const currentMonthClamped =
    elapsedM !== null ? Math.min(Math.max(elapsedM, 0), maxMonth) : null;
  const currentX = currentMonthClamped !== null ? toX(currentMonthClamped) : null;
  const currentBuyout: number | null = (() => {
    if (currentMonthClamped === null) return null;
    const frac = currentMonthClamped;
    const lo = series[Math.floor(frac)];
    const hi = series[Math.min(Math.ceil(frac), series.length - 1)];
    if (!lo || !hi) return null;
    const t = frac - Math.floor(frac);
    return lo.buyout + t * (hi.buyout - lo.buyout);
  })();
  const currentYpx =
    currentX !== null && currentBuyout !== null ? toY(currentBuyout) : null;

  // Extension bands
  const bands = extensionConfig ? buildBands(extensionConfig, maxYear) : [];

  // ─── Hover handler ────────────────────────────────────────────────────────

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const svgX = ((e.clientX - rect.left) / rect.width) * SVG_W;
      const rawMonth = ((svgX - PAD_L) / PLOT_W) * maxMonth;
      const month = Math.round(Math.min(Math.max(rawMonth, 0), maxMonth));
      const pt = series[month];
      if (!pt) return;
      setHover({
        svgX: toX(month),
        svgY: toY(pt.buyout),
        month,
        baseBuyout: pt.baseBuyout,
        extensionPremiumPct: pt.extensionPremiumPct,
        buyout: pt.buyout,
        windowLabel: pt.windowLabel,
      });
    },
    [series, maxMonth],
  );

  const handleMouseLeave = useCallback(() => setHover(null), []);

  const tooltipRight = hover ? hover.svgX > SVG_W * 0.55 : false;

  const FRACTIONS = [1.0, 0.75, 0.5, 0.25] as const;
  const FRACTION_LABELS = ["Full exit (100%)", "75%", "50%", "25%"] as const;

  return (
    <div className="relative">
      {chartLabel && (
        <p className="text-xs font-medium mb-1">{chartLabel}</p>
      )}
      {chartSubLabel && (
        <p className="text-[10px] text-muted-foreground mb-3">{chartSubLabel}</p>
      )}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="w-full cursor-crosshair"
        aria-label={chartLabel ?? "Projected buyout chart"}
        role="img"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Extension window bands — rendered first so they appear behind everything */}
        {bands.map((band) => {
          const bx1 = toX(band.startYear * 12);
          const bx2 = toX(band.endYear * 12);
          const bw = bx2 - bx1;
          if (bw < 1) return null;
          const labelX = bx1 + bw / 2;
          return (
            <g key={band.label + band.startYear}>
              <rect
                x={bx1}
                y={PAD_T}
                width={bw}
                height={PLOT_H}
                fill={band.fillColor}
              />
              {bw > 20 && (
                <text
                  x={labelX}
                  y={PAD_T + 7}
                  textAnchor="middle"
                  fontSize="7.5"
                  fill="#6b7280"
                  fontFamily="system-ui, sans-serif"
                  opacity="0.9"
                >
                  {band.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Extension boundary vertical ticks (extension start/end years) */}
        {extensionConfig && (() => {
          const boundaries: number[] = [];
          if (extensionConfig.firstExtStart !== null) boundaries.push(extensionConfig.firstExtStart);
          if (extensionConfig.firstExtEnd !== null) boundaries.push(extensionConfig.firstExtEnd);
          if (extensionConfig.secondExtStart !== null) boundaries.push(extensionConfig.secondExtStart);
          if (extensionConfig.secondExtEnd !== null) boundaries.push(extensionConfig.secondExtEnd);
          return boundaries
            .filter((yr) => yr > 0 && yr < maxYear)
            .map((yr) => (
              <line
                key={`ext-boundary-${yr}`}
                x1={toX(yr * 12)}
                x2={toX(yr * 12)}
                y1={PAD_T}
                y2={PAD_T + PLOT_H}
                stroke="#d1d5db"
                strokeWidth="1"
                strokeDasharray="2 2"
                opacity="0.8"
              />
            ));
        })()}

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

        {/* X-axis year ticks */}
        {xTicks.map((y) => (
          <g key={y}>
            <line
              x1={toX(y * 12)}
              x2={toX(y * 12)}
              y1={PAD_T + PLOT_H}
              y2={PAD_T + PLOT_H + 4}
              stroke="#d1d5db"
              strokeWidth="1"
            />
            <text
              x={toX(y * 12)}
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

        {/* Exit year dashed guide */}
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

        {/* Modeled exit marker (green) */}
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

        {/* Hover cross-hair */}
        {hover && (
          <>
            <line
              x1={hover.svgX}
              x2={hover.svgX}
              y1={PAD_T}
              y2={PAD_T + PLOT_H}
              stroke="#6366f1"
              strokeWidth="1"
              strokeDasharray="2 2"
              opacity="0.6"
              pointerEvents="none"
            />
            <circle
              cx={hover.svgX}
              cy={hover.svgY}
              r="4"
              fill="#6366f1"
              pointerEvents="none"
            />
            <circle
              cx={hover.svgX}
              cy={hover.svgY}
              r="2"
              fill="white"
              pointerEvents="none"
            />
          </>
        )}
      </svg>

      {/* Hover tooltip */}
      {hover && (
        <div
          className={`pointer-events-none absolute z-10 rounded-lg border bg-popover/95 backdrop-blur-sm shadow-lg px-3 py-2.5 text-xs min-w-[188px] ${
            tooltipRight ? "right-0" : "left-0"
          }`}
          style={{
            top: `calc(${((hover.svgY + PAD_T) / SVG_H) * 100}% - 2rem)`,
            transform: "translateY(-50%)",
          }}
          aria-live="polite"
        >
          {/* Month / year */}
          <p className="font-semibold text-foreground mb-0.5 leading-tight">
            Month {hover.month}{" "}
            <span className="font-normal text-muted-foreground">
              (Yr {(hover.month / 12).toFixed(1).replace(".0", "")})
            </span>
          </p>

          {/* Window label */}
          {hover.windowLabel ? (
            <p className="text-[10px] text-muted-foreground mb-1.5 leading-tight">
              {hover.windowLabel}
            </p>
          ) : (
            <div className="mb-1.5" />
          )}

          {/* Base / premium / adjusted breakdown */}
          {hover.extensionPremiumPct > 0 ? (
            <div className="space-y-0.5 mb-1.5 pb-1.5 border-b">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Base exit cost</span>
                <span className="tabular-nums">{fmtCurrency(hover.baseBuyout)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-amber-600 font-medium">
                  {hover.windowLabel === "Second extension"
                    ? `Extension premium (2nd) +${fmtPct(hover.extensionPremiumPct)}`
                    : `Extension premium (1st) +${fmtPct(hover.extensionPremiumPct)}`}
                </span>
                <span className="tabular-nums text-amber-600 font-medium">
                  +{fmtCurrency(hover.buyout - hover.baseBuyout)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 font-medium">
                <span>Total exit cost</span>
                <span className="tabular-nums">{fmtCurrency(hover.buyout)}</span>
              </div>
              {extensionConfig && (
                <p className="text-[10px] text-muted-foreground leading-tight pt-0.5">
                  {`Exiting in Yr ${extensionConfig.targetExitStart}–${extensionConfig.targetExitEnd} avoids this cost`}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-0.5 mb-1.5 pb-1.5 border-b">
              <div className="flex items-center justify-between gap-3 font-medium">
                <span>Exit cost</span>
                <span className="tabular-nums">{fmtCurrency(hover.buyout)}</span>
              </div>
            </div>
          )}

          {/* Partial exit options */}
          <div className="space-y-1">
            {FRACTIONS.map((frac, i) => (
              <div key={frac} className="flex items-center justify-between gap-3">
                <span
                  className={`text-muted-foreground ${frac === 1.0 ? "font-medium text-foreground" : ""}`}
                >
                  {FRACTION_LABELS[i]}
                </span>
                <span
                  className={`tabular-nums font-medium ${frac === 1.0 ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {fmtCurrency(frac * hover.buyout)}
                </span>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-muted-foreground mt-2 leading-tight border-t pt-1.5">
            Projected — not actual payment history
          </p>
        </div>
      )}

      {chartFootnote && (
        <p className="text-[10px] text-muted-foreground mt-2">{chartFootnote}</p>
      )}
    </div>
  );
}
