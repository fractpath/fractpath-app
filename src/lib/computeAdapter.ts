import { CONTRACT_VERSION, SCHEMA_VERSION } from "@/lib/contractVersion";
import * as Widget from "fractpath-calculator-widget";

type AnyRecord = Record<string, unknown>;

export type ComputeOk = {
  ok: true;
  results: AnyRecord;
  compute_version: string;
  contract_version: string;
  schema_version: string;
};

export type ComputeErr = {
  ok: false;
  error: string;
};

export type ComputeResult = ComputeOk | ComputeErr;

/**
 * Canonical compute adapter.
 *
 * Boundary rules:
 * - This repo must not import or depend on the compute package directly.
 * - The widget package is the compute distributor; we call into it here.
 */
export async function computeDealAdapter(
  inputs: unknown,
): Promise<ComputeResult> {
  try {
    const W: any = Widget as any;

    const normalize = W.normalizeInputs ?? W.normalizeInput ?? ((x: any) => x);

    const compute = W.computeScenario ?? W.computeDeal ?? W.compute ?? null;

    if (typeof compute !== "function") {
      return {
        ok: false,
        error: "Compute failed: widget compute function not found",
      };
    }

    const normalized = normalize(inputs as any);
    const out: any = compute(normalized as any);

    // Different historical shapes have existed; accept the canonical results wherever it lands.
    const results: AnyRecord =
      (out?.results as AnyRecord) ??
      (out?.outputs?.results as AnyRecord) ??
      (out?.outputs as AnyRecord) ??
      {};

    return {
      ok: true,
      results,
      compute_version: CONTRACT_VERSION,
      contract_version: CONTRACT_VERSION,
      schema_version: SCHEMA_VERSION,
    };
  } catch (e: any) {
    return {
      ok: false,
      error: e?.message ? String(e.message) : "Compute failed",
    };
  }
}

/**
 * Back-compat alias: existing app scripts/components may import `computeDeal`.
 * Keep this as a thin alias to the canonical adapter.
 */
export const computeDeal = computeDealAdapter;
