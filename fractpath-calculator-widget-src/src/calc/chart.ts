import type { ScenarioOutputs, SettlementTiming, TimePoint } from "./types.js";

export type ChartPoint = {
  month: number;
  year: number;
  homeValue: number;
  equityPct: number;
};

export type SettlementMarker = {
  timing: SettlementTiming;
  month: number;
  year: number;
  homeValueAtSettlement: number;
  equityPctAtSettlement: number;
  netPayout: number;
};

export type ChartSeries = {
  points: ChartPoint[];
  markers: SettlementMarker[];
};

/**
 * Pure transformer: converts ScenarioOutputs into chart-ready points + settlement markers.
 * No additional math beyond selecting fields and formatting structure.
 */
export function buildChartSeries(outputs: ScenarioOutputs): ChartSeries {
  const points: ChartPoint[] = outputs.series.map((p: TimePoint) => ({
    month: p.month,
    year: p.year,
    homeValue: p.homeValue,
    equityPct: p.equityPct
  }));

  const markers: SettlementMarker[] = (["early", "standard", "late"] as const).map((timing) => {
    const s = outputs.settlements[timing];
    return {
      timing,
      month: s.settlementMonth,
      year: s.settlementMonth / 12,
      homeValueAtSettlement: s.homeValueAtSettlement,
      equityPctAtSettlement: s.equityPctAtSettlement,
      netPayout: s.netPayout
    };
  });

  return { points, markers };
}
