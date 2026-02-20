import type { CalculatorPersona } from "./types.js";
import type { ScenarioOutputs } from "../calc/types.js";
import type { FieldKey } from "./editing/fieldMeta.js";
export type PersonaConfig = {
    heroLabel: string;
    heroValue: (outputs: ScenarioOutputs) => number;
    helperText: string;
};
export declare function getPersonaConfig(persona: CalculatorPersona): PersonaConfig;
export declare function getLabel(fieldId: FieldKey, persona: CalculatorPersona, fallback: string): string;
type SummaryField = "hero" | "settlement_timing" | "net_payout" | "total_invested" | "fees";
export declare function getSummaryOrder(persona: CalculatorPersona): SummaryField[];
export {};
//# sourceMappingURL=persona.d.ts.map