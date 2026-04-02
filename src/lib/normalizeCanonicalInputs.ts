// src/lib/normalizeCanonicalInputs.ts
// Extracts { deal_terms, scenario } from any of the supported payload shapes.
// No specific field requirements on deal_terms — compatible with v11 shape.

export type CanonicalInputs = {
  deal_terms: Record<string, unknown>;
  scenario: Record<string, unknown>;
};

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function getRecord(
  obj: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const v = obj[key];
  return isRecord(v) ? v : null;
}

/**
 * Normalize inputs from any of these shapes:
 *
 * A) { inputs: { deal_terms, scenario } }
 * B) { deal_terms, scenario }
 * C) { deal_terms, assumptions }  (assumptions -> scenario)
 * D) Token snapshot-ish objects:
 *    - canonicalSnapshot.inputs
 *    - canonicalInputs
 *    - draftSnapshot.inputs
 *    - draftSnapshot
 *
 * Never mutates payload; returns references to existing nested objects.
 */
export function normalizeCanonicalInputsFromUnknown(
  payload: unknown,
): CanonicalInputs | null {
  if (!isRecord(payload)) return null;

  // Shape A: { inputs: { deal_terms, scenario } }
  const inputs = getRecord(payload, "inputs");
  if (inputs) {
    const dt = getRecord(inputs, "deal_terms");
    const sc =
      getRecord(inputs, "scenario") ?? getRecord(inputs, "assumptions");
    if (dt && sc) return { deal_terms: dt, scenario: sc };
  }

  // Shape B/C: { deal_terms, scenario } or { deal_terms, assumptions }
  const dtTop = getRecord(payload, "deal_terms");
  const scTop =
    getRecord(payload, "scenario") ?? getRecord(payload, "assumptions");
  if (dtTop && scTop) return { deal_terms: dtTop, scenario: scTop };

  // Token snapshot patterns (marketing resume token payloads vary)
  // canonicalSnapshot.inputs (preferred)
  const canonicalSnapshot = getRecord(payload, "canonicalSnapshot");
  if (canonicalSnapshot) {
    const csInputs = getRecord(canonicalSnapshot, "inputs");
    if (csInputs) {
      const dt = getRecord(csInputs, "deal_terms");
      const sc =
        getRecord(csInputs, "scenario") ?? getRecord(csInputs, "assumptions");
      if (dt && sc) return { deal_terms: dt, scenario: sc };
    }
  }

  // canonicalInputs
  const canonicalInputs = getRecord(payload, "canonicalInputs");
  if (canonicalInputs) {
    const dt = getRecord(canonicalInputs, "deal_terms");
    const sc =
      getRecord(canonicalInputs, "scenario") ??
      getRecord(canonicalInputs, "assumptions");
    if (dt && sc) return { deal_terms: dt, scenario: sc };
  }

  // draftSnapshot.inputs OR draftSnapshot
  const draftSnapshot = getRecord(payload, "draftSnapshot");
  if (draftSnapshot) {
    const dsInputs = getRecord(draftSnapshot, "inputs");
    if (dsInputs) {
      const dt = getRecord(dsInputs, "deal_terms");
      const sc =
        getRecord(dsInputs, "scenario") ?? getRecord(dsInputs, "assumptions");
      if (dt && sc) return { deal_terms: dt, scenario: sc };
    }

    const dt = getRecord(draftSnapshot, "deal_terms");
    const sc =
      getRecord(draftSnapshot, "scenario") ??
      getRecord(draftSnapshot, "assumptions");
    if (dt && sc) return { deal_terms: dt, scenario: sc };
  }

  return null;
}

/**
 * Given draft_tokens.snapshot_json (unknown), pull canonical inputs reliably.
 * Prefers canonicalSnapshot.inputs, then canonicalInputs, then draftSnapshot(.inputs).
 */
export function readCanonicalInputsFromDraftTokenSnapshot(
  snapshot_json: unknown,
): CanonicalInputs | null {
  if (!isRecord(snapshot_json)) return null;
  return normalizeCanonicalInputsFromUnknown(snapshot_json);
}
