"use client";

import { useCallback, useMemo, useState } from "react";
import { FractPathCalculatorWidget } from "fractpath-calculator-widget";
import { normalizeDealTermsForWidget } from "@/lib/normalizeDealTermsForWidget";

type AnyRecord = Record<string, unknown>;

type DealWidgetShellProps = {
  initialSnapshot?: AnyRecord | null;
  canEdit: boolean;
  persona?: string;
  onSave?: (inputs: { deal_terms: AnyRecord; scenario: AnyRecord }) => void | Promise<void>;
};

function safeRecord(v: unknown): AnyRecord | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as AnyRecord)
    : null;
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

  const handleSave = useCallback(
    async (payload: unknown) => {
      const p = safeRecord(payload) ?? {};
      const maybeSnapshot = safeRecord((p as any).snapshot) ?? safeRecord(p);
      const maybeInputs =
        safeRecord((maybeSnapshot as any)?.inputs) ??
        safeRecord((p as any)?.inputs);

      if (!maybeInputs) {
        setError("Save failed: widget did not provide inputs.");
        return;
      }

      const dealTerms = safeRecord((maybeInputs as any).deal_terms);
      const scenario = safeRecord((maybeInputs as any).scenario);

      if (!dealTerms || !scenario) {
        setError("Save failed: missing deal_terms or scenario.");
        return;
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
    [onSave],
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
