"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  DealSnapshotView,
  DealEditModal,
} from "fractpath-calculator-widget";
import type { DealTerms, ScenarioAssumptions, DealResults } from "@fractpath/compute";
import { useDealDraftState } from "@/hooks/useDealDraftState";

type AnyRecord = Record<string, unknown>;

type DealDetailWidgetPanelProps = {
  dealId: string;
  inputs: AnyRecord | null;
  results: AnyRecord | null;
  computeVersion?: string | null;
  canEdit: boolean;
  persona?: string;
};

export function DealDetailWidgetPanel({
  dealId,
  inputs,
  results,
  computeVersion,
  canEdit,
  persona = "homeowner",
}: DealDetailWidgetPanelProps) {
  const router = useRouter();
  const [isEditOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typedInputs = inputs as { deal_terms: DealTerms; scenario: ScenarioAssumptions } | null;
  const typedResults = results as DealResults | null;

  const draftState = useDealDraftState(
    typedInputs ? { deal_terms: typedInputs.deal_terms, scenario: typedInputs.scenario } : undefined,
  );

  const handleSave = useCallback(
    async (draft: { deal_terms: DealTerms; scenario: ScenarioAssumptions }) => {
      setSaving(true);
      setError(null);

      try {
        const res = await fetch(`/api/deals/${dealId}/snapshot/compute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inputs: draft }),
        });

        const body = await res.json().catch(() => ({ ok: false, error: "Invalid response" }));

        if (!res.ok || body.ok === false) {
          setError(body.error ?? `Save failed (${res.status})`);
          setSaving(false);
          return;
        }

        setEditOpen(false);
        setSaving(false);
        router.refresh();
      } catch (err: any) {
        setError(err.message ?? "Network error");
        setSaving(false);
      }
    },
    [dealId, router],
  );

  const hasSnapshot = !!(typedInputs && typedResults);

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Scenario Details</h2>
        {canEdit ? (
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Edit terms
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {hasSnapshot ? (
        <DealSnapshotView
          persona={persona as any}
          inputs={typedInputs}
          results={typedResults}
        />
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-950">
          <p className="text-sm text-gray-500 dark:text-gray-400">No snapshot data available.</p>
        </div>
      )}

      {canEdit && isEditOpen ? (
        <DealEditModal
          draft={draftState.draft}
          errors={draftState.errors}
          preview={draftState.preview}
          persona={persona as any}
          permissions={{ canEdit: true }}
          setField={draftState.setField}
          onBlurCompute={draftState.onBlurCompute}
          onSave={(draft) => handleSave(draft)}
          onClose={() => { if (!saving) setEditOpen(false); }}
        />
      ) : null}
    </section>
  );
}
