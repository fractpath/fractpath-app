import type { DealSummaryViewModel } from "@/lib/dealSummaryViewModel";
import { DealKpiCard } from "./DealKpiCard";
import { DealExitTable } from "./DealExitTable";
import { DealAssumptionsSummary } from "./DealAssumptionsSummary";

interface DealSummaryProps {
  vm: DealSummaryViewModel;
  snapshotMeta: {
    contractVersion: string;
    schemaVersion: string;
    createdAt: string;
  };
  hasSnapshot: boolean;
}

export function DealSummary({
  vm,
  snapshotMeta,
  hasSnapshot,
}: DealSummaryProps) {
  if (!hasSnapshot) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">No scenario snapshot saved yet</p>
        <p className="text-sm text-muted-foreground">
          A snapshot will appear here once the calculator widget saves one for
          this deal. No numbers are computed in this app.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {vm.flags.isHistorical ? (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Viewing a previous snapshot — not the latest version
        </div>
      ) : null}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>v{snapshotMeta.contractVersion} / s{snapshotMeta.schemaVersion}</span>
        <span>{snapshotMeta.createdAt}</span>
      </div>

      <DealKpiCard kpis={vm.kpis} />

      {vm.flags.hasExits ? <DealExitTable exits={vm.exits} /> : null}

      {vm.flags.hasAssumptions ? (
        <DealAssumptionsSummary assumptions={vm.assumptions} />
      ) : null}
    </div>
  );
}
