/**
 * Compute wrapper for blur-triggered preview.
 *
 * Canonical compute signature (from packages/compute):
 *   computeDeal(terms: DealTerms, assumptions: ScenarioAssumptions): DealResults
 *
 * DraftCanonicalInputs stores { deal_terms: DealTerms, scenario: ScenarioAssumptions }.
 * This wrapper maps draft.deal_terms → terms, draft.scenario → assumptions.
 * No field renames needed — canonical names match exactly.
 */
import { type DealResults } from "@fractpath/compute";
import type { DraftCanonicalInputs } from "./types.js";
export declare function previewCompute(draft: DraftCanonicalInputs): DealResults;
//# sourceMappingURL=previewCompute.d.ts.map