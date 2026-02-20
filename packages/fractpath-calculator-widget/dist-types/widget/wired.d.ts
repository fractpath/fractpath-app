import type { FractPathCalculatorWidgetProps } from "./types.js";
import type { CalculatorPersona } from "./types.js";
import type { DealTerms, ScenarioAssumptions, RealtorRepresentationMode } from "@fractpath/compute";
export type MarketingLiteState = {
    propertyValue: number;
    upfrontPayment: number;
    monthlyPayment: number;
    numberOfPayments: number;
    exitYear: number;
    growthRatePct: number;
    realtorMode: RealtorRepresentationMode;
    realtorPct: number;
};
export declare function buildMarketingDealTerms(state: MarketingLiteState): DealTerms;
export declare function buildMarketingAssumptions(state: MarketingLiteState): ScenarioAssumptions;
declare const MARKETING_PERSONAS: CalculatorPersona[];
export { MARKETING_PERSONAS };
export declare function WiredCalculatorWidget(props: FractPathCalculatorWidgetProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=wired.d.ts.map