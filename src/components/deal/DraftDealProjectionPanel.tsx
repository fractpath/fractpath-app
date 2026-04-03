"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DealSnapshotView } from "fractpath-calculator-widget";
import { normalizeDealTermsForWidget } from "@/lib/normalizeDealTermsForWidget";
import {
  normalizeResultsForWidget,
} from "@/components/deal/widgetNormalization";
import { DealWidgetShell } from "@/components/deal/DealWidgetShell";
import { usePageLoading } from "@/components/ui/PageLoadingOverlay";
import { CANONICAL_SCENARIO_DEFAULTS } from "@/lib/canonicalDefaults";

type AnyRecord = Record<string, unknown>;

type DraftDealProjectionPanelProps = {
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

function hasRenderableComputedSnapshot(
  inputs: AnyRecord | null,
  results: AnyRecord | null,
): boolean {
  if (!inputs || !results) return false;

  const dealTerms = safeRecord((inputs as any)?.deal_terms);
  const scenario = safeRecord((inputs as any)?.scenario);

  if (!dealTerms || !scenario) return false;

  const requiredResultKeys = [
    "current_contract_value",
    "current_participation_value",
    "extension_adjusted_buyout_amount",
    "total_scheduled_buyer_funding",
    "actual_buyer_funding_to_date",
    "funding_completion_factor",
    "scheduled_buyer_appreciation_share",
    "effective_buyer_appreciation_share",
    "base_buyout_amount",
    "fractpath_setup_fee_amount",
    "fractpath_revenue_to_date",
  ];

  for (const key of requiredResultKeys) {
    const v = (results as any)?.[key];
    if (typeof v !== "number" || !Number.isFinite(v)) return false;
  }

  const requiredDealTermKeys = [
    "minimum_hold_years",
    "contract_maturity_years",
    "target_exit_window_start_year",
    "target_exit_window_end_year",
    "long_stop_year",
    "servicing_fee_monthly",
    "exit_admin_fee_amount",
  ];

  for (const key of requiredDealTermKeys) {
    if ((dealTerms as any)?.[key] == null) return false;
  }

  if (
    typeof (scenario as any)?.annual_appreciation !== "number" ||
    !Number.isFinite((scenario as any).annual_appreciation)
  ) {
    return false;
  }

  return true;
}

export function DraftDealProjectionPanel({
  dealId,
  initialSnapshot,
  inputs,
  results,
  computeVersion,
  canEdit,
  persona = "homeowner",
}: DraftDealProjectionPanelProps) {
  const router = useRouter();
  const pageLoading = usePageLoading();

  const hasData =
    hasSubstantiveData(safeRecord(initialSnapshot)) || !!inputs || !!results;

  const [showWidget, setShowWidget] = useState(hasData);
  const [openEditorImmediately, setOpenEditorImmediately] = useState(false);

  const seedSnapshot = useMemo(() => {
    const snap = safeRecord(initialSnapshot);

    if (snap && hasSubstantiveData(snap)) {
      const snapInputs = safeRecord((snap as any)?.inputs);
      const snapDealTerms = safeRecord((snapInputs as any)?.deal_terms);
      const snapScenario = safeRecord((snapInputs as any)?.scenario);
      const snapResults = safeRecord((snap as any)?.outputs?.results);

      const annualAppreciation =
        typeof (snapScenario as any)?.annual_appreciation === "number" &&
        Number.isFinite((snapScenario as any).annual_appreciation)
          ? (snapScenario as any).annual_appreciation
          : CANONICAL_SCENARIO_DEFAULTS.annual_appreciation;

      return {
        ...snap,
        inputs: {
          ...(snapInputs ?? {}),
          deal_terms: normalizeDealTermsForWidget(snapDealTerms ?? {}),
          scenario: {
            ...(snapScenario ?? {}),
            annual_appreciation: annualAppreciation,
          },
        },
        outputs: {
          ...(safeRecord((snap as any)?.outputs) ?? {}),
          results: snapResults ? normalizeResultsForWidget(snapResults) : null,
        },
      } as AnyRecord;
    }

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
      outputs: { results: outRec ? normalizeResultsForWidget(outRec) : null },
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

  const currentInputs = safeRecord((seedSnapshot as any)?.inputs);
  const currentResults = safeRecord((seedSnapshot as any)?.outputs?.results);
  const renderable = hasRenderableComputedSnapshot(currentInputs, currentResults);

  const handleSave = useCallback(
    async (parsed: { deal_terms: AnyRecord; scenario: AnyRecord }) => {
      pageLoading.show("Saving…");
      try {
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

        setOpenEditorImmediately(false);
        router.refresh();
      } finally {
        pageLoading.hide();
      }
    },
    [dealId, router, pageLoading],
  );

  const openHeaderPropertyModal = useCallback(() => {
    const btn = document.querySelector(
      '[data-testid="deal-add-property-btn"]',
    ) as HTMLButtonElement | null;

    if (btn) {
      btn.click();
      return;
    }

    const empty = document.querySelector(
      '[data-testid="deal-property-empty"]',
    ) as HTMLElement | null;

    if (empty) {
      empty.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

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

          <div className="flex flex-wrap items-center justify-center gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  setShowWidget(true);
                  setOpenEditorImmediately(true);
                }}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Add Deal Terms
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t pt-6 space-y-4">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Scenario Details</h2>
        {!canEdit ? (
          <span className="text-xs text-muted-foreground">View only</span>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Projection only — not an active deal status.
      </p>

      <DealWidgetShell
        initialSnapshot={seedSnapshot ?? defaultSeed}
        canEdit={canEdit}
        persona={persona}
        onSave={canEdit ? handleSave : undefined}
        initiallyOpenEditor={openEditorImmediately}
      />

      {renderable && currentResults ? (
        <DealSnapshotView
          persona={persona as any}
          status={"draft" as any}
          inputs={currentInputs as any}
          results={currentResults as any}
        />
      ) : null}
    </div>
  );
}
