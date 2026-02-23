import type { ChartSeries } from "../calc/chart.js";
type Props = {
    series: ChartSeries;
    width?: number;
    height?: number;
};
/**
 * Minimal dependency-free SVG line chart:
 * - plots equityPct over time
 * - shows settlement markers for early/standard/late
 */
export declare function EquityChart({ series, width, height }: Props): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=EquityChart.d.ts.map