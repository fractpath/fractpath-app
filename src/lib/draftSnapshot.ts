import { createHash } from "node:crypto";

export const SUPPORTED_SCHEMA_VERSIONS = ["1"] as const;

export interface DraftSnapshotV1 {
  schema_version: string;
  inputs: Record<string, unknown>;
  result: Record<string, unknown>;
  engine_version: string;
  calculator_schema_version: string;
  inputs_hash: string;
  result_hash: string;
}

export interface ValidationResult {
  ok: true;
  snapshot: DraftSnapshotV1;
}

export interface ValidationError {
  ok: false;
  error: string;
  code: "INVALID_SCHEMA_VERSION" | "MISSING_FIELD" | "HASH_MISMATCH" | "INVALID_TYPE";
}

function canonicalHash(obj: unknown): string {
  const json = JSON.stringify(obj);
  return createHash("sha256").update(json).digest("hex");
}

export function validateDraftSnapshotV1(
  payload: unknown,
): ValidationResult | ValidationError {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, error: "Payload must be a JSON object", code: "INVALID_TYPE" };
  }

  const p = payload as Record<string, unknown>;

  if (typeof p.schema_version !== "string") {
    return { ok: false, error: "schema_version is required and must be a string", code: "MISSING_FIELD" };
  }

  if (!SUPPORTED_SCHEMA_VERSIONS.includes(p.schema_version as any)) {
    return {
      ok: false,
      error: `Unsupported schema_version: ${p.schema_version}. Supported: ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}`,
      code: "INVALID_SCHEMA_VERSION",
    };
  }

  const requiredStringFields = ["engine_version", "calculator_schema_version", "inputs_hash", "result_hash"] as const;
  for (const field of requiredStringFields) {
    if (typeof p[field] !== "string" || (p[field] as string).trim().length === 0) {
      return { ok: false, error: `${field} is required and must be a non-empty string`, code: "MISSING_FIELD" };
    }
  }

  if (!p.inputs || typeof p.inputs !== "object" || Array.isArray(p.inputs)) {
    return { ok: false, error: "inputs is required and must be a JSON object", code: "MISSING_FIELD" };
  }

  if (!p.result || typeof p.result !== "object" || Array.isArray(p.result)) {
    return { ok: false, error: "result is required and must be a JSON object", code: "MISSING_FIELD" };
  }

  const computedInputsHash = canonicalHash(p.inputs);
  if (computedInputsHash !== p.inputs_hash) {
    return {
      ok: false,
      error: `inputs_hash mismatch: expected ${computedInputsHash}, got ${p.inputs_hash}`,
      code: "HASH_MISMATCH",
    };
  }

  const computedResultHash = canonicalHash(p.result);
  if (computedResultHash !== p.result_hash) {
    return {
      ok: false,
      error: `result_hash mismatch: expected ${computedResultHash}, got ${p.result_hash}`,
      code: "HASH_MISMATCH",
    };
  }

  return {
    ok: true,
    snapshot: {
      schema_version: p.schema_version as string,
      inputs: p.inputs as Record<string, unknown>,
      result: p.result as Record<string, unknown>,
      engine_version: p.engine_version as string,
      calculator_schema_version: p.calculator_schema_version as string,
      inputs_hash: p.inputs_hash as string,
      result_hash: p.result_hash as string,
    },
  };
}
