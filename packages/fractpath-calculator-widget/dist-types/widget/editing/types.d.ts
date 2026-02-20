import type { DealTerms, ScenarioAssumptions, DealResults } from "@fractpath/compute";
export interface DraftCanonicalInputs {
    deal_terms: DealTerms;
    scenario: ScenarioAssumptions;
}
export type FieldErrors = Partial<Record<string, string>>;
export interface Tier1Preview {
    upfrontCash: number;
    installmentsLabel: string;
    totalInstallments: number;
    totalCashPaid: number;
}
export type PreviewStatus = "idle" | "computing" | "ok" | "error";
export interface PreviewState {
    tier1: Tier1Preview;
    status: PreviewStatus;
    error?: string;
    lastComputedAtIso?: string;
    results?: DealResults;
}
export type DownsideMode = DealTerms["downside_mode"];
//# sourceMappingURL=types.d.ts.map