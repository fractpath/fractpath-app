import type { ScenarioInputs, ScenarioOutputs } from "../calc/types.js";

export type CalculatorPersona =
  | "homeowner"
  | "buyer"
  | "realtor"
  | "investor"
  | "ops";

export type CalculatorMode = "marketing" | "app";

export const CONTRACT_VERSION = "1.0.0";
export const SCHEMA_VERSION = "1.0.0";

/**
 * Minimal canonical snapshot type for app-mode embedding.
 * Host (fractpath-app) is source of truth; widget must not mutate shape.
 */
export type FullDealSnapshotV1 = {
  contract_version: string;
  schema_version: string;
  deal_terms: Record<string, unknown>;
  assumptions: Record<string, unknown>;
  outputs: Record<string, unknown>;
  now_iso?: string;
  created_at?: string;
};

export type DraftSnapshotInputs = {
  homeValue: number;
  initialBuyAmount: number;
  termYears: number;
  annualGrowthRate: number;
};

export type DraftSnapshotBasicResults = {
  standard_net_payout: number;
  early_net_payout: number;
  late_net_payout: number;
  standard_settlement_month: number;
  early_settlement_month: number;
  late_settlement_month: number;
};

export type DraftSnapshot = {
  contract_version: string;
  schema_version: string;
  persona: CalculatorPersona;
  mode: "marketing";
  inputs: DraftSnapshotInputs;
  basic_results: DraftSnapshotBasicResults;
  input_hash: string;
  output_hash: string;
  created_at: string;
};

export type ShareSummaryBasicResults = {
  standard_net_payout: number;
  early_net_payout: number;
  late_net_payout: number;
};

export type ShareSummary = {
  contract_version: string;
  schema_version: string;
  persona: CalculatorPersona;
  inputs: DraftSnapshotInputs;
  basic_results: ShareSummaryBasicResults;
  created_at: string;
};

export type SavePayload = {
  contract_version: string;
  schema_version: string;
  persona: CalculatorPersona;
  mode: "app";
  inputs: ScenarioInputs;
  outputs: ScenarioOutputs;
  input_hash: string;
  output_hash: string;
  created_at: string;
};

export type WidgetEvent =
  | { type: "calculator_used"; persona: CalculatorPersona }
  | { type: "share_clicked"; persona: CalculatorPersona }
  | { type: "save_continue_clicked"; persona: CalculatorPersona }
  | { type: "save_clicked"; persona: CalculatorPersona };

export type FractPathCalculatorWidgetProps = {
  persona: CalculatorPersona;
  mode?: CalculatorMode;

  // App mode hydration (no compute on mount when provided)
  initialSnapshot?: FullDealSnapshotV1;

  onDraftSnapshot?: (snapshot: DraftSnapshot) => void;
  onShareSummary?: (summary: ShareSummary) => void;

  // In app mode we will call onSave with a canonical snapshot
  onSave?: (payload: SavePayload | FullDealSnapshotV1) => void;

  onEvent?: (event: WidgetEvent) => void;
};
