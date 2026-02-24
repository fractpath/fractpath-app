"use client";

import { useCallback, useMemo, useState } from "react";
import { FractPathCalculatorWidget } from "fractpath-calculator-widget";
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

/**
 * Normalize widget onSave payloads to deal_terms + scenario (scenario may be empty).
 */
function pickInputsFromPayload(
  payload: unknown,
): { deal_terms: AnyRecord; scenario: AnyRecord } | null {
  const p = safeRecord(payload);
  if (!p) return null;

  const candidates: unknown[] = [
    (p as any).inputs,
    (p as any).snapshot?.inputs,
    (p as any).snapshot_json?.inputs,
    (p as any).snapshot,
    (p as any).snapshot_json,
    p,
  ];

  for (const c of candidates) {
    const rec = safeRecord(c);
    if (!rec) continue;

    // Case 1: rec itself looks like "inputs"
    const dt1 = safeRecord((rec as any).deal_terms);
    if (dt1) {
      const sc1 = safeRecord((rec as any).scenario) ?? {};
      return { deal_terms: dt1, scenario: sc1 };
    }

    // Case 2: rec looks like a snapshot, and .inputs exists
    const nestedInputs = safeRecord((rec as any).inputs);
    if (nestedInputs) {
      const dt2 = safeRecord((nestedInputs as any).deal_terms);
      if (dt2) {
        const sc2 = safeRecord((nestedInputs as any).scenario) ?? {};
        return { deal_terms: dt2, scenario: sc2 };
      }
    }
  }

  return null;
}

export function DealWidgetShell({
  initialSnapshot,
  canEdit,
  persona = "homeowner",
  onSave,
}: DealWidgetShellProps) {
  const [error, setError] = useState<string | null>(null);

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

  const handleSave = useCallback(
    async (payload: unknown) => {
      // DEBUG (browser console): keep until save works, then remove

      const normalized = pickInputsFromPayload(payload);

      if (!normalized) {
        setError("Save failed: widget did not provide deal_terms.");
        return;
      }

      const dealTerms = normalized.deal_terms;

      // Ensure scenario.exit_year is present.
      const scenario: AnyRecord = { ...(normalized.scenario ?? {}) };

      const exitFromScenario = safeNumber((scenario as any).exit_year);
      const exitFromSeed = safeNumber((seedScenario as any).exit_year);

      if (exitFromScenario == null) {
        if (exitFromSeed != null) {
          (scenario as any).exit_year = exitFromSeed;
        } else {
          // last-resort default (keeps compute unblocked)
          (scenario as any).exit_year = 5;
        }
      }

      setError(null);

      try {
        await onSave?.({
          deal_terms: normalizeDealTermsForWidget(dealTerms),
          scenario,
        });
      } catch (err: any) {
        setError(err?.message ?? "Save failed");
      }
    },
    [onSave, seedScenario],
  );

  return (
    <div>
      {error ? (
        <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {seedSnapshot ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
          <FractPathCalculatorWidget
            persona={persona as any}
            mode="app"
            canEdit={canEdit}
            initialSnapshot={seedSnapshot as any}
            onSave={canEdit && onSave ? handleSave : undefined}
          />
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
