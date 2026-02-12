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
    let computeFn: ((inputs: ComputeInput) => ComputeOutput) | undefined;
    try {
      // @ts-ignore — package resolved at runtime when fractpath-calculator-widget is installed
      const mod = await import("fractpath-calculator-widget");
      computeFn = mod.computeDeal ?? mod.default?.computeDeal;
    } catch {
      // package not installed
    }

    if (!computeFn) {
      return {
        ok: false,
        error:
          "Calculator widget compute engine is not yet integrated. Install fractpath-calculator-widget and export computeDeal.",
        code: "NOT_INTEGRATED",
      };
    }

    const result = computeFn(inputs);

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

    return { ok: true, result };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message ?? "Unknown compute error",
      code: "COMPUTE_FAILED",
    };
  }
}
