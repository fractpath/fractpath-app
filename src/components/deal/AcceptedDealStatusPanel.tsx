"use client";

import { useMemo } from "react";
import { DealSnapshotView } from "fractpath-calculator-widget";
import { normalizeDealTermsForWidget } from "@/lib/normalizeDealTermsForWidget";
import {
  normalizeResultsForWidget,
} from "@/components/deal/widgetNormalization";
import { DealWidgetShell } from "@/components/deal/DealWidgetShell";
import { CANONICAL_SCENARIO_DEFAULTS } from "@/lib/canonicalDefaults";

type AnyRecord = Record<string, unknown>;

type AcceptedDealStatusPanelProps = {
  dealId: string;
  initialSnapshot?: AnyRecord | null;
  inputs: AnyRecord | null;
  results: AnyRecord | null;
  computeVersion?: string | null;
  persona?: string;
  canonicalStage?: string | null;
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

/**
 * Maps a canonical workflow stage to a plain-language status label for the
 * accepted-deal panel. Window-based labels (exit window, extension periods)
 * require acceptance-date tracking and will be introduced in a later phase.
 */
function resolveStatusLabel(stage: string | null): string {
  if (!stage) return "Active";
  switch (stage) {
    case "servicing_active":
    case "deal_closed":
      return "Deal active";
    case "agreement_signed":
      return "Agreement signed";
    case "agreement_out_for_signatures":
      return "Agreement out for signatures";
    case "ready_for_signatures":
      return "Agreement being prepared";
    default:
      return "Active";
  }
}

export function AcceptedDealStatusPanel({
  dealId: _dealId,
  initialSnapshot,
  inputs,
  results,
  computeVersion,
  persona = "homeowner",
  canonicalStage,
}: AcceptedDealStatusPanelProps) {
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

  const statusLabel = resolveStatusLabel(canonicalStage ?? null);

  return (
    <div className="border-t pt-6 space-y-4">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Agreement Terms</h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {statusLabel}
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        Modeled from your accepted agreement and scheduled payments.
      </p>

      <DealWidgetShell
        initialSnapshot={seedSnapshot ?? defaultSeed}
        canEdit={false}
        persona={persona}
        onSave={undefined}
        initiallyOpenEditor={false}
      />

      {renderable && currentResults ? (
        <DealSnapshotView
          persona={persona as any}
          status={"accepted" as any}
          inputs={currentInputs as any}
          results={currentResults as any}
        />
      ) : null}
    </div>
  );
}
