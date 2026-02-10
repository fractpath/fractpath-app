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
  code:
    | "INVALID_TYPE"
    | "MISSING_FIELD"
    | "INVALID_FIELD_TYPE";
}

export function validateFullDealSnapshotV1(
  payload: unknown,
): SnapshotValidationResult | SnapshotValidationError {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
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

  if (!p.inputs || typeof p.inputs !== "object" || Array.isArray(p.inputs)) {
    return {
      ok: false,
      error: "inputs is required and must be a JSON object",
      code: "MISSING_FIELD",
    };
  }

  if (!p.outputs || typeof p.outputs !== "object" || Array.isArray(p.outputs)) {
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
