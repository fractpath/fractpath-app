import type { CalculatorPersona } from "./types.js";
import type { ScenarioOutputs } from "../calc/types.js";
export type PersonaConfig = {
    heroLabel: string;
    heroValue: (outputs: ScenarioOutputs) => number;
    helperText: string;
};
export declare function getPersonaConfig(persona: CalculatorPersona): PersonaConfig;
//# sourceMappingURL=persona.d.ts.map