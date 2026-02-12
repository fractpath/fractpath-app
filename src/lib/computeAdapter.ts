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

function loadComputeFn():
  | ((inputs: ComputeInput) => ComputeOutput)
  | undefined {
  try {
    // IMPORTANT:
    // - Do NOT use `import("fractpath-calculator-widget")` here.
    //   Turbopack will attempt to resolve it at build time and warn/fail if absent.
    // - Use a runtime require that bundlers cannot statically analyze.
    const req = (eval("require") as (id: string) => any) ?? undefined; // eslint-disable-line no-eval
    if (!req) return undefined;

    const mod = req("fractpath-calculator-widget");
    return mod?.computeDeal ?? mod?.default?.computeDeal;
  } catch {
    return undefined;
  }
}

export async function computeDeal(
  inputs: ComputeInput,
): Promise<ComputeResult | ComputeError> {
  try {
    const computeFn = loadComputeFn();

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
      typeof (result as any).terms_version !== "string" ||
      !(result as any).outputs ||
      typeof (result as any).outputs !== "object"
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
