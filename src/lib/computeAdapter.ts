// src/lib/computeAdapter.ts
// Canonical compute adapter for the app.
// IMPORTANT: do not import runtime compute from local @fractpath/compute (drift risk).
// Instead, compute through the widget package export surface.

type AnyRecord = Record<string, unknown>;

import {
  computeScenario,
  normalizeInputs,
  CONTRACT_VERSION,
  SCHEMA_VERSION,
} from "fractpath-calculator-widget";

/**
 * Computes canonical results for draft inputs shaped like:
 *   { deal_terms: {...}, scenario: {...} }
 *
 * Returns:
 *   { ok, results, compute_version, contract_version, schema_version }
 */
export async function computeDealAdapter(inputs: unknown): Promise<
  | {
      ok: true;
      results: AnyRecord;
      compute_version: string;
      contract_version: string;
      schema_version: string;
    }
  | { ok: false; error: string }
> {
  try {
    const normalized = normalizeInputs(inputs as any);
    const out = computeScenario(normalized as any) as any;

    // Different layers may wrap results differently; normalize to a "results object".
    const results: AnyRecord =
      (out?.results && typeof out.results === "object" ? out.results : out) ??
      {};

    return {
      ok: true,
      results,
      compute_version: CONTRACT_VERSION,
      contract_version: CONTRACT_VERSION,
      schema_version: SCHEMA_VERSION,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "compute failed" };
  }
}

/**
 * Back-compat export.
 * Existing app routes import { computeDeal } from "@/lib/computeAdapter".
 * Keep that stable while we remove legacy call sites.
 */
export const computeDeal = computeDealAdapter;
