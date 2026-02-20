import type { DraftCanonicalInputs } from "./types.js";
import type { DealResults } from "@fractpath/compute";
type DraftPath = `deal_terms.${keyof DraftCanonicalInputs["deal_terms"]}` | `scenario.${keyof DraftCanonicalInputs["scenario"]}`;
export declare function useDealDraftState(initial?: DraftCanonicalInputs): {
    readonly draft: DraftCanonicalInputs;
    readonly errors: Partial<Record<string, string>>;
    readonly preview: {
        readonly tier1: import("./types.js").Tier1Preview;
        readonly status: import("./types.js").PreviewStatus;
        readonly error?: string;
        readonly lastComputedAtIso?: string;
        readonly results?: DealResults;
    };
    readonly setField: (path: DraftPath, value: unknown) => void;
    readonly onBlurCompute: () => void;
};
export {};
//# sourceMappingURL=useDealDraftState.d.ts.map