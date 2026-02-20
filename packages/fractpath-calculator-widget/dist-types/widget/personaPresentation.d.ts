import type { DealTerms, ScenarioAssumptions, DealResults } from "@fractpath/compute";
import type { CalculatorPersona } from "./types.js";
export type ValueFormat = "currency" | "percent" | "multiple" | "text" | "months";
export type HeroSpec = {
    label: string;
    value: number;
    valueFormat: ValueFormat;
    subtitle: string;
};
export type ChipSpec = {
    label: string;
    value: number | string;
    valueFormat: ValueFormat;
};
export type BarSpec = {
    label: string;
    value: number;
};
export type ChartSpec = {
    type: "bar";
    bars: BarSpec[];
};
export type PersonaPresentationResult = {
    hero: HeroSpec;
    strip: ChipSpec[];
    chartSpec: ChartSpec;
    marketingBullets: string[];
};
export declare function resolvePersonaPresentation(persona: CalculatorPersona, dealTerms: DealTerms, assumptions: ScenarioAssumptions, outputs: DealResults): PersonaPresentationResult;
//# sourceMappingURL=personaPresentation.d.ts.map