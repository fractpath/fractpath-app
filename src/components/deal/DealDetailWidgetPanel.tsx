// src/components/deal/DealDetailWidgetPanel.tsx
"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FractPathCalculatorWidget } from "fractpath-calculator-widget";

type AnyRecord = Record<string, unknown>;

type DealDetailWidgetPanelProps = {
  dealId: string;

  /**
   * Canonical snapshot_json row payload. Preferred seed.
   * Expected shape: { inputs, outputs: { results }, compute_version, schema_version, ... }
   */
  initialSnapshot?: AnyRecord | null;

  /**
   * Canonical inputs + outputs extracted via extractSnapshotDisplay().
   * Used as fallback if initialSnapshot isn't available.
   */
  inputs: AnyRecord | null;
  results: AnyRecord | null;

  computeVersion?: string | null;
  canEdit: boolean;
  persona?: string;
};

// ---- Widget-compat normalization (stopgap until compute/widget contracts converge) ----
function normalizeDealTermsForWidget(raw: AnyRecord): AnyRecord {
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
  } as AnyRecord;
}

function safeRecord(v: unknown): AnyRecord | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as AnyRecord)
    : null;
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
  const [error, setError] = useState<string | null>(null);

  // Preferred: use the stored snapshot_json directly (preserves any widget-required metadata).
  // Fallback: construct a minimal FullDealSnapshot-like object from extracted display inputs/results.
  const seedSnapshot = useMemo(() => {
    const snap = safeRecord(initialSnapshot);
    if (snap) return snap;

    const inRec = safeRecord(inputs);
    const outRec = safeRecord(results);
    if (!inRec && !outRec) return null;

    // If inputs has the shape {deal_terms, scenario}, normalize deal_terms for widget.
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

  const handleSave = useCallback(
    async (payload: unknown) => {
      // Widget may send either SavePayload or FullDealSnapshotV1 depending on implementation.
      // For app-mode, we just need inputs to recompute + persist via server.
      const p = safeRecord(payload) ?? {};
      const maybeSnapshot = safeRecord((p as any).snapshot) ?? safeRecord(p);
      const maybeInputs =
        safeRecord((maybeSnapshot as any)?.inputs) ??
        safeRecord((p as any)?.inputs);

      if (!maybeInputs) {
        setError("Save failed: widget did not provide inputs.");
        return;
      }

      // Compute endpoint expects: { inputs: { deal_terms, scenario } }
      const dealTerms = safeRecord((maybeInputs as any).deal_terms);
      const scenario = safeRecord((maybeInputs as any).scenario);

      if (!dealTerms || !scenario) {
        setError("Save failed: missing deal_terms or scenario.");
        return;
      }

      setError(null);

      try {
        const res = await fetch(`/api/deals/${dealId}/snapshot/compute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inputs: {
              deal_terms: normalizeDealTermsForWidget(dealTerms),
              scenario,
            },
          }),
        });

        const body = await res
          .json()
          .catch(() => ({ ok: false, error: "Invalid response" }));
        if (!res.ok || body.ok === false) {
          setError(body.error ?? `Save failed (${res.status})`);
          return;
        }

        router.refresh();
      } catch (err: any) {
        setError(err?.message ?? "Network error");
      }
    },
    [dealId, router],
  );

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Scenario Details</h2>
        {!canEdit ? (
          <span className="text-xs text-muted-foreground">Owner only</span>
        ) : null}
      </div>

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
            onSave={canEdit ? handleSave : undefined}
          />
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-950">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No snapshot data available.
          </p>
        </div>
      )}
    </section>
  );
}
