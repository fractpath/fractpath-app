type AnyRecord = Record<string, unknown>;

function isRecord(v: unknown): v is AnyRecord {
  return v !== null && typeof v === "object" && Array.isArray(v) === false;
}

/**
 * Draft snapshot payloads are NOT canonical snapshots.
 * This module's job is to extract canonical compute inputs:
 *   { deal_terms, scenario }
 *
 * Do NOT synthesize outputs/results here.
 * Do NOT set contract_version/schema_version here.
 * Canonical snapshot assembly happens at the boundary where we call compute + insertDealSnapshot.
 */

export type DraftSnapshotV1 = {
  inputs?: unknown;
  // Some older drafts may store scenario separately
  scenario?: unknown;
  meta?: AnyRecord;
  [k: string]: unknown;
};

export type CanonicalInputsEnvelope = {
  inputs: {
    deal_terms: AnyRecord;
    scenario: AnyRecord;
  };
};

function extractDealTerms(rawInputs: unknown): AnyRecord {
  if (isRecord(rawInputs) && isRecord((rawInputs as any).deal_terms)) {
    return (rawInputs as any).deal_terms as AnyRecord;
  }
  if (isRecord(rawInputs)) {
    // Treat raw inputs as deal_terms if they look like an object
    return rawInputs as AnyRecord;
  }
  return {};
}

function extractScenario(
  draft: DraftSnapshotV1,
  rawInputs: unknown,
): AnyRecord {
  // Preferred: inputs.scenario
  if (isRecord(rawInputs) && isRecord((rawInputs as any).scenario)) {
    return (rawInputs as any).scenario as AnyRecord;
  }
  // Back-compat: top-level scenario
  if (isRecord(draft.scenario)) {
    return draft.scenario as AnyRecord;
  }
  return {};
}

export function mapDraftToDealSnapshot(
  draft: DraftSnapshotV1,
): CanonicalInputsEnvelope {
  const rawInputs = draft?.inputs;

  const deal_terms = extractDealTerms(rawInputs);
  const scenario = extractScenario(draft, rawInputs);

  return {
    inputs: {
      deal_terms,
      scenario,
    },
  };
}

export default mapDraftToDealSnapshot;
