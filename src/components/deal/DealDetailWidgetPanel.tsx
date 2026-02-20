"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { DealSnapshotView } from "./DealSnapshotView";
import { DealEditModal } from "./DealEditModal";

type AnyRecord = Record<string, unknown>;

type DealDetailWidgetPanelProps = {
  dealId: string;
  inputs: AnyRecord | null;
  results: AnyRecord | null;
  computeVersion?: string | null;
  canEdit: boolean;
};

export function DealDetailWidgetPanel({
  dealId,
  inputs,
  results,
  computeVersion,
  canEdit,
}: DealDetailWidgetPanelProps) {
  const router = useRouter();
  const [isEditOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(
    async (nextInputs: { deal_terms: AnyRecord; scenario: AnyRecord }) => {
      setSaving(true);
      setError(null);

      try {
        const res = await fetch(`/api/deals/${dealId}/snapshot/compute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inputs: nextInputs }),
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

  const dealTerms = (inputs?.deal_terms ?? {}) as AnyRecord;
  const scenario = (inputs?.scenario ?? {}) as AnyRecord;

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

      <DealSnapshotView inputs={inputs} results={results} computeVersion={computeVersion} />

      {canEdit ? (
        <DealEditModal
          isOpen={isEditOpen}
          onClose={() => { if (!saving) setEditOpen(false); }}
          initialInputs={{ deal_terms: dealTerms, scenario }}
          onSave={handleSave}
          saving={saving}
        />
      ) : null}
    </section>
  );
}
