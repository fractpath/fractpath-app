import type { DraftSnapshotV1 } from "./draftSnapshot";
import type { FullDealSnapshotV1 } from "./dealSnapshot";

export function mapDraftToDealSnapshot(
  draft: DraftSnapshotV1,
  contractVersion?: string,
): FullDealSnapshotV1 {
  return {
    contract_version: contractVersion ?? draft.calculator_schema_version,
    schema_version: draft.schema_version,
    inputs: draft.inputs,
    outputs: draft.result,
    input_hash: draft.inputs_hash,
    output_hash: draft.result_hash,
    engine_version: draft.engine_version,
    calculator_schema_version: draft.calculator_schema_version,
  };
}
