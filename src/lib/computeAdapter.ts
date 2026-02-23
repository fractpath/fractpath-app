import { CONTRACT_VERSION, SCHEMA_VERSION } from "@/lib/contractVersion";
import { computeScenario, normalizeInputs } from "fractpath-calculator-widget";

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
 * IMPORTANT:
 * - The app repo must NOT depend on @fractpath/compute directly.
 * - The widget package is the compute distributor; we call into it here.
 */
export async function computeDealAdapter(inputs: unknown): Promise<ComputeResult> {
  try {
    // Normalize if available (widget exports normalizeInputs)
    const normalized = normalizeInputs(inputs as any);

    const out: any = computeScenario(normalized as any);

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
