import type { ScenarioInputs, ScenarioOutputs } from "./types.js";
/**
 * Normalize inputs:
 * - fills missing fields from DEFAULT_INPUTS
 * - ensures vesting.months = termYears * 12
 */
export declare function normalizeInputs(partial: Partial<ScenarioInputs>): ScenarioInputs;
/**
 * Main deterministic engine.
 * Now delegates settlement math to @fractpath/compute (single source of truth).
 */
export declare function computeScenario(partialInputs?: Partial<ScenarioInputs>): ScenarioOutputs;
//# sourceMappingURL=calc.d.ts.map