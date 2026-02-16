/* Canonical-only (v10)
 *
 * Supported snapshot_json shape:
 *   snapshot_json.inputs  (object)
 *   snapshot_json.outputs.results (object)
 *
 * Non-negotiable: do NOT read legacy fields (chart_series, outputs.summary, outputs.schedule).
 */

type AnyRecord = Record<string, unknown>;

export type SnapshotRowLike = {
  id?: string;
  created_at?: string;
  contract_version?: string | null;
  schema_version?: string | null;
  snapshot_json?: unknown;
} | null;

export type SnapshotDisplayData = {
  contractVersion: string | null;
  schemaVersion: string | null;
  createdAt: string | null;
  inputs: AnyRecord | null;
  // Canonical-only: DealResults (snapshot_json.outputs.results)
  outputs: AnyRecord | null;
};

function isRecord(v: unknown): v is AnyRecord {
  return v !== null && typeof v === "object" && Array.isArray(v) === false;
}

function safeRecord(v: unknown): AnyRecord | null {
  return isRecord(v) ? (v as AnyRecord) : null;
}

export function extractSnapshotDisplay(snapshotRow: SnapshotRowLike): SnapshotDisplayData | null {
  if (snapshotRow === null) return null;

  const json = safeRecord((snapshotRow as any).snapshot_json) ?? {};
  const inputs = safeRecord((json as any).inputs);

  const outputsContainer = safeRecord((json as any).outputs);
  const results = outputsContainer ? safeRecord((outputsContainer as any).results) : null;

  return {
    contractVersion: ((snapshotRow as any).contract_version ?? null) as any,
    schemaVersion: ((snapshotRow as any).schema_version ?? null) as any,
    createdAt: ((snapshotRow as any).created_at ?? null) as any,
    inputs,
    outputs: results,
  };
}

export function selectSnapshot<T extends { id: string }>(
  snapshots: T[],
  selectedId: string | null,
): { selected: T | null; isLatest: boolean } {
  if (!snapshots || snapshots.length === 0) return { selected: null, isLatest: true };
  const latest = snapshots[0];
  if (selectedId === null) return { selected: latest, isLatest: true };
  const found = snapshots.find((s) => s.id === selectedId) ?? null;
  return { selected: found, isLatest: found ? found.id === latest.id : true };
}

export function humanLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export function formatValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "—";
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
