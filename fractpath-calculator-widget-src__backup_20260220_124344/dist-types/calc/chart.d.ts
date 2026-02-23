import type { ScenarioOutputs, SettlementTiming } from "./types.js";
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
export declare function buildChartSeries(outputs: ScenarioOutputs): ChartSeries;
//# sourceMappingURL=chart.d.ts.map