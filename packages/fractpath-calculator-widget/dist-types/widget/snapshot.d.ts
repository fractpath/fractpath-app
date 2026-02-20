import type { ScenarioInputs, ScenarioOutputs } from "../calc/types.js";
import type { DealTerms, ScenarioAssumptions } from "@fractpath/compute";
import { type CalculatorPersona, type FullDealSnapshotV1, type DraftSnapshot, type ShareSummary, type SavePayload } from "./types.js";
export declare function buildDraftSnapshot(persona: CalculatorPersona, normalizedInputs: ScenarioInputs, outputs: ScenarioOutputs): Promise<DraftSnapshot>;
export declare function buildShareSummary(persona: CalculatorPersona, normalizedInputs: ScenarioInputs, outputs: ScenarioOutputs): ShareSummary;
export declare function buildSavePayload(persona: CalculatorPersona, normalizedInputs: ScenarioInputs, outputs: ScenarioOutputs): Promise<SavePayload>;
/**
 * Maps widget-level ScenarioInputs to canonical DealTerms.
 * Missing canonical fields use deterministic defaults documented inline.
 */
export declare function mapWidgetInputsToDealTerms(inputs: ScenarioInputs): DealTerms;
/**
 * Maps widget-level ScenarioInputs to canonical ScenarioAssumptions.
 */
export declare function mapWidgetInputsToAssumptions(inputs: ScenarioInputs): ScenarioAssumptions;
/**
 * Builds canonical FullDealSnapshotV1 from widget inputs.
 * Uses @fractpath/compute for deterministic outputs.
 */
export declare function buildFullDealSnapshotV1(inputs: ScenarioInputs): FullDealSnapshotV1;
//# sourceMappingURL=snapshot.d.ts.map