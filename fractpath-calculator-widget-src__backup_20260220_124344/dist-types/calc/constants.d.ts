import type { ScenarioInputs } from "./types.js";
/**
 * Default constants (MVP).
 * Replace these values with the frozen spec numbers from marketing-homepage-spec.md
 * when you wire the engine to the canonical spec.
 */
export declare const DEFAULT_ANNUAL_GROWTH_RATE = 0.03;
export declare const DEFAULT_TF_STANDARD = 0.035;
export declare const DEFAULT_TF_EARLY = 0.045;
export declare const DEFAULT_TF_LATE = 0.025;
export declare const DEFAULT_FLOOR_MULTIPLE = 1.1;
export declare const DEFAULT_CAP_MULTIPLE = 2;
export declare const DEFAULT_CPW_START_PCT = 0.01;
export declare const DEFAULT_CPW_END_PCT = 0.03;
export declare const DEFAULT_UPFRONT_EQUITY_PCT = 0.1;
export declare const DEFAULT_MONTHLY_EQUITY_PCT = 0.0025;
/**
 * Minimal baseline inputs for immediate render in the widget.
 * The UI can override these; calc.ts will normalize if callers pass partials later.
 */
export declare const DEFAULT_INPUTS: ScenarioInputs;
//# sourceMappingURL=constants.d.ts.map