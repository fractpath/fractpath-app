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

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function validateCanonicalInputs(
  deal_terms: unknown,
  scenario: unknown,
):
  | { ok: true; deal_terms: DealTerms; scenario: ScenarioAssumptions }
  | { ok: false; error: string } {
  if (!isRecord(deal_terms))
    return { ok: false, error: "inputs.deal_terms must be an object" };
  if (!isRecord(scenario))
    return { ok: false, error: "inputs.scenario must be an object" };

  const dt = deal_terms as Record<string, unknown>;
  const sc = scenario as Record<string, unknown>;

  // DealTerms required numeric fields
  const requiredDealNums: (keyof DealTerms)[] = [
    "property_value",
    "upfront_payment",
    "monthly_payment",
    "number_of_payments",
    "payback_window_start_year",
    "payback_window_end_year",
    "timing_factor_early",
    "timing_factor_late",
    "floor_multiple",
    "ceiling_multiple",
    "contract_maturity_years",
    "liquidity_trigger_year",
    "minimum_hold_years",
    "platform_fee",
    "servicing_fee_monthly",
    "exit_fee_pct",
  ];

  for (const k of requiredDealNums) {
    if (!isFiniteNumber(dt[k as string])) {
      return {
        ok: false,
        error: `inputs.deal_terms.${String(k)} must be a finite number`,
      };
    }
  }

  // Enum
  const dm = dt.downside_mode;
  if (dm !== "HARD_FLOOR" && dm !== "NO_FLOOR") {
    return {
      ok: false,
      error: "inputs.deal_terms.downside_mode must be HARD_FLOOR or NO_FLOOR",
    };
  }

  // Guardrails to prevent “computed but garbage”
  if ((dt.property_value as number) <= 0) {
    return { ok: false, error: "inputs.deal_terms.property_value must be > 0" };
  }
  if ((dt.upfront_payment as number) < 0) {
    return {
      ok: false,
      error: "inputs.deal_terms.upfront_payment must be >= 0",
    };
  }
  if ((dt.monthly_payment as number) < 0) {
    return {
      ok: false,
      error: "inputs.deal_terms.monthly_payment must be >= 0",
    };
  }
  if ((dt.number_of_payments as number) < 0) {
    return {
      ok: false,
      error: "inputs.deal_terms.number_of_payments must be >= 0",
    };
  }

  // Scenario required numeric fields
  const requiredScenarioNums: (keyof ScenarioAssumptions)[] = [
    "annual_appreciation",
    "closing_cost_pct",
    "exit_year",
  ];

  for (const k of requiredScenarioNums) {
    if (!isFiniteNumber(sc[k as string])) {
      return {
        ok: false,
        error: `inputs.scenario.${String(k)} must be a finite number`,
      };
    }
  }

  if ((sc.exit_year as number) <= 0) {
    return { ok: false, error: "inputs.scenario.exit_year must be > 0" };
  }

  // Optional fmv_override
  if (
    "fmv_override" in sc &&
    sc.fmv_override != null &&
    !isFiniteNumber(sc.fmv_override)
  ) {
    return {
      ok: false,
      error: "inputs.scenario.fmv_override must be a finite number or null",
    };
  }

  return {
    ok: true,
    deal_terms: (deal_terms as unknown) as DealTerms,
    scenario: (scenario as unknown) as ScenarioAssumptions,
  };
}

export async function computeDeal(
  inputs: Record<string, unknown>,
): Promise<ComputeResult | ComputeError> {
  try {
    // Adapter accepts unknown-ish payload but enforces canonical shape at the boundary.
    if (!isRecord(inputs)) {
      return {
        ok: false,
        error: "inputs must be an object",
        code: "BAD_INPUT",
      };
    }

    const deal_terms = (inputs as any).deal_terms;
    const scenario = (inputs as any).scenario;

    const validated = validateCanonicalInputs(deal_terms, scenario);
    if (!validated.ok) {
      return { ok: false, error: validated.error, code: "BAD_INPUT" };
    }

    // Compute is deterministic and synchronous.
    const results = canonicalCompute(validated.deal_terms, validated.scenario);

    if (!results || typeof results !== "object") {
      return {
        ok: false,
        error: "Compute function returned invalid shape",
        code: "COMPUTE_FAILED",
      };
    }

    // Contract: compute_version must be embedded.
    const compute_version =
      typeof (results as any).compute_version === "string" &&
      (results as any).compute_version.trim().length > 0
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
