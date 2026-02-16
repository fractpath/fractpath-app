// src/lib/computeAdapter.ts
import {
  computeDeal as canonicalCompute,
  COMPUTE_VERSION,
  type DealTerms,
  type ScenarioAssumptions,
  type DealResults,
} from "@fractpath/compute";

export type CanonicalComputeInputs = {
  deal_terms: DealTerms;
  scenario: ScenarioAssumptions;
};

export type CanonicalComputeOutputs = {
  compute_version: string;
  results: DealResults;
};

export interface ComputeResult {
  ok: true;
  result: CanonicalComputeOutputs;
}

export interface ComputeError {
  ok: false;
  error: string;
  code: "NOT_INTEGRATED" | "COMPUTE_FAILED" | "BAD_INPUT";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export async function computeDeal(
  inputs: Record<string, unknown>,
): Promise<ComputeResult | ComputeError> {
  try {
    // Adapter accepts unknown-ish payload but enforces canonical shape at the boundary.
    if (!isRecord(inputs)) {
      return { ok: false, error: "inputs must be an object", code: "BAD_INPUT" };
    }

    const deal_terms = (inputs as any).deal_terms;
    const scenario = (inputs as any).scenario;

    if (!isRecord(deal_terms)) {
      return { ok: false, error: "inputs.deal_terms is required", code: "BAD_INPUT" };
    }
    if (!isRecord(scenario)) {
      return { ok: false, error: "inputs.scenario is required", code: "BAD_INPUT" };
    }

    // Compute is deterministic and synchronous.
    const results = canonicalCompute(deal_terms as unknown as DealTerms, scenario as unknown as ScenarioAssumptions);

    if (!results || typeof results !== "object") {
      return {
        ok: false,
        error: "Compute function returned invalid shape",
        code: "COMPUTE_FAILED",
      };
    }

    // Contract: compute_version must be embedded.
    const compute_version =
      typeof (results as any).compute_version === "string" && (results as any).compute_version.trim().length > 0
        ? (results as any).compute_version
        : COMPUTE_VERSION;

    return {
      ok: true,
      result: {
        compute_version,
        results: results as DealResults,
      },
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message ?? "Unknown compute error",
      code: "COMPUTE_FAILED",
    };
  }
}
