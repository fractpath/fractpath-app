// src/components/deal/DealSummary.tsx
//
// Canonical-only DealSummary renderer.
// Defensive against missing legacy fields (e.g. vm.flags).

import React from "react";

export type DealSummaryVM = {
  kpis: Array<{ label: string; value: string }>;
  flags?: {
    isHistorical?: boolean;
  };
};

export function DealSummary({ vm }: { vm: DealSummaryVM }) {
  const isHistorical = !!vm?.flags?.isHistorical;

  return (
    <div className="space-y-5">
      {isHistorical ? (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Viewing a previous snapshot — not the latest version
        </div>
      ) : null}

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950">
        <div className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
          Scenario snapshot
        </div>

        {Array.isArray(vm?.kpis) && vm.kpis.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {vm.kpis.map((k, idx) => (
              <div
                key={`${k.label}-${idx}`}
                className="rounded-lg border border-gray-200 p-3 dark:border-gray-800"
              >
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {k.label}
                </div>
                <div className="mt-1 text-base font-semibold text-gray-900 dark:text-gray-100">
                  {k.value}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-600 dark:text-gray-300">
            No computed results available for this snapshot.
          </div>
        )}
      </div>
    </div>
  );
}
