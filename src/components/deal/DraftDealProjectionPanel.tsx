"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeDealTermsForWidget } from "@/lib/normalizeDealTermsForWidget";
import {
  normalizeResultsForWidget,
} from "@/components/deal/widgetNormalization";
import { DealWidgetShell } from "@/components/deal/DealWidgetShell";
import { usePageLoading } from "@/components/ui/PageLoadingOverlay";
import {
  CANONICAL_DEAL_TERM_DEFAULTS,
  CANONICAL_SCENARIO_DEFAULTS,
} from "@/lib/canonicalDefaults";
import {
  buildMonthlyBuyoutSeries,
  computeContractedDealSize,
  computeSetupFee,
} from "@/lib/deal/buyoutProjection";
import { BuyoutProjectionChart } from "@/components/deal/BuyoutProjectionChart";

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

function safeNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmtCurrency(v: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);
}

function fmtPercent(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
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
    "total_scheduled_buyer_funding",
    "scheduled_buyer_appreciation_share",
    "extension_adjusted_buyout_amount",
    "base_buyout_amount",
  ];

  for (const key of requiredResultKeys) {
    const v = (results as any)?.[key];
    if (typeof v !== "number" || !Number.isFinite(v)) return false;
  }

  if (
    typeof (scenario as any)?.annual_appreciation !== "number" ||
    !Number.isFinite((scenario as any).annual_appreciation)
  ) {
    return false;
  }

  return true;
}

type MetricCardProps = {
  label: string;
  value: string;
  sub?: string;
};

