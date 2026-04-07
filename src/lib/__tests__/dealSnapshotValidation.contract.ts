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
  // Deterministic JSON stringify (key-sorted), sufficient for hashing & idempotence.
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
 * FullDealSnapshotV1 validator (v11-compatible)
 * Required:
 * - contract_version: non-empty string (any version)
 * - schema_version: non-empty string (any version, not required to equal "1")
 * - inputs: object (not array)
 * - outputs: object (not array)
 * - outputs.results: object (not array)   (required for persistence)
 *
 * Optional:
 * - input_hash, output_hash: if present must be string and must match computed hashes.
 *
 * Must preserve extra fields (opaque pass-through).
 * Must be idempotent (no mutation).
 */
export function validateFullDealSnapshotV1(payload: any): Ok | Err {
  if (!isObj(payload)) {
    return {
      ok: false,
      code: "INVALID_FIELD",
      error: "snapshot must be an object",
    };
  }

  if (
    typeof payload.contract_version !== "string" ||
    payload.contract_version.trim() === ""
  ) {
    return {
      ok: false,
      code: "MISSING_FIELD",
      error: "contract_version is required",
    };
  }

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

  // schema_version must be a non-empty string — no exact value required (v11+)

  if (!isObj(payload.inputs)) {
    return {
      ok: false,
      code: "MISSING_FIELD",
      error: "inputs is required and must be an object",
    };
  }

  if (!isObj(payload.outputs)) {
    return {
      ok: false,
      code: "MISSING_FIELD",
      error: "outputs is required and must be an object",
    };
  }

  if (!isObj(payload.outputs.results)) {
    return {
      ok: false,
      code: "MISSING_FIELD",
      error: "outputs.results is required and must be an object",
    };
  }

  // Hash verification (optional but strict if present)
  if ("input_hash" in payload) {
    if (typeof payload.input_hash !== "string") {
      return {
        ok: false,
        code: "INVALID_FIELD",
        error: "input_hash must be a string",
      };
    }
    const expected = sha256Hex(stableStringify(payload.inputs));
    if (payload.input_hash !== expected) {
      return { ok: false, code: "HASH_MISMATCH", error: "input_hash mismatch" };
    }
  }

  if ("output_hash" in payload) {
    if (typeof payload.output_hash !== "string") {
      return {
        ok: false,
        code: "INVALID_FIELD",
        error: "output_hash must be a string",
      };
    }
    const expected = sha256Hex(stableStringify(payload.outputs));
    if (payload.output_hash !== expected) {
      return {
        ok: false,
        code: "HASH_MISMATCH",
        error: "output_hash mismatch",
      };
    }
  }

  // IMPORTANT: preserve payload verbatim (opaque pass-through)
  return { ok: true, snapshot: payload };
}
