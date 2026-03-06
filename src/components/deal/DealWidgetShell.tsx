"use client";

import { useCallback, useMemo, useState } from "react";
import {
  DealSnapshotView,
  DealEditModal,
} from "fractpath-calculator-widget";
import { normalizeDealTermsForWidget } from "@/lib/normalizeDealTermsForWidget";

type AnyRecord = Record<string, unknown>;

type DealWidgetShellProps = {
  initialSnapshot?: AnyRecord | null;
  canEdit: boolean;
  persona?: string;
  onSave?: (inputs: {
    deal_terms: AnyRecord;
    scenario: AnyRecord;
  }) => void | Promise<void>;
};

function safeRecord(v: unknown): AnyRecord | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as AnyRecord)
    : null;
}

function safeNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function DealWidgetShell({
  initialSnapshot,
  canEdit,
  persona = "homeowner",
  onSave,
}: DealWidgetShellProps) {
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const seedSnapshot = useMemo(() => {
    const snap = safeRecord(initialSnapshot);
    if (snap) {
      const inRec = safeRecord((snap as any).inputs);
      if (
        inRec &&
        safeRecord((inRec as any).deal_terms) &&
        safeRecord((inRec as any).scenario)
      ) {
        return {
          ...snap,
          inputs: {
            ...(inRec as any),
            deal_terms: normalizeDealTermsForWidget(
              (inRec as any).deal_terms as AnyRecord,
            ),
            scenario: (inRec as any).scenario,
          },
        } as AnyRecord;
      }
      return snap;
    }
    return null;
  }, [initialSnapshot]);

  const seedScenario = useMemo(() => {
    const s0 = safeRecord((seedSnapshot as any)?.inputs?.scenario);
    return s0 ?? {};
  }, [seedSnapshot]);

  const editInitial = useMemo(() => {
    const inputs = safeRecord((seedSnapshot as any)?.inputs);
    if (!inputs) return undefined;
    const dt = safeRecord((inputs as any).deal_terms);
    const sc = safeRecord((inputs as any).scenario);
    if (!dt) return undefined;
    return { deal_terms: dt, scenario: sc ?? {} };
  }, [seedSnapshot]);

  const handleModalSave = useCallback(
    async (saved: { deal_terms: AnyRecord; scenario: AnyRecord }) => {
      const dealTerms = saved.deal_terms;
      const scenario: AnyRecord = { ...(saved.scenario ?? {}) };

      const exitFromScenario = safeNumber((scenario as any).exit_year);
      const exitFromSeed = safeNumber((seedScenario as any).exit_year);

      if (exitFromScenario == null) {
        if (exitFromSeed != null) {
          (scenario as any).exit_year = exitFromSeed;
        } else {
          (scenario as any).exit_year = 5;
        }
      }

      setError(null);

      const seedTerms =
        safeRecord(
          (safeRecord((seedSnapshot as any)?.inputs) as any)?.deal_terms,
        ) ?? {};
      const seedSc =
        safeRecord(
          (safeRecord((seedSnapshot as any)?.inputs) as any)?.scenario,
        ) ?? {};

      const mergedTerms = { ...seedTerms, ...dealTerms };
      const mergedScenario = { ...seedSc, ...scenario };

      try {
        await onSave?.({
          deal_terms: normalizeDealTermsForWidget(mergedTerms),
          scenario: mergedScenario,
        });
        setEditOpen(false);
      } catch (err: any) {
        setError(err?.message ?? "Save failed");
      }
    },
    [onSave, seedScenario, seedSnapshot],
  );

  const inputs = safeRecord((seedSnapshot as any)?.inputs);
  const results = safeRecord((seedSnapshot as any)?.outputs?.results);

  return (
    <div>
      {error ? (
        <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {seedSnapshot && inputs && results ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
          <DealSnapshotView
            persona={persona as any}
            status="active"
            inputs={inputs as any}
            results={results as any}
          />

          {canEdit && onSave && (
            <div style={{ marginTop: 12, textAlign: "right" }}>
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Edit Terms
              </button>
            </div>
          )}

          {editOpen && editInitial && (
            <DealEditModal
              initial={editInitial as any}
              persona={persona as any}
              onClose={() => setEditOpen(false)}
              onSaved={handleModalSave as any}
            />
          )}
        </div>
      ) : seedSnapshot ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Snapshot data is incomplete. Missing inputs or results.
          </p>
          {canEdit && onSave && editInitial && (
            <>
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="mt-3 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Edit Terms
              </button>
              {editOpen && (
                <DealEditModal
                  initial={editInitial as any}
                  persona={persona as any}
                  onClose={() => setEditOpen(false)}
                  onSaved={handleModalSave as any}
                />
              )}
            </>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-950">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No snapshot data available.
          </p>
        </div>
      )}
    </div>
  );
}
