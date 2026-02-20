import type { ChartSeries, SettlementMarker } from "../calc/chart.js";

type Props = {
  series: ChartSeries;
  width?: number;
  height?: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function formatPct(x: number) {
  return `${Math.round(x * 100)}%`;
}

function formatYear(y: number) {
  // 1 decimal place for readability
  return `${Math.round(y * 10) / 10}y`;
}

function markerLabel(m: SettlementMarker) {
  if (m.timing === "early") return "Early";
  if (m.timing === "late") return "Late";
  return "Std";
}

/**
 * Minimal dependency-free SVG line chart:
 * - plots equityPct over time
 * - shows settlement markers for early/standard/late
 */
export function EquityChart({ series, width = 640, height = 240 }: Props) {
  const { points, markers } = series;

  if (!points.length) {
    return <div style={{ fontFamily: "system-ui, sans-serif" }}>No data</div>;
  }

  const padding = { top: 16, right: 16, bottom: 28, left: 44 };

  const innerW = Math.max(10, width - padding.left - padding.right);
  const innerH = Math.max(10, height - padding.top - padding.bottom);

  const xMin = points[0].month;
  const xMax = points[points.length - 1].month;

  // Equity is 0..1 but clamp defensively
  const yMin = 0;
  const yMax = 1;

  const xScale = (month: number) => {
    if (xMax === xMin) return padding.left;
    return padding.left + ((month - xMin) / (xMax - xMin)) * innerW;
  };

  const yScale = (equityPct: number) => {
    const v = clamp(equityPct, yMin, yMax);
    // invert because SVG y increases downward
    return padding.top + (1 - (v - yMin) / (yMax - yMin)) * innerH;
  };

  const pathD = points
    .map((p, i) => {
      const x = xScale(p.month);
      const y = yScale(p.equityPct);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  // Simple y-axis ticks: 0%, 50%, 100%
  const yTicks = [0, 0.5, 1].map((v) => ({
    v,
    y: yScale(v),
    label: formatPct(v)
  }));

  // Simple x-axis ticks: 0, mid, end (in years)
  const midMonth = Math.round((xMin + xMax) / 2);
  const xTicks = [xMin, midMonth, xMax].map((m) => ({
    m,
    x: xScale(m),
    label: formatYear(m / 12)
  }));

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label="Equity over time"
      style={{ display: "block" }}
    >
      {/* Background */}
      <rect x={0} y={0} width={width} height={height} fill="white" />

      {/* Grid + Y ticks */}
      {yTicks.map((t) => (
        <g key={t.v}>
          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={t.y}
            y2={t.y}
            stroke="#e5e7eb"
            strokeWidth={1}
          />
          <text
            x={padding.left - 8}
            y={t.y + 4}
            fontSize={12}
            textAnchor="end"
            fill="#6b7280"
            fontFamily="system-ui, sans-serif"
          >
            {t.label}
          </text>
        </g>
      ))}

      {/* X axis line */}
      <line
        x1={padding.left}
        x2={width - padding.right}
        y1={padding.top + innerH}
        y2={padding.top + innerH}
        stroke="#e5e7eb"
        strokeWidth={1}
      />

      {/* X ticks */}
      {xTicks.map((t) => (
        <g key={t.m}>
          <line
            x1={t.x}
            x2={t.x}
            y1={padding.top + innerH}
            y2={padding.top + innerH + 6}
            stroke="#9ca3af"
            strokeWidth={1}
          />
          <text
            x={t.x}
            y={padding.top + innerH + 20}
            fontSize={12}
            textAnchor="middle"
            fill="#6b7280"
            fontFamily="system-ui, sans-serif"
          >
            {t.label}
          </text>
        </g>
      ))}

      {/* Settlement markers */}
      {markers.map((m) => {
        const x = xScale(m.month);
        return (
          <g key={m.timing}>
            <line
              x1={x}
              x2={x}
              y1={padding.top}
              y2={padding.top + innerH}
              stroke="#d1d5db"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <rect
              x={x - 16}
              y={padding.top - 2}
              width={32}
              height={16}
              rx={6}
              fill="#f3f4f6"
              stroke="#e5e7eb"
            />
            <text
              x={x}
              y={padding.top + 10}
              fontSize={11}
              textAnchor="middle"
              fill="#374151"
              fontFamily="system-ui, sans-serif"
            >
              {markerLabel(m)}
            </text>
          </g>
        );
      })}

      {/* Equity line */}
      <path d={pathD} fill="none" stroke="#111827" strokeWidth={2} />

      {/* Axis title */}
      <text
        x={padding.left}
        y={14}
        fontSize={12}
        fill="#374151"
        fontFamily="system-ui, sans-serif"
      >
        Equity ownership over time
      </text>
    </svg>
  );
}
