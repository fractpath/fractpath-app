# WGT-011 — Chart Series + Visualization (Transform Only, No New Math)

## Objective

Generate chart-ready series from the deterministic compute module outputs (WGT-010) and render a minimal, investor-presentable chart surface:

- Equity ownership over time (primary)
- Exit summary representation (Early / Standard / Late)

This ticket must not introduce any new economic logic. It may only:
- transform
- format
- label
- map already-computed outputs into chart-friendly shapes

---

# Architecture Alignment (Frozen)

- The compute engine (WGT-010) is the only source of truth for numeric economics.
- Chart builder must consume outputs as-is and must not recompute settlement math.
- Marketing mode renders only marketing-allowed chart surfaces per WGT-031.
- App mode may render full-fidelity charts based on persisted snapshot outputs supplied by the host app.

---

## Dependencies

- WGT-010 — Deterministic calculator engine (`ScenarioInputsV1`, `ScenarioOutputsV1`)
- WGT-031 — Marketing Basic Results allowlist + chart restrictions
- WGT-050 — Contract versioning (chart series shape changes are versioned)

---

## Non-goals

- No new formulas
- No modifications to computeScenarioV1
- No persistence
- No networking
- No design system refactor beyond adding minimal chart component

---

## Deliverables

## 1) Chart series builder (Transform-only)

Create:
- `shared/calc/chart.ts`

Export:
- `buildChartSeriesV1(inputs: ScenarioInputsV1, outputs: ScenarioOutputsV1): ScenarioChartSeriesV1`

Where `ScenarioChartSeriesV1` includes only the derived series needed for rendering.

### Required series

#### equityOverTime
Array of points:
- `{ monthIndex, monthLabel, buyerEquityPct, homeownerEquityPct }`

Source-of-truth:
- must be derived from `outputs.series` fields produced by WGT-010 (no recompute).

#### fmvOverTime (optional)
- `{ monthIndex, estimatedFmvUsd }`
Only if already available in outputs.

#### exitMarkers (required)
- `{ scenario: "early" | "standard" | "late", exitMonthIndex, buyerPayoutUsd, homeownerNetUsd?, floorApplied, capApplied }`

Rules:
- `buyerPayoutUsd` must come from scenario outputs (already computed).
- `exitMonthIndex` is index math only (year→month mapping).
- Stable ordering: early, standard, late.

No scenario math recalculation is permitted.

---

## 2) Minimal chart component (Widget Repo)

Create:
- `client/components/EquityChart.tsx` (or equivalent)

Requirements:
- Render equity ownership over time using `equityOverTime`.
- Minimal legend:
  - Buyer equity
  - Homeowner equity
- Render exit markers:
  - markers on axis OR tooltip rows OR secondary points (choose simplest in the chart library)

Implementation constraints:
- Use existing chart lib if present; otherwise use Recharts.
- Must render with default inputs without runtime errors.

---

# Mode Safety Rules (WGT-031 Alignment)

## Marketing Mode
Chart must not expose:
- payment schedules
- settlement payout tables
- fee waterfalls
- contract-like detailed series

Allowed:
- simple ownership-over-time visualization
- minimal exit markers (no detailed breakdown tooltips beyond allowed fields)

## App Mode
Host app may render full chart surfaces based on persisted snapshot outputs.
No marketing gating or truncation required in app mode.

---

## Acceptance Criteria

- `buildChartSeriesV1` exists and produces series from outputs without recompute.
- Chart renders in local dev without errors.
- Equity chart is visible, readable, and investor-presentable.
- Exit markers are visible (marker/tooltip/secondary points).
- No new math is introduced.
- Marketing mode rendering conforms to WGT-031 restrictions.

---

## QA Checklist

- Equity % within [0, 100]
- Buyer + homeowner equity sums to 100 (within rounding tolerance)
- Exit markers align to expected months/years
- Small screens do not break layout

