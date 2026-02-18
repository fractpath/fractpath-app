// src/lib/dealSnapshot.ts

export interface FullDealSnapshotV1 {
  // Canonical v10
  compute_version: string;
  schema_version: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  computed_at?: string;
  computed_by?: string;

  // Legacy (optional; kept for backward compatibility only)
  contract_version?: string;

  input_hash?: string;
  output_hash?: string;

  [key: string]: unknown;
}

export interface SnapshotValidationResult {
  ok: true;
  snapshot: FullDealSnapshotV1;

  // Canonical fields for DB indexing / compatibility
  compute_version: string;
  // Keep returning contract_version too (mirrors compute_version) so older callers can keep working if needed
  contract_version: string;

  schema_version: string;
  input_hash: string | null;
  output_hash: string | null;
}

export interface SnapshotValidationError {
  ok: false;
  error: string;
  code:
    | "INVALID_TYPE"
    | "MISSING_FIELD"
    | "INVALID_FIELD_TYPE"
    | "NOT_CANONICAL";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function nonEmptyString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

/**
 * Canonical-only rule (v10):
 * - snapshot must include compute_version (string)
 * - inputs must include { deal_terms: object, scenario: object }
 * - outputs must include { results: object }
 *
 * Backward compatibility:
 * - legacy payloads may provide contract_version; if compute_version is missing, we will
 *   accept contract_version and normalize compute_version = contract_version.
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

  const compute_version =
    nonEmptyString(p.compute_version) ?? nonEmptyString(p.contract_version);

  if (!compute_version) {
    return {
      ok: false,
      error:
        "compute_version is required and must be a non-empty string (or provide legacy contract_version)",
      code: "MISSING_FIELD",
    };
  }

  if (
    typeof p.schema_version !== "string" ||
    p.schema_version.trim().length === 0
  ) {
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

  // Normalize to ensure snapshot_json always has compute_version
  const snapshot: FullDealSnapshotV1 = {
    ...(payload as any),
    compute_version,
    // Keep contract_version mirrored for legacy visibility if present elsewhere
    contract_version: nonEmptyString(p.contract_version) ?? compute_version,
    schema_version: p.schema_version as string,
    inputs: p.inputs as Record<string, unknown>,
    outputs: p.outputs as Record<string, unknown>,
    input_hash: typeof p.input_hash === "string" ? p.input_hash : undefined,
    output_hash: typeof p.output_hash === "string" ? p.output_hash : undefined,
  };

  return {
    ok: true,
    snapshot,
    compute_version,
    contract_version: snapshot.contract_version ?? compute_version,
    schema_version: p.schema_version as string,
    input_hash: typeof p.input_hash === "string" ? p.input_hash : null,
    output_hash: typeof p.output_hash === "string" ? p.output_hash : null,
  };
}
