export interface CounterBaseSnapshotInput {
  selectedSnapshotId: string | null | undefined;
  latestSnapshotId: string | null | undefined;
}

export function selectBaseSnapshotId(
  input: CounterBaseSnapshotInput,
): string | null {
  if (input.selectedSnapshotId) return input.selectedSnapshotId;
  if (input.latestSnapshotId) return input.latestSnapshotId;
  return null;
}
