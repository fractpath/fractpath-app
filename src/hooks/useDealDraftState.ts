"use client";

import { useState, useCallback, useMemo } from "react";
import type { DealTerms, ScenarioAssumptions, DealResults } from "@fractpath/compute";


export interface DraftCanonicalInputs {
  deal_terms: DealTerms;
  scenario: ScenarioAssumptions;
}

export type FieldErrors = Partial<Record<string, string>>;

export interface Tier1Preview {
  upfrontCash: number;
  installmentsLabel: string;
  totalInstallments: number;
  totalCashPaid: number;
}

export type PreviewStatus = "idle" | "computing" | "ok" | "error";

export interface PreviewState {
  tier1: Tier1Preview;
  status: PreviewStatus;
  error?: string;
  lastComputedAtIso?: string;
  results?: DealResults;
}

type DraftPath =
  | `deal_terms.${string & keyof DraftCanonicalInputs["deal_terms"]}`
  | `scenario.${string & keyof DraftCanonicalInputs["scenario"]}`;

function deriveTier1Preview(draft: DraftCanonicalInputs): Tier1Preview {
  const { upfront_payment, monthly_payment, number_of_payments } = draft.deal_terms;
  const { exit_year } = draft.scenario;

  const exitMonth = Math.floor(exit_year * 12);
  const paymentsMadeByExit = Math.min(number_of_payments, exitMonth);
  const totalInstallments = monthly_payment * paymentsMadeByExit;
  const totalCashPaid = upfront_payment + totalInstallments;

  const installmentsLabel =
    paymentsMadeByExit === 0
      ? "No installments"
      : `${paymentsMadeByExit} payments of $${monthly_payment.toLocaleString("en-US")}`;

  return {
    upfrontCash: upfront_payment,
    installmentsLabel,
    totalInstallments,
    totalCashPaid,
  };
}

function validateDraft(draft: DraftCanonicalInputs): FieldErrors {
  const errors: FieldErrors = {};
  const { deal_terms, scenario } = draft;

  if (deal_terms.property_value <= 0) {
    errors["deal_terms.property_value"] = "Property value must be greater than 0";
  }
  if (deal_terms.upfront_payment < 0) {
    errors["deal_terms.upfront_payment"] = "Upfront payment cannot be negative";
  }
  if (deal_terms.monthly_payment < 0) {
    errors["deal_terms.monthly_payment"] = "Monthly payment cannot be negative";
  }
  if (deal_terms.number_of_payments < 0) {
    errors["deal_terms.number_of_payments"] = "Number of payments cannot be negative";
  }
  if (scenario.exit_year <= 0) {
    errors["scenario.exit_year"] = "Exit year must be greater than 0";
  }
  if (scenario.annual_appreciation < -0.5 || scenario.annual_appreciation > 0.5) {
    errors["scenario.annual_appreciation"] = "Annual appreciation must be between -50% and 50%";
  }

  return errors;
}

function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

function setNestedField(
  draft: DraftCanonicalInputs,
  path: DraftPath,
  value: unknown,
): DraftCanonicalInputs {
  const clone = structuredClone(draft);
  const [section, field] = path.split(".") as ["deal_terms" | "scenario", string];
  (clone[section] as unknown as Record<string, unknown>)[field] = value;
  return clone;
}

export function useDealDraftState(initial?: DraftCanonicalInputs) {
  const defaultDraft: DraftCanonicalInputs = initial ?? {
    deal_terms: {
      property_value: 600_000,
      upfront_payment: 50_000,
      monthly_payment: 0,
      number_of_payments: 0,
      payback_window_start_year: 5,
      payback_window_end_year: 10,
      timing_factor_early: 0.8,
      timing_factor_late: 1.0,
      floor_multiple: 1.0,
      ceiling_multiple: 3.25,
      downside_mode: "HARD_FLOOR",
      contract_maturity_years: 30,
      liquidity_trigger_year: 15,
      minimum_hold_years: 3,
      platform_fee: 0,
      servicing_fee_monthly: 0,
      exit_fee_pct: 0,
    },
    scenario: {
      annual_appreciation: 0.03,
      closing_cost_pct: 0.02,
      exit_year: 7,
    },
  };

  const [draft, setDraft] = useState<DraftCanonicalInputs>(() => defaultDraft);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [preview, setPreview] = useState<PreviewState>(() => ({
    tier1: deriveTier1Preview(defaultDraft),
    status: "idle",
  }));

  const setField = useCallback((path: DraftPath, value: unknown) => {
    setDraft((prev) => {
      const next = setNestedField(prev, path, value);
      setPreview((p) => ({ ...p, tier1: deriveTier1Preview(next) }));
      return next;
    });
  }, []);

  const onBlurCompute = useCallback(
    async (dealId: string) => {
      const fieldErrors = validateDraft(draft);
      setErrors(fieldErrors);

      if (hasErrors(fieldErrors)) {
        setPreview((p) => ({
          ...p,
          status: "error",
          error: "Validation failed",
        }));
        return;
      }

      setPreview((p) => ({ ...p, status: "computing" }));

      try {
        const res = await fetch(`/api/deals/${dealId}/snapshot/compute`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ inputs: draft }),
        });

        const json = await res.json();

        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || `Compute failed (${res.status})`);
        }

        setPreview({
          tier1: deriveTier1Preview(draft),
          status: "ok",
          lastComputedAtIso: new Date().toISOString(),
          results: json.results,
        });
      } catch (err) {
        setPreview((p) => ({
          ...p,
          status: "error",
          error: err instanceof Error ? err.message : "Compute failed",
        }));
      }
    },
    [draft],
  );

  const tier1 = useMemo(() => deriveTier1Preview(draft), [draft]);

  return {
    draft,
    errors,
    preview: { ...preview, tier1 },
    setField,
    onBlurCompute,
  } as const;
}
