import { normalizeSnapshotJson } from "./dealSnapshotDisplay";

export interface FieldDiff {
  key: string;
  a: unknown;
  b: unknown;
}

export interface SnapshotCompareResult {
  inputDiffs: FieldDiff[];
  outputDiffs: FieldDiff[];
  metaDiffs: FieldDiff[];
}

function safeRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return {};
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null && b === undefined) return true;
  if (a === undefined && b === null) return true;
  if (typeof a === "object" && typeof b === "object" && a !== null && b !== null) {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

function diffRecords(
  aRec: Record<string, unknown>,
  bRec: Record<string, unknown>,
): FieldDiff[] {
  const allKeys = new Set([...Object.keys(aRec), ...Object.keys(bRec)]);
  const diffs: FieldDiff[] = [];

  for (const key of Array.from(allKeys).sort()) {
    const aVal = aRec[key];
    const bVal = bRec[key];
    if (!valuesEqual(aVal, bVal)) {
      diffs.push({ key, a: aVal ?? null, b: bVal ?? null });
    }
  }

  return diffs;
}

export function compareSnapshotDisplay(
  a: Record<string, unknown> | null | undefined,
  b: Record<string, unknown> | null | undefined,
): SnapshotCompareResult {
  const aNorm = normalizeSnapshotJson(a);
  const bNorm = normalizeSnapshotJson(b);

  const aInputs = safeRecord(aNorm.inputs);
  const bInputs = safeRecord(bNorm.inputs);

  const aOutputs = safeRecord(aNorm.outputs);
  const bOutputs = safeRecord(bNorm.outputs);

  const metaDiffs: FieldDiff[] = [];

  const aObj = a && typeof a === "object" ? a : {};
  const bObj = b && typeof b === "object" ? b : {};

  const metaKeysToCompare = ["contract_version", "schema_version", "input_hash", "output_hash"];
  for (const key of metaKeysToCompare) {
    const aVal = key === "contract_version" ? aNorm.contract_version : (aObj as any)[key];
    const bVal = key === "contract_version" ? bNorm.contract_version : (bObj as any)[key];
    if (!valuesEqual(aVal, bVal)) {
      metaDiffs.push({ key, a: aVal ?? null, b: bVal ?? null });
    }
  }

  return {
    inputDiffs: diffRecords(aInputs, bInputs),
    outputDiffs: diffRecords(aOutputs, bOutputs),
    metaDiffs,
  };
}
