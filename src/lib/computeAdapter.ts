import { computeDeal as widgetCompute } from "fractpath-calculator-widget";
import type { CalcOutput } from "fractpath-calculator-widget";

export interface ComputeInput {
  [key: string]: unknown;
}

export interface ComputeOutput {
  terms_version: string;
  outputs: {
    summary: Record<string, unknown>;
    schedule: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
}

export interface ComputeResult {
  ok: true;
  result: ComputeOutput;
}

export interface ComputeError {
  ok: false;
  error: string;
  code: "NOT_INTEGRATED" | "COMPUTE_FAILED";
}

export async function computeDeal(
  inputs: ComputeInput,
): Promise<ComputeResult | ComputeError> {
  try {
    const result: CalcOutput = widgetCompute(inputs);

    if (
      !result ||
      typeof result !== "object" ||
      typeof result.terms_version !== "string" ||
      !result.outputs ||
      typeof result.outputs !== "object"
    ) {
      return {
        ok: false,
        error: "Compute function returned invalid shape",
        code: "COMPUTE_FAILED",
      };
    }

    return { ok: true, result: result as unknown as ComputeOutput };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message ?? "Unknown compute error",
      code: "COMPUTE_FAILED",
    };
  }
}
