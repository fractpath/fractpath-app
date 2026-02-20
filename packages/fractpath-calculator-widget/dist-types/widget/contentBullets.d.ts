import type { CalculatorPersona } from "./types.js";
import type { TabKey } from "./editing/tabConfig.js";
type MarketingBulletInputs = {
    netPayout: number;
    initialBuyAmount: number;
    homeValue: number;
    termYears: number;
    growthRatePct: number;
    settlementMonth: number;
};
export declare function getMarketingBullets(persona: CalculatorPersona, inputs: MarketingBulletInputs): string[];
type TabExplainerInputs = {
    upfrontPayment?: number;
    monthlyPayment?: number;
    numberOfPayments?: number;
    contractMaturityYears?: number;
    minimumHoldYears?: number;
    exitYear?: number;
    platformFee?: number;
    servicingFeeMonthly?: number;
    exitFeePct?: number;
};
export declare function getTabExplainer(tab: TabKey, persona: CalculatorPersona, inputs: TabExplainerInputs): string[];
export {};
//# sourceMappingURL=contentBullets.d.ts.map