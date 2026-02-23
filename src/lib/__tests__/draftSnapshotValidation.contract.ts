import { createHash } from "node:crypto";

type Ok = { ok: true; snapshot: any };
type Err = {
  ok: false;
  code: "MISSING_FIELD" | "INVALID_FIELD" | "HASH_MISMATCH";
  error: string;
};

function isObj(v: any): boolean {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function stableStringify(value: any): string {
  const seen = new WeakSet();
  const normalize = (v: any): any => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v)) return "[Circular]";
    seen.add(v);

    if (Array.isArray(v)) return v.map(normalize);

    const out: Record<string, any> = {};
    for (const k of Object.keys(v).sort()) out[k] = normalize(v[k]);
    return out;
  };
  return JSON.stringify(normalize(value));
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/**
 * DraftSnapshot v1 validator (legacy)
 * Required:
 * - schema_version: non-empty string (contract expects missing schema_version => MISSING_FIELD)
 * - inputs: object
 * - result: object
 * - engine_version: non-empty string
 * - inputs_hash + result_hash must exist and match (legacy contract expects these checks)
 *
 * Must not mutate payload; must be idempotent.
 */
export function validateDraftSnapshotV1(payload: any): Ok | Err {
  if (!isObj(payload)) {
    return {
      ok: false,
      code: "INVALID_FIELD",
      error: "draft snapshot must be an object",
    };
  }

  // REQUIRED FIELDS FIRST (fixes: “Expected MISSING_FIELD, got HASH_MISMATCH”)
  if (
    typeof payload.schema_version !== "string" ||
    payload.schema_version.trim() === ""
  ) {
    return {
      ok: false,
      code: "MISSING_FIELD",
      error: "schema_version is required",
    };
  }
  if (!isObj(payload.inputs)) {
    return {
      ok: false,
      code: "MISSING_FIELD",
      error: "inputs is required and must be an object",
    };
  }
  if (!isObj(payload.result)) {
    return {
      ok: false,
      code: "MISSING_FIELD",
      error: "result is required and must be an object",
    };
  }
  if (
    typeof payload.engine_version !== "string" ||
    payload.engine_version.trim() === ""
  ) {
    return {
      ok: false,
      code: "MISSING_FIELD",
      error: "engine_version is required",
    };
  }

  // Hashes required in legacy draft snapshot format
  if (
    typeof payload.inputs_hash !== "string" ||
    payload.inputs_hash.trim() === ""
  ) {
    return {
      ok: false,
      code: "MISSING_FIELD",
      error: "inputs_hash is required",
    };
  }
  if (
    typeof payload.result_hash !== "string" ||
    payload.result_hash.trim() === ""
  ) {
    return {
      ok: false,
      code: "MISSING_FIELD",
      error: "result_hash is required",
    };
  }

  const expectedInputsHash = sha256Hex(stableStringify(payload.inputs));
  if (payload.inputs_hash !== expectedInputsHash) {
    return { ok: false, code: "HASH_MISMATCH", error: "inputs_hash mismatch" };
  }

  const expectedResultHash = sha256Hex(stableStringify(payload.result));
  if (payload.result_hash !== expectedResultHash) {
    return { ok: false, code: "HASH_MISMATCH", error: "result_hash mismatch" };
  }

  // Preserve payload verbatim (no mutation)
  return { ok: true, snapshot: payload };
}
