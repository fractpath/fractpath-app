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

  const inputs =
    json.inputs && typeof json.inputs === "object" && !Array.isArray(json.inputs)
      ? (json.inputs as Record<string, unknown>)
      : null;

  const outputs =
    json.outputs && typeof json.outputs === "object" && !Array.isArray(json.outputs)
      ? (json.outputs as Record<string, unknown>)
      : null;

  const chartSeries = Array.isArray(json.chart_series) ? json.chart_series : null;

  return {
    contractVersion: snapshotRow.contract_version ?? "\u2014",
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
