type AnyRecord = Record<string, unknown>;

function isRecord(v: unknown): v is AnyRecord {
  return v !== null && typeof v === "object" && Array.isArray(v) === false;
}

export type DraftSnapshotV1 = {
  contractVersion?: string | null;
  calculator_schema_version?: string | null;
  inputs?: unknown;
  result?: unknown;
  meta?: AnyRecord;
  [k: string]: unknown;
};

export type FullDealSnapshotV1 = {
  contract_version: string;
  schema_version: string;
  inputs: AnyRecord;
  outputs: AnyRecord;
  [k: string]: unknown;
};

export function draftToDealSnapshot(
  draft: DraftSnapshotV1,
  contractVersionOverride?: string,
): FullDealSnapshotV1 {
  const contract_version =
    contractVersionOverride ??
    (typeof draft.contractVersion === "string" &&
    draft.contractVersion.trim().length > 0
      ? draft.contractVersion
      : typeof draft.calculator_schema_version === "string" &&
          draft.calculator_schema_version.trim().length > 0
        ? draft.calculator_schema_version
        : "10.0.0");

  const schema_version = "10";

  const rawInputs = draft.inputs;
  let dealTerms: AnyRecord = {};

  if (isRecord(rawInputs) && isRecord((rawInputs as any).deal_terms)) {
    dealTerms = (rawInputs as any).deal_terms as AnyRecord;
  } else if (isRecord(rawInputs)) {
    dealTerms = rawInputs;
  }

  const inputs: AnyRecord = { deal_terms: dealTerms };

  const rawResult = draft.result;
  const results: AnyRecord = isRecord(rawResult) ? rawResult : {};

  const outputs: AnyRecord = { results };

  const extra: AnyRecord = {};
  for (const [k, v] of Object.entries(draft)) {
    if (
      k === "contractVersion" ||
      k === "calculator_schema_version" ||
      k === "inputs" ||
      k === "result"
    )
      continue;
    extra[k] = v as unknown;
  }

  return {
    contract_version,
    schema_version,
    inputs,
    outputs,
    ...extra,
  };
}

export const mapDraftToDealSnapshot = draftToDealSnapshot;

export default draftToDealSnapshot;
