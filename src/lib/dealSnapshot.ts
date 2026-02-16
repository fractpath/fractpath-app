// src/lib/dealSnapshot.ts

export interface FullDealSnapshotV1 {
  contract_version: string;
  schema_version: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  input_hash?: string;
  output_hash?: string;
  [key: string]: unknown;
}

export interface SnapshotValidationResult {
  ok: true;
  snapshot: FullDealSnapshotV1;
  contract_version: string;
  schema_version: string;
  input_hash: string | null;
  output_hash: string | null;
}

export interface SnapshotValidationError {
  ok: false;
  error: string;
  code: "INVALID_TYPE" | "MISSING_FIELD" | "INVALID_FIELD_TYPE" | "NOT_CANONICAL";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/**
 * Canonical-only rule:
 * - inputs must include { deal_terms: object, scenario: object }
 * - outputs must include { results: object }
 * This prevents legacy widget snapshots ({summary/schedule/settlements}) from being stored.
 */
export function validateFullDealSnapshotV1(
  payload: unknown,
): SnapshotValidationResult | SnapshotValidationError {
  if (!isRecord(payload)) {
    return {
      ok: false,
      error: "Payload must be a JSON object",
      code: "INVALID_TYPE",
    };
  }

  const p = payload as Record<string, unknown>;

  if (typeof p.contract_version !== "string" || p.contract_version.trim().length === 0) {
    return {
      ok: false,
      error: "contract_version is required and must be a non-empty string",
      code: "MISSING_FIELD",
    };
  }

  if (typeof p.schema_version !== "string" || p.schema_version.trim().length === 0) {
    return {
      ok: false,
      error: "schema_version is required and must be a non-empty string",
      code: "MISSING_FIELD",
    };
  }

  if (!isRecord(p.inputs)) {
    return {
      ok: false,
      error: "inputs is required and must be a JSON object",
      code: "MISSING_FIELD",
    };
  }

  if (!isRecord(p.outputs)) {
    return {
      ok: false,
      error: "outputs is required and must be a JSON object",
      code: "MISSING_FIELD",
    };
  }

  if (p.input_hash !== undefined && typeof p.input_hash !== "string") {
    return {
      ok: false,
      error: "input_hash must be a string if provided",
      code: "INVALID_FIELD_TYPE",
    };
  }

  if (p.output_hash !== undefined && typeof p.output_hash !== "string") {
    return {
      ok: false,
      error: "output_hash must be a string if provided",
      code: "INVALID_FIELD_TYPE",
    };
  }

  // --- Canonical-only enforcement ---
  const inputs = p.inputs as Record<string, unknown>;
  const outputs = p.outputs as Record<string, unknown>;

  const deal_terms = inputs.deal_terms;
  const scenario = inputs.scenario;

  if (!isRecord(deal_terms)) {
    return {
      ok: false,
      error: "Canonical snapshot required: inputs.deal_terms must be an object",
      code: "NOT_CANONICAL",
    };
  }

  if (!isRecord(scenario)) {
    return {
      ok: false,
      error: "Canonical snapshot required: inputs.scenario must be an object",
      code: "NOT_CANONICAL",
    };
  }

  const results = outputs.results;
  if (!isRecord(results)) {
    return {
      ok: false,
      error: "Canonical snapshot required: outputs.results must be an object",
      code: "NOT_CANONICAL",
    };
  }

  const snapshot = payload as FullDealSnapshotV1;

  return {
    ok: true,
    snapshot,
    contract_version: p.contract_version as string,
    schema_version: p.schema_version as string,
    input_hash: typeof p.input_hash === "string" ? p.input_hash : null,
    output_hash: typeof p.output_hash === "string" ? p.output_hash : null,
  };
}
