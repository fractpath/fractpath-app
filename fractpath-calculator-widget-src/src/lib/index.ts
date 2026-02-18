export { FractPathCalculatorWidget } from "../widget/FractPathCalculatorWidget.js";

export { computeScenario, normalizeInputs } from "../calc/calc.js";
export { buildChartSeries } from "../calc/chart.js";
export { EquityChart } from "../components/EquityChart.js";

export { buildDraftSnapshot, buildShareSummary, buildSavePayload } from "../widget/snapshot.js";
export { deterministicHash } from "../widget/hash.js";

export type {
  CalculatorPersona,
  CalculatorMode,
  DraftSnapshot,
  DraftSnapshotInputs,
  DraftSnapshotBasicResults,
  ShareSummary,
  ShareSummaryBasicResults,
  SavePayload,
  WidgetEvent,
  FractPathCalculatorWidgetProps,
} from "../widget/types.js";

export { CONTRACT_VERSION, SCHEMA_VERSION } from "../widget/types.js";

export type {
  ScenarioInputs,
  ScenarioOutputs,
  SettlementResult,
  SettlementTiming,
  TimePoint,
} from "../calc/types.js";

export type {
  ChartPoint,
  SettlementMarker,
  ChartSeries,
} from "../calc/chart.js";
