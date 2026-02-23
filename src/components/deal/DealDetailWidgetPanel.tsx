// src/components/deal/DealDetailWidgetPanel.tsx
"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { DealSnapshotView, DealEditModal } from "fractpath-calculator-widget";
import type {
  DealTerms,
  ScenarioAssumptions,
  DealResults,
} from "@fractpath/compute";
import { useDealDraftState } from "@/hooks/useDealDraftState";

type AnyRecord = Record<string, unknown>;

type DealDetailWidgetPanelProps = {
  dealId: string;

  /**
   * Full canonical snapshot payload (snapshot_json) for seeding an interactive widget.
   * Presently unused in this panel, but accepted so the deal page can pass it without TS errors.
   */
  initialSnapshot?: AnyRecord | null;

  inputs: AnyRecord | null;
  results: AnyRecord | null;
  computeVersion?: string | null;
  canEdit: boolean;
  persona?: string;
};

// ---- Widget-compat normalization (stopgap until compute/widget contracts converge) ----
function normalizeDealTermsForWidget(raw: DealTerms): DealTerms {
  const r = raw as any;
  return {
    ...(raw as any),
    platform_fee: r.platform_fee ?? 0,
    servicing_fee_monthly: r.servicing_fee_monthly ?? 0,
    exit_fee_pct: r.exit_fee_pct ?? 0,
    realtor_representation_mode: r.realtor_representation_mode ?? "NONE",
    realtor_commission_pct: r.realtor_commission_pct ?? 0,
    realtor_commission_payment_mode:
      r.realtor_commission_payment_mode ?? "UPFRONT",
  } as any;
}

function normalizeResultsForWidget(raw: AnyRecord): DealResults {
  const r = raw as any;
  return {
    ...(raw as any),
    isa_settlement: r.isa_settlement ?? 0,
    investor_profit: r.investor_profit ?? 0,
    investor_multiple: r.investor_multiple ?? 0,
    investor_irr_annual: r.investor_irr_annual ?? 0,
    projected_fmv: r.projected_fmv ?? 0,
    timing_factor_applied: r.timing_factor_applied ?? 1,
    realtor_fee_total_projected: r.realtor_fee_total_projected ?? 0,
    realtor_fee_upfront_projected: r.realtor_fee_upfront_projected ?? 0,
    realtor_fee_installments_projected:
      r.realtor_fee_installments_projected ?? 0,
    buyer_realtor_fee_total_projected: r.buyer_realtor_fee_total_projected ?? 0,
    seller_realtor_fee_total_projected:
      r.seller_realtor_fee_total_projected ?? 0,
  } as DealResults;
}

export function DealDetailWidgetPanel({
  dealId,
  // accepted for TS + future Option A wiring; currently unused
  initialSnapshot: _initialSnapshot,
  inputs,
  results,
  computeVersion: _computeVersion,
  canEdit,
  persona = "homeowner",
}: DealDetailWidgetPanelProps) {
  const router = useRouter();
  const [isEditOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typedInputsRaw = inputs as {
    deal_terms: DealTerms;
    scenario: ScenarioAssumptions;
  } | null;

  const typedInputs = typedInputsRaw
    ? ({
        ...typedInputsRaw,
        deal_terms: normalizeDealTermsForWidget(typedInputsRaw.deal_terms),
      } as any)
    : null;

  const typedResults = results ? normalizeResultsForWidget(results) : null;

  const draftState = useDealDraftState(
    typedInputs
      ? { deal_terms: typedInputs.deal_terms, scenario: typedInputs.scenario }
      : undefined,
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

        const body = await res
          .json()
          .catch(() => ({ ok: false, error: "Invalid response" }));

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

  const hasSnapshot = !!(
    typedInputs &&
    typedResults &&
    Number.isFinite((typedResults as any).invested_capital_total) &&
    Number.isFinite((typedResults as any).isa_settlement) &&
    Number.isFinite((typedResults as any).projected_fmv) &&
    Number.isFinite((typedResults as any).investor_multiple) &&
    Number.isFinite((typedResults as any).investor_irr_annual)
  );

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
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No snapshot data available.
          </p>
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
          onBlurCompute={() => draftState.onBlurCompute()}
          onSave={(draft: unknown) =>
            handleSave(
              draft as { deal_terms: DealTerms; scenario: ScenarioAssumptions },
            )
          }
          onClose={() => {
            if (!saving) setEditOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}
