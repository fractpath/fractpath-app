import type { DealTerms, ScenarioAssumptions, DealResults } from "@fractpath/compute";
import type { CalculatorPersona } from "../types.js";
export type DealWidgetPermissions = {
    canEdit?: boolean;
};
export type DealSnapshotViewProps = {
    persona?: CalculatorPersona;
    permissions?: DealWidgetPermissions;
    status?: string;
    inputs: {
        deal_terms: DealTerms;
        scenario: ScenarioAssumptions;
    };
    results: DealResults;
};
export declare function DealSnapshotView({ persona, status, inputs, results, }: DealSnapshotViewProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=DealSnapshotView.d.ts.map