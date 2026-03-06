"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeDealTermsForWidget } from "@/lib/normalizeDealTermsForWidget";
import { DealWidgetShell } from "@/components/deal/DealWidgetShell";

type AnyRecord = Record<string, unknown>;

type DealDetailWidgetPanelProps = {
  dealId: string;
  initialSnapshot?: AnyRecord | null;
  inputs: AnyRecord | null;
  results: AnyRecord | null;
  computeVersion?: string | null;
  canEdit: boolean;
  persona?: string;
};

function safeRecord(v: unknown): AnyRecord | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as AnyRecord)
    : null;
}

function hasSubstantiveData(snap: AnyRecord | null): boolean {
  if (!snap) return false;
  const inputs = safeRecord((snap as any)?.inputs);
  const results = safeRecord((snap as any)?.outputs?.results);
  return !!(inputs || results);
}

export function DealDetailWidgetPanel({
  dealId,
  initialSnapshot,
  inputs,
  results,
  computeVersion,
  canEdit,
  persona = "homeowner",
}: DealDetailWidgetPanelProps) {
  const router = useRouter();

  const hasData = hasSubstantiveData(safeRecord(initialSnapshot)) || !!inputs || !!results;
  const [showWidget, setShowWidget] = useState(hasData);

  const seedSnapshot = useMemo(() => {
    const snap = safeRecord(initialSnapshot);

    if (snap && hasSubstantiveData(snap)) return snap;

    const inRec = safeRecord(inputs);
    const outRec = safeRecord(results);
    if (!inRec && !outRec) return null;

    let normalizedInputs: AnyRecord | null = inRec;
    if (
      inRec &&
      safeRecord((inRec as any).deal_terms) &&
      safeRecord((inRec as any).scenario)
    ) {
      const dealTerms = (inRec as any).deal_terms as AnyRecord;
      const scenario = (inRec as any).scenario as AnyRecord;
      normalizedInputs = {
        ...(inRec as any),
        deal_terms: normalizeDealTermsForWidget(dealTerms),
        scenario,
      };
    }

    return {
      inputs: normalizedInputs ?? null,
      outputs: { results: outRec ?? null },
      compute_version: computeVersion ?? null,
      schema_version: (initialSnapshot as any)?.schema_version ?? null,
    } as AnyRecord;
  }, [initialSnapshot, inputs, results, computeVersion]);

  const defaultSeed = useMemo<AnyRecord>(
    () => ({
      inputs: { deal_terms: {}, scenario: {} },
      outputs: { results: null },
      compute_version: null,
      schema_version: "1",
    }),
    [],
  );

  const handleSave = useCallback(
    async (parsed: { deal_terms: AnyRecord; scenario: AnyRecord }) => {
      const payload: AnyRecord = { inputs: parsed };

      const res = await fetch(`/api/deals/${dealId}/snapshot/compute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await res
        .json()
        .catch(() => ({ ok: false, error: "Invalid response" }));
      if (!res.ok || body.ok === false) {
        throw new Error(body.error ?? `Save failed (${res.status})`);
      }

      router.refresh();
    },
    [dealId, router],
  );

  if (!showWidget) {
    return (
      <div className="border-t pt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Scenario Details</h2>
        </div>

        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-8">
          <p className="text-sm text-muted-foreground mb-3">
            No deal terms configured yet
          </p>
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowWidget(true)}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Add Deal Terms
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="border-t pt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Scenario Details</h2>
        {!canEdit ? (
          <span className="text-xs text-muted-foreground">View only</span>
        ) : null}
      </div>

      <DealWidgetShell
        initialSnapshot={seedSnapshot ?? defaultSeed}
        canEdit={canEdit}
        persona={persona}
        onSave={canEdit ? handleSave : undefined}
      />
    </div>
  );
}