function MetricCard({ label, value, sub }: MetricCardProps) {
  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-3 flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground leading-tight">{label}</span>
      <span className="text-lg font-semibold tabular-nums leading-tight">{value}</span>
      {sub ? (
        <span className="text-xs text-muted-foreground leading-tight">{sub}</span>
      ) : null}
    </div>
  );
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
      normalizedInputs = {
        ...(inRec as any),
        deal_terms: normalizeDealTermsForWidget(dealTerms),
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

  const dealTerms = safeRecord((currentInputs as any)?.deal_terms);
  const scenario = safeRecord((currentInputs as any)?.scenario);

  const propertyValue =
    safeNumber((dealTerms as any)?.property_value) ??
    CANONICAL_DEAL_TERM_DEFAULTS.property_value;
  const annualAppreciation =
    safeNumber((scenario as any)?.annual_appreciation) ??
    CANONICAL_SCENARIO_DEFAULTS.annual_appreciation;
  const exitYear =
    safeNumber((scenario as any)?.exit_year) ??
    CANONICAL_SCENARIO_DEFAULTS.exit_year;
  const longStopYear =
    safeNumber((dealTerms as any)?.long_stop_year) ??
    CANONICAL_DEAL_TERM_DEFAULTS.long_stop_year;
  const servicingFeeMonthly =
    safeNumber((dealTerms as any)?.servicing_fee_monthly) ??
    CANONICAL_DEAL_TERM_DEFAULTS.servicing_fee_monthly;
  const exitAdminFee =
    safeNumber((dealTerms as any)?.exit_admin_fee_amount) ??
    CANONICAL_DEAL_TERM_DEFAULTS.exit_admin_fee_amount;
  const paymentAdminFee =
    safeNumber((dealTerms as any)?.payment_admin_fee) ??
    CANONICAL_DEAL_TERM_DEFAULTS.payment_admin_fee;

  // Realtor representation — read from deal terms; hidden when mode is NONE.
  const realtorMode =
    ((dealTerms as any)?.realtor_representation_mode as string | undefined) ??
    CANONICAL_DEAL_TERM_DEFAULTS.realtor_representation_mode;
  const realtorCommissionPct =
    safeNumber((dealTerms as any)?.realtor_commission_pct) ??
    CANONICAL_DEAL_TERM_DEFAULTS.realtor_commission_pct;
  const showRealtor = realtorMode !== "NONE";

  // Deal payment terms — needed for contracted deal size and funding progression.
  const upfrontPayment =
    safeNumber((dealTerms as any)?.upfront_payment) ??
    CANONICAL_DEAL_TERM_DEFAULTS.upfront_payment;
  const monthlyPayment =
    safeNumber((dealTerms as any)?.monthly_payment) ??
    CANONICAL_DEAL_TERM_DEFAULTS.monthly_payment;
  const numberOfPayments =
    safeNumber((dealTerms as any)?.number_of_payments) ??
    CANONICAL_DEAL_TERM_DEFAULTS.number_of_payments;

  // Contracted deal size: upfront + (monthly × num_payments).
  // This is the correct base for setup fee — NOT property value.
  const contractedDealSize = computeContractedDealSize(
    upfrontPayment,
    monthlyPayment,
    numberOfPayments,
  );

  // Setup fee: prefer engine-computed result; derive from formula as fallback.
  // Formula: clamp(contractedDealSize × feePct, feeFloor, feeCap)
  const setupFeeFromEngine = safeNumber(
    (currentResults as any)?.fractpath_setup_fee_amount,
  );
  const setupFeePct =
    safeNumber((dealTerms as any)?.setup_fee_pct) ??
    CANONICAL_DEAL_TERM_DEFAULTS.setup_fee_pct;
  const setupFeeFloor =
    safeNumber((dealTerms as any)?.setup_fee_floor) ??
    CANONICAL_DEAL_TERM_DEFAULTS.setup_fee_floor;
  const setupFeeCap =
    safeNumber((dealTerms as any)?.setup_fee_cap) ??
    CANONICAL_DEAL_TERM_DEFAULTS.setup_fee_cap;
  const setupFee =
    setupFeeFromEngine !== null
      ? setupFeeFromEngine
      : renderable || contractedDealSize > 0
        ? computeSetupFee(contractedDealSize, setupFeePct, setupFeeFloor, setupFeeCap)
        : null;

  const projectedExitCost = safeNumber(
    (currentResults as any)?.extension_adjusted_buyout_amount,
  );
  const totalBuyerFunding = safeNumber(
    (currentResults as any)?.total_scheduled_buyer_funding,
  );
  const appreciationShare = safeNumber(
    (currentResults as any)?.scheduled_buyer_appreciation_share,
  );
  // Projected realtor fee from engine results — only shown when > 0.
  const realtorFeeProjected = safeNumber(
    (currentResults as any)?.realtor_fee_total_projected,
  );

  const projectedFmv =
    propertyValue * Math.pow(1 + annualAppreciation, exitYear);

  // Monthly buyout series and chart data
  const chartData = useMemo(() => {
    if (!renderable || appreciationShare === null) {
      return null;
    }

    const series = buildMonthlyBuyoutSeries(
      propertyValue,
      annualAppreciation,
      upfrontPayment,
      monthlyPayment,
      numberOfPayments,
      appreciationShare,
      longStopYear,
    );

    if (series.length < 2) return null;

    const exitMonthRounded = Math.round(exitYear * 12);
    const exitPoint =
      series.find((p) => p.month === exitMonthRounded) ??
      series[Math.min(exitMonthRounded, series.length - 1)];

    return { series, exitBuyout: exitPoint.buyout };
  }, [
    renderable,
    propertyValue,
    annualAppreciation,
    upfrontPayment,
    monthlyPayment,
    numberOfPayments,
    appreciationShare,
    longStopYear,
    exitYear,
  ]);

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

  if (!showWidget) {
    return (
      <div className="border-t pt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Projected Deal Summary</h2>
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
    <div className="border-t pt-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Projected Deal Summary</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Projection only — not an active deal status.
          </p>
        </div>
        {!canEdit ? (
          <span className="text-xs text-muted-foreground">View only</span>
        ) : null}
      </div>

      <DealWidgetShell
        initialSnapshot={seedSnapshot ?? defaultSeed}
        canEdit={canEdit}
        persona={persona}
        onSave={canEdit ? handleSave : undefined}
        initiallyOpenEditor={openEditorImmediately}
      />

      {renderable &&
        projectedExitCost !== null &&
        totalBuyerFunding !== null &&
        appreciationShare !== null ? (
        <>
          {/* Metric cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <MetricCard
              label="Projected Exit Cost"
              value={fmtCurrency(projectedExitCost)}
              sub={`at Year ${exitYear}`}
            />
            <MetricCard
              label="Total Buyer Funding"
              value={fmtCurrency(totalBuyerFunding)}
              sub="upfront + scheduled payments"
            />
            <MetricCard
              label="Projected Appreciation Share"
              value={fmtPercent(appreciationShare)}
              sub="of home value growth"
            />
          </div>

          {/* Monthly buyout chart */}
          {chartData ? (
            <div className="rounded-lg border bg-card px-4 pt-4 pb-2">
              <BuyoutProjectionChart
                series={chartData.series}
                exitYear={exitYear}
                exitBuyout={chartData.exitBuyout}
                chartLabel="Projected exit cost by month"
                chartSubLabel={`Blue line = projected buyout. Green marker = Year ${exitYear} (your modeled exit). Hover any point to see buyout options.`}
                chartFootnote={`Assumes ${fmtPercent(annualAppreciation)} annual appreciation. Adjust deal terms above to model different scenarios.`}
              />
            </div>
          ) : null}

          {/* Assumptions and fee summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-lg border bg-muted/20 px-4 py-3 space-y-2">
              <p className="text-xs font-semibold">Assumptions</p>
              <dl className="space-y-1">
                <div className="flex justify-between text-xs">
                  <dt className="text-muted-foreground">Annual appreciation</dt>
                  <dd className="font-medium">{fmtPercent(annualAppreciation)}</dd>
                </div>
                <div className="flex justify-between text-xs">
                  <dt className="text-muted-foreground">Modeled exit year</dt>
                  <dd className="font-medium">Year {exitYear}</dd>
                </div>
                <div className="flex justify-between text-xs">
                  <dt className="text-muted-foreground">Current home value</dt>
                  <dd className="font-medium">{fmtCurrency(propertyValue)}</dd>
                </div>
                <div className="flex justify-between text-xs">
                  <dt className="text-muted-foreground">
                    Projected home value at exit
                  </dt>
                  <dd className="font-medium">{fmtCurrency(projectedFmv)}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-lg border bg-muted/20 px-4 py-3 space-y-2">
              <p className="text-xs font-semibold">Fee summary</p>
              <dl className="space-y-1">
                {setupFee !== null ? (
                  <div className="flex justify-between text-xs">
                    <dt className="text-muted-foreground">One-time setup fee</dt>
                    <dd className="font-medium">{fmtCurrency(setupFee)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between text-xs">
                  <dt className="text-muted-foreground">Monthly servicing fee</dt>
                  <dd className="font-medium">
                    {fmtCurrency(servicingFeeMonthly)}/mo
                  </dd>
                </div>
                <div className="flex justify-between text-xs">
                  <dt className="text-muted-foreground">Payment admin fee</dt>
                  <dd className="font-medium">
                    {fmtCurrency(paymentAdminFee)}/payment
                  </dd>
                </div>
                <div className="flex justify-between text-xs">
                  <dt className="text-muted-foreground">Exit admin fee</dt>
                  <dd className="font-medium">{fmtCurrency(exitAdminFee)}</dd>
                </div>
              </dl>
              <p className="text-[10px] text-muted-foreground pt-1">
                Setup fee is a one-time payment. Monthly servicing and exit admin fees are ongoing agreement costs.
              </p>
            </div>
          </div>

          {/* Realtor representation — only rendered when a realtor mode is active */}
          {showRealtor ? (
            <div className="rounded-lg border bg-muted/20 px-4 py-3 space-y-2">
              <p className="text-xs font-semibold">Realtor representation</p>
              <dl className="space-y-1">
                <div className="flex justify-between text-xs">
                  <dt className="text-muted-foreground">Representation</dt>
                  <dd className="font-medium">
                    {realtorMode === "BUYER"
                      ? "Buyer's agent"
                      : realtorMode === "SELLER"
                        ? "Seller's agent"
                        : realtorMode === "DUAL"
                          ? "Dual agency"
                          : realtorMode}
                  </dd>
                </div>
                <div className="flex justify-between text-xs">
                  <dt className="text-muted-foreground">Commission</dt>
                  <dd className="font-medium">{fmtPercent(realtorCommissionPct)}</dd>
                </div>
                {realtorFeeProjected !== null && realtorFeeProjected > 0 ? (
                  <div className="flex justify-between text-xs">
                    <dt className="text-muted-foreground">Projected realtor fee</dt>
                    <dd className="font-medium">{fmtCurrency(realtorFeeProjected)}</dd>
                  </div>
                ) : null}
              </dl>
              <p className="text-[10px] text-muted-foreground pt-1">
                Realtor commission terms as entered. Projected fee shown when available from deal calculation.
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
