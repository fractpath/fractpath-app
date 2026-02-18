import type { ScenarioInputs, ScenarioOutputs } from "../calc/types.js";
import type {
  CalculatorPersona,
  DraftSnapshot,
  DraftSnapshotInputs,
  DraftSnapshotBasicResults,
  ShareSummary,
  ShareSummaryBasicResults,
  SavePayload,
} from "./types.js";
import { CONTRACT_VERSION } from "./types.js"; // keep contract version dynamic
import { deterministicHash } from "./hash.js";

function extractDraftInputs(inputs: ScenarioInputs): DraftSnapshotInputs {
  return {
    homeValue: inputs.homeValue,
    initialBuyAmount: inputs.initialBuyAmount,
    termYears: inputs.termYears,
    annualGrowthRate: inputs.annualGrowthRate,
  };
}

function extractDraftBasicResults(
  outputs: ScenarioOutputs,
): DraftSnapshotBasicResults {
  return {
    standard_net_payout: outputs.settlements.standard.netPayout,
    early_net_payout: outputs.settlements.early.netPayout,
    late_net_payout: outputs.settlements.late.netPayout,
    standard_settlement_month: outputs.settlements.standard.settlementMonth,
    early_settlement_month: outputs.settlements.early.settlementMonth,
    late_settlement_month: outputs.settlements.late.settlementMonth,
  };
}

function extractShareBasicResults(
  outputs: ScenarioOutputs,
): ShareSummaryBasicResults {
  return {
    standard_net_payout: outputs.settlements.standard.netPayout,
    early_net_payout: outputs.settlements.early.netPayout,
    late_net_payout: outputs.settlements.late.netPayout,
  };
}

export async function buildDraftSnapshot(
  persona: CalculatorPersona,
  normalizedInputs: ScenarioInputs,
  outputs: ScenarioOutputs,
): Promise<DraftSnapshot> {
  const inputs = extractDraftInputs(normalizedInputs);
  const basic_results = extractDraftBasicResults(outputs);

  const [input_hash, output_hash] = await Promise.all([
    deterministicHash(inputs as unknown as Record<string, unknown>),
    deterministicHash(basic_results as unknown as Record<string, unknown>),
  ]);

  return {
    contract_version: CONTRACT_VERSION,
    schema_version: "v1", // ✅ fixed
    persona,
    mode: "marketing",
    inputs,
    basic_results,
    input_hash,
    output_hash,
    created_at: new Date().toISOString(),
  };
}

export function buildShareSummary(
  persona: CalculatorPersona,
  normalizedInputs: ScenarioInputs,
  outputs: ScenarioOutputs,
): ShareSummary {
  return {
    contract_version: CONTRACT_VERSION,
    schema_version: "v1", // ✅ fixed
    persona,
    inputs: extractDraftInputs(normalizedInputs),
    basic_results: extractShareBasicResults(outputs),
    created_at: new Date().toISOString(),
  };
}

export async function buildSavePayload(
  persona: CalculatorPersona,
  normalizedInputs: ScenarioInputs,
  outputs: ScenarioOutputs,
): Promise<SavePayload> {
  const [input_hash, output_hash] = await Promise.all([
    deterministicHash(normalizedInputs as unknown as Record<string, unknown>),
    deterministicHash({
      standard: outputs.settlements.standard,
      early: outputs.settlements.early,
      late: outputs.settlements.late,
    } as unknown as Record<string, unknown>),
  ]);

  return {
    contract_version: CONTRACT_VERSION,
    schema_version: "v1", // ✅ fixed
    persona,
    mode: "app",
    inputs: normalizedInputs,
    outputs,
    input_hash,
    output_hash,
    created_at: new Date().toISOString(),
  };
}
