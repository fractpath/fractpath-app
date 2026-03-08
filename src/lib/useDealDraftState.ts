"use client";

import { useState, useCallback, useMemo } from "react";
import { FEE_DEFAULTS } from "fractpath-calculator-widget";

type AnyRecord = Record<string, unknown>;

export interface DraftCanonicalInputs {
  deal_terms: AnyRecord;
  scenario: AnyRecord;
}

export type FieldErrors = Partial<Record<string, string>>;

interface Tier1Preview {
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
  results?: AnyRecord;
}

type DraftPath = `deal_terms.${string}` | `scenario.${string}`;

function num(v: unknown, fallback: number): number {
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function deriveTier1Preview(draft: DraftCanonicalInputs): Tier1Preview {
  const dt = draft.deal_terms as any;
  const sc = draft.scenario as any;

  const upfront = num(dt.upfront_payment, 0);
  const monthly = num(dt.monthly_payment, 0);
  const payments = num(dt.number_of_payments, 0);
  const exitYear = num(sc.exit_year, 7);

  const exitMonth = Math.floor(exitYear * 12);
  const paymentsMadeByExit = Math.min(payments, exitMonth);
  const totalInstallments = monthly * paymentsMadeByExit;
  const totalCashPaid = upfront + totalInstallments;

  const installmentsLabel =
    paymentsMadeByExit === 0
      ? "No installments"
      : `${paymentsMadeByExit} payments of ${formatCurrency(monthly)}`;

  return {
    upfrontCash: upfront,
    installmentsLabel,
    totalInstallments,
    totalCashPaid,
  };
}

function validateDraft(draft: DraftCanonicalInputs): FieldErrors {
  const errors: FieldErrors = {};
  const dt = draft.deal_terms as any;
  const sc = draft.scenario as any;

  if (num(dt.property_value, 0) <= 0) {
    errors["deal_terms.property_value"] = "Property value must be greater than 0";
  }
  if (num(dt.upfront_payment, 0) < 0) {
    errors["deal_terms.upfront_payment"] = "Upfront payment cannot be negative";
  }
  if (num(dt.monthly_payment, 0) < 0) {
    errors["deal_terms.monthly_payment"] = "Monthly payment cannot be negative";
  }
  if (num(dt.number_of_payments, 0) < 0) {
    errors["deal_terms.number_of_payments"] = "Number of payments cannot be negative";
  }
  if (num(sc.exit_year, 0) <= 0) {
    errors["scenario.exit_year"] = "Exit year must be greater than 0";
  }
  if (sc.annual_appreciation != null) {
    const aa = num(sc.annual_appreciation, 0);
    if (aa < -0.5 || aa > 0.5) {
      errors["scenario.annual_appreciation"] = "Annual appreciation must be between -50% and 50%";
    }
  }
  if (dt.realtor_commission_pct != null) {
    const rc = num(dt.realtor_commission_pct, 0);
    if (rc < 0 || rc > 0.06) {
      errors["deal_terms.realtor_commission_pct"] = "Realtor commission must be between 0% and 6%";
    }
  }
  if (
    dt.realtor_representation_mode === "NONE" &&
    dt.realtor_commission_pct != null &&
    num(dt.realtor_commission_pct, 0) !== 0
  ) {
    errors["deal_terms.realtor_commission_pct"] = "Commission must be 0% when representation mode is NONE";
  }

  return errors;
}

function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

function getDefaultDraft(): DraftCanonicalInputs {
  return {
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
      platform_fee: FEE_DEFAULTS.platform_fee,
      servicing_fee_monthly: FEE_DEFAULTS.servicing_fee_monthly,
      exit_fee_pct: FEE_DEFAULTS.exit_fee_pct,
      realtor_representation_mode: "NONE",
      realtor_commission_pct: 0,
      realtor_commission_payment_mode: "PER_PAYMENT_EVENT",
    },
    scenario: {
      annual_appreciation: 0.03,
      closing_cost_pct: 0.02,
      exit_year: 7,
    },
  };
}

function setNestedField(
  draft: DraftCanonicalInputs,
  path: DraftPath,
  value: unknown,
): DraftCanonicalInputs {
  const clone = structuredClone(draft);
  const [section, field] = path.split(".") as [
    "deal_terms" | "scenario",
    string,
  ];
  (clone[section] as Record<string, unknown>)[field] = value;
  return clone;
}

export function useDealDraftState(initial?: DraftCanonicalInputs) {
  const seed = initial ?? getDefaultDraft();

  const [draft, setDraft] = useState<DraftCanonicalInputs>(() => seed);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [preview, setPreview] = useState<PreviewState>(() => ({
    tier1: deriveTier1Preview(seed),
    status: "idle" as PreviewStatus,
  }));

  const setField = useCallback((path: DraftPath, value: unknown) => {
    setDraft((prev) => {
      const next = setNestedField(prev, path, value);
      setPreview((p) => ({ ...p, tier1: deriveTier1Preview(next) }));
      return next;
    });
  }, []);

  const onBlurCompute = useCallback(() => {
    setDraft((current) => {
      const fieldErrors = validateDraft(current);
      setErrors(fieldErrors);

      if (hasErrors(fieldErrors)) {
        setPreview((p) => ({
          ...p,
          status: "error" as PreviewStatus,
          error: "Validation failed",
        }));
        return current;
      }

      setPreview({
        tier1: deriveTier1Preview(current),
        status: "ok" as PreviewStatus,
        lastComputedAtIso: new Date().toISOString(),
      });

      return current;
    });
  }, []);

  const tier1 = useMemo(() => deriveTier1Preview(draft), [draft]);

  return {
    draft,
    errors,
    preview: { ...preview, tier1 },
    setField,
    onBlurCompute,
  } as const;
}
