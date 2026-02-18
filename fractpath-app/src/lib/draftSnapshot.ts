import { createHash } from "node:crypto";

export const SUPPORTED_SCHEMA_VERSIONS = ["1"] as const;
const DEFAULT_SCHEMA_VERSION: (typeof SUPPORTED_SCHEMA_VERSIONS)[number] = "1";

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
  code:
    | "INVALID_SCHEMA_VERSION"
    | "MISSING_FIELD"
    | "HASH_MISMATCH"
    | "INVALID_TYPE";
}

function stableStringify(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "string") return JSON.stringify(value);
  if (t === "number") return Number.isFinite(value as number) ? String(value) : "null";
  if (t === "boolean") return value ? "true" : "false";

  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }

  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
    return `{${parts.join(",")}}`;
  }

  return "null";
}

function canonicalHash(obj: unknown): string {
  const json = stableStringify(obj);
  return createHash("sha256").update(json).digest("hex");
}

function hasLegacyV1Shape(p: Record<string, unknown>): boolean {
  // Used only to decide whether we can safely default schema_version.
  // We still validate all fields and hashes below.
  const requiredStringFields = [
    "engine_version",
    "calculator_schema_version",
    "inputs_hash",
    "result_hash",
  ] as const;

  for (const f of requiredStringFields) {
    if (typeof p[f] !== "string" || (p[f] as string).trim().length === 0) return false;
  }

  if (!p.inputs || typeof p.inputs !== "object" || Array.isArray(p.inputs)) return false;
  if (!p.result || typeof p.result !== "object" || Array.isArray(p.result)) return false;

  return true;
}

export function validateDraftSnapshotV1(payload: unknown): ValidationResult | ValidationError {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      ok: false,
      error: "Payload must be a JSON object",
      code: "INVALID_TYPE",
    };
  }

  const p = payload as Record<string, unknown>;

  // Back-compat: older drafts may omit schema_version entirely.
  // We only default if the payload otherwise looks like a DraftSnapshot v1 object.
  let schemaVersion: string | null = null;

  if (typeof p.schema_version === "string" && p.schema_version.trim().length > 0) {
    schemaVersion = p.schema_version;
  } else if (p.schema_version == null && hasLegacyV1Shape(p)) {
    schemaVersion = DEFAULT_SCHEMA_VERSION;
  } else {
    return {
      ok: false,
      error: "schema_version is required and must be a string",
      code: "MISSING_FIELD",
    };
  }

  if (!SUPPORTED_SCHEMA_VERSIONS.includes(schemaVersion as any)) {
    return {
      ok: false,
      error: `Unsupported schema_version: ${schemaVersion}. Supported: ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}`,
      code: "INVALID_SCHEMA_VERSION",
    };
  }

  const requiredStringFields = [
    "engine_version",
    "calculator_schema_version",
    "inputs_hash",
    "result_hash",
  ] as const;

  for (const field of requiredStringFields) {
    if (typeof p[field] !== "string" || (p[field] as string).trim().length === 0) {
      return {
        ok: false,
        error: `${field} is required and must be a non-empty string`,
        code: "MISSING_FIELD",
      };
    }
  }

  if (!p.inputs || typeof p.inputs !== "object" || Array.isArray(p.inputs)) {
    return {
      ok: false,
      error: "inputs is required and must be a JSON object",
      code: "MISSING_FIELD",
    };
  }

  if (!p.result || typeof p.result !== "object" || Array.isArray(p.result)) {
    return {
      ok: false,
      error: "result is required and must be a JSON object",
      code: "MISSING_FIELD",
    };
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
      schema_version: schemaVersion,
      inputs: p.inputs as Record<string, unknown>,
      result: p.result as Record<string, unknown>,
      engine_version: p.engine_version as string,
      calculator_schema_version: p.calculator_schema_version as string,
      inputs_hash: p.inputs_hash as string,
      result_hash: p.result_hash as string,
    },
  };
}
