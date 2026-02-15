export interface NormalizedSnapshotJson {
  contract_version: string;
  computed_at: string;
  computed_by: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  snapshot_source: string;
  warnings: string[];
}

function safeObj(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function safeStr(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim().length > 0 ? v : fallback;
}

export function normalizeSnapshotJson(snapshotJson: unknown): NormalizedSnapshotJson {
  const warnings: string[] = [];
  const json = safeObj(snapshotJson) ?? {};

  const canonical = safeObj(json.canonicalSnapshot);

  const envelopeInputs = safeObj(json.inputs);
  const envelopeOutputs = safeObj(json.outputs);
  const canonicalInputs = canonical ? safeObj(canonical.inputs) : null;
  const canonicalOutputs = canonical ? safeObj(canonical.outputs) : null;

  const inputs = envelopeInputs ?? canonicalInputs ?? {};
  const outputs = envelopeOutputs ?? canonicalOutputs;

  if (!envelopeInputs && !canonicalInputs) {
    warnings.push("inputs: missing from envelope and canonicalSnapshot");
  }

  if (!outputs) {
    warnings.push("outputs: missing from envelope and canonicalSnapshot");
  }

  const contractVersion = safeStr(
    json.contract_version,
    canonical ? safeStr(canonical.compute_version, "\u2014") : "\u2014",
  );

  const computedAt = safeStr(
    json.computed_at,
    canonical ? safeStr(canonical.computed_at, "\u2014") : "\u2014",
  );

  const computedBy = safeStr(json.computed_by, "\u2014");

  const snapshotSource = safeStr(json.snapshot_source, "\u2014");

  return {
    contract_version: contractVersion,
    computed_at: computedAt,
    computed_by: computedBy,
    inputs,
    outputs: outputs ?? {},
    snapshot_source: snapshotSource,
    warnings,
  };
}

export interface SnapshotDisplayData {
  contractVersion: string;
  schemaVersion: string;
  inputHash: string;
  outputHash: string;
  createdAt: string;
  inputs: Record<string, unknown> | null;
  outputs: Record<string, unknown> | null;
  chartSeries: unknown[] | null;
}

export function extractSnapshotDisplay(
  snapshotRow: {
    created_at: string;
    contract_version: string;
    schema_version: string;
    input_hash: string | null;
    output_hash: string | null;
    snapshot_json: Record<string, unknown>;
  } | null,
): SnapshotDisplayData | null {
  if (!snapshotRow) return null;

  const json = snapshotRow.snapshot_json ?? {};
  const normalized = normalizeSnapshotJson(json);

  const inputs = Object.keys(normalized.inputs).length > 0 ? normalized.inputs : null;
  const outputs = Object.keys(normalized.outputs).length > 0 ? normalized.outputs : null;

  const chartSeries = Array.isArray(json.chart_series) ? json.chart_series : null;

  return {
    contractVersion: snapshotRow.contract_version ?? normalized.contract_version,
    schemaVersion: snapshotRow.schema_version ?? "\u2014",
    inputHash: snapshotRow.input_hash ?? "\u2014",
    outputHash: snapshotRow.output_hash ?? "\u2014",
    createdAt: snapshotRow.created_at ?? "\u2014",
    inputs,
    outputs,
    chartSeries,
  };
}

export interface SnapshotListItem {
  id: string;
  created_at: string;
  contract_version: string;
  schema_version: string;
}

export function selectSnapshot<T extends { id: string }>(
  snapshots: T[],
  selectedId: string | null,
): { selected: T | null; isLatest: boolean } {
  if (snapshots.length === 0) {
    return { selected: null, isLatest: true };
  }

  if (!selectedId) {
    return { selected: snapshots[0], isLatest: true };
  }

  const found = snapshots.find((s) => s.id === selectedId);
  if (!found) {
    return { selected: snapshots[0], isLatest: true };
  }

  return { selected: found, isLatest: found.id === snapshots[0].id };
}

export function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "\u2014";
  if (typeof v === "number") return v.toLocaleString("en-US");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string") return v;
  return String(v);
}

export function humanLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
