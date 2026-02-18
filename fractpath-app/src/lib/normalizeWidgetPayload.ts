"use client";

type AnyRecord = Record<string, unknown>;

function isRecord(v: unknown): v is AnyRecord {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function pickNum(obj: AnyRecord, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

function pickStr(obj: AnyRecord, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

const DEFAULT_DEAL_TERMS: AnyRecord = {
  property_value: 500000,
  upfront_payment: 50000,
  monthly_payment: 0,
  number_of_payments: 0,
  payback_window_start_year: 3,
  payback_window_end_year: 7,
  timing_factor_early: 0.5,
  timing_factor_late: 1.5,
  floor_multiple: 1.0,
  ceiling_multiple: 3.0,
  downside_mode: "HARD_FLOOR",
  contract_maturity_years: 10,
  liquidity_trigger_year: 5,
  minimum_hold_years: 2,
  platform_fee: 0,
  servicing_fee_monthly: 0,
  exit_fee_pct: 0,
};

const DEFAULT_SCENARIO: AnyRecord = {
  annual_appreciation: 0.03,
  closing_cost_pct: 0.06,
  exit_year: 5,
};

export type NormalizedInputs = {
  deal_terms: AnyRecord;
  scenario: AnyRecord;
};

export function normalizeWidgetPayload(payload: unknown): NormalizedInputs {
  if (!isRecord(payload)) {
    return { deal_terms: { ...DEFAULT_DEAL_TERMS }, scenario: { ...DEFAULT_SCENARIO } };
  }

  const p = payload as AnyRecord;

  let rawDealTerms: AnyRecord | null = null;
  let rawScenario: AnyRecord | null = null;

  if (isRecord(p.deal_terms)) {
    rawDealTerms = p.deal_terms as AnyRecord;
  }
  if (isRecord(p.scenario)) {
    rawScenario = p.scenario as AnyRecord;
  }

  if (!rawDealTerms && isRecord(p.inputs)) {
    const inputs = p.inputs as AnyRecord;
    if (isRecord(inputs.deal_terms)) rawDealTerms = inputs.deal_terms as AnyRecord;
    if (isRecord(inputs.scenario)) rawScenario = inputs.scenario as AnyRecord;
  }

  if (!rawDealTerms && isRecord(p.snapshot_json)) {
    const sj = p.snapshot_json as AnyRecord;
    if (isRecord(sj.inputs)) {
      const sjInputs = sj.inputs as AnyRecord;
      if (isRecord(sjInputs.deal_terms)) rawDealTerms = sjInputs.deal_terms as AnyRecord;
      if (isRecord(sjInputs.scenario)) rawScenario = sjInputs.scenario as AnyRecord;
    }
  }

  const dtSrc = rawDealTerms ?? (isRecord(p) ? p : {});
  const scSrc = rawScenario ?? (isRecord(p.assumptions) ? (p.assumptions as AnyRecord) : {});

  const deal_terms: AnyRecord = {
    property_value: pickNum(dtSrc, "property_value", "home_value", "fmv", "homePrice") ?? DEFAULT_DEAL_TERMS.property_value,
    upfront_payment: pickNum(dtSrc, "upfront_payment", "investment_amount", "upfront") ?? DEFAULT_DEAL_TERMS.upfront_payment,
    monthly_payment: pickNum(dtSrc, "monthly_payment", "monthly") ?? DEFAULT_DEAL_TERMS.monthly_payment,
    number_of_payments: pickNum(dtSrc, "number_of_payments", "payments") ?? DEFAULT_DEAL_TERMS.number_of_payments,
    payback_window_start_year: pickNum(dtSrc, "payback_window_start_year") ?? DEFAULT_DEAL_TERMS.payback_window_start_year,
    payback_window_end_year: pickNum(dtSrc, "payback_window_end_year") ?? DEFAULT_DEAL_TERMS.payback_window_end_year,
    timing_factor_early: pickNum(dtSrc, "timing_factor_early") ?? DEFAULT_DEAL_TERMS.timing_factor_early,
    timing_factor_late: pickNum(dtSrc, "timing_factor_late") ?? DEFAULT_DEAL_TERMS.timing_factor_late,
    floor_multiple: pickNum(dtSrc, "floor_multiple") ?? DEFAULT_DEAL_TERMS.floor_multiple,
    ceiling_multiple: pickNum(dtSrc, "ceiling_multiple") ?? DEFAULT_DEAL_TERMS.ceiling_multiple,
    downside_mode: pickStr(dtSrc, "downside_mode") ?? DEFAULT_DEAL_TERMS.downside_mode,
    contract_maturity_years: pickNum(dtSrc, "contract_maturity_years", "term_years") ?? DEFAULT_DEAL_TERMS.contract_maturity_years,
    liquidity_trigger_year: pickNum(dtSrc, "liquidity_trigger_year") ?? DEFAULT_DEAL_TERMS.liquidity_trigger_year,
    minimum_hold_years: pickNum(dtSrc, "minimum_hold_years") ?? DEFAULT_DEAL_TERMS.minimum_hold_years,
    platform_fee: pickNum(dtSrc, "platform_fee") ?? DEFAULT_DEAL_TERMS.platform_fee,
    servicing_fee_monthly: pickNum(dtSrc, "servicing_fee_monthly") ?? DEFAULT_DEAL_TERMS.servicing_fee_monthly,
    exit_fee_pct: pickNum(dtSrc, "exit_fee_pct") ?? DEFAULT_DEAL_TERMS.exit_fee_pct,
  };

  const scenario: AnyRecord = {
    annual_appreciation: pickNum(scSrc, "annual_appreciation", "appreciation", "appreciation_rate") ?? DEFAULT_SCENARIO.annual_appreciation,
    closing_cost_pct: pickNum(scSrc, "closing_cost_pct", "closing_costs_pct") ?? DEFAULT_SCENARIO.closing_cost_pct,
    exit_year: pickNum(scSrc, "exit_year", "exitYear", "hold_years") ?? DEFAULT_SCENARIO.exit_year,
  };

  return { deal_terms, scenario };
}
