import type { ScenarioInputs, ScenarioOutputs } from "../calc/types.js";
import type { CalculatorPersona, DraftSnapshot, ShareSummary, SavePayload } from "./types.js";
export declare function buildDraftSnapshot(persona: CalculatorPersona, normalizedInputs: ScenarioInputs, outputs: ScenarioOutputs): Promise<DraftSnapshot>;
export declare function buildShareSummary(persona: CalculatorPersona, normalizedInputs: ScenarioInputs, outputs: ScenarioOutputs): ShareSummary;
export declare function buildSavePayload(persona: CalculatorPersona, normalizedInputs: ScenarioInputs, outputs: ScenarioOutputs): Promise<SavePayload>;
//# sourceMappingURL=snapshot.d.ts.map