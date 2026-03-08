"use client";

import { useCallback, useMemo, useState } from "react";
import { DealEditModal } from "fractpath-calculator-widget";
import { extractDealDisplayModel } from "@/lib/dealSnapshotDisplay";
import { normalizeDealTermsForWidget } from "@/lib/normalizeDealTermsForWidget";
import { useDealDraftState } from "@/lib/useDealDraftState";
import type { DraftCanonicalInputs } from "@/lib/useDealDraftState";

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

function formatCurrency(v: number | null): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);
}

function formatInteger(v: number | null): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(v);
}

function ValueCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div className="mt-1 text-base font-semibold text-gray-900 dark:text-gray-100">
        {value}
      </div>
    </div>
  );
}

function EditModalMount({
  initial,
  persona,
  onClose,
  onSaved,
}: {
  initial: DraftCanonicalInputs;
  persona: string;
  onClose: () => void;
  onSaved: (saved: DraftCanonicalInputs) => void;
}) {
  const { draft, errors, preview, setField, onBlurCompute } =
    useDealDraftState(initial);

  return (
    <DealEditModal
      draft={draft as any}
      errors={errors}
      preview={preview as any}
      persona={persona as any}
      setField={setField as any}
      onBlurCompute={onBlurCompute}
      onSave={(saved: any) => onSaved(saved)}
      onClose={onClose}
    />
  );
}

export function DealWidgetShell({
  initialSnapshot,
  canEdit,
  persona = "homeowner",
  onSave,
}: DealWidgetShellProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const snap = useMemo(() => safeRecord(initialSnapshot), [initialSnapshot]);
  const inputs = useMemo(() => safeRecord((snap as any)?.inputs), [snap]);

  const dealTerms = useMemo(
    () =>
      normalizeDealTermsForWidget(
        safeRecord((inputs as any)?.deal_terms) ?? {},
      ),
    [inputs],
  );

  const scenario = useMemo(() => {
    const sc = safeRecord((inputs as any)?.scenario) ?? {};
    return {
      ...sc,
      exit_year: safeNumber((sc as any)?.exit_year) ?? 5,
    } as AnyRecord;
  }, [inputs]);

  const model = useMemo(
    () => extractDealDisplayModel(initialSnapshot ?? null),
    [initialSnapshot],
  );

  const hasAnyData =
    model.propertyValue != null ||
    model.upfrontAmount != null ||
    model.monthlyPayment != null ||
    model.paymentCount != null ||
    model.exitYear != null;

  const canEditSnapshot = !!canEdit && !!onSave;

  const modalInitial = useMemo<DraftCanonicalInputs>(() => {
    return {
      deal_terms: dealTerms,
      scenario,
    };
  }, [dealTerms, scenario]);

  const handleSaved = useCallback(
    async (saved: DraftCanonicalInputs) => {
      setError(null);
      try {
        await onSave?.({
          deal_terms: normalizeDealTermsForWidget(
            safeRecord(saved?.deal_terms) ?? {},
          ),
          scenario: safeRecord(saved?.scenario) ?? { exit_year: 5 },
        });
        setEditOpen(false);
      } catch (err: any) {
        setError(err?.message ?? "Save failed");
      }
    },
    [onSave],
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
      {error ? (
        <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Saved Deal Terms
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            This section is rendered only from the latest saved deal snapshot.
          </p>
        </div>

        {canEditSnapshot ? (
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {hasAnyData ? "Edit Terms" : "Add Deal Terms"}
          </button>
        ) : null}
      </div>

      {hasAnyData ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <ValueCard label="FMV" value={formatCurrency(model.propertyValue)} />
          <ValueCard
            label="Upfront"
            value={formatCurrency(model.upfrontAmount)}
          />
          <ValueCard
            label="Monthly"
            value={formatCurrency(model.monthlyPayment)}
          />
          <ValueCard
            label="Payments"
            value={formatInteger(model.paymentCount)}
          />
          <ValueCard label="Exit Year" value={formatInteger(model.exitYear)} />
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No saved terms yet.
        </p>
      )}

      {editOpen && canEditSnapshot ? (
        <EditModalMount
          initial={modalInitial}
          persona={persona}
          onClose={() => setEditOpen(false)}
          onSaved={handleSaved}
        />
      ) : null}
    </div>
  );
}
