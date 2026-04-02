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

// v11 deal term defaults
const DEFAULT_DEAL_TERMS: AnyRecord = {
  property_value: 500000,
  upfront_payment: 50000,
  monthly_payment: 0,
  number_of_payments: 0,
  minimum_hold_years: 2,
  contract_maturity_years: 30,
  target_exit_year: null,
  target_exit_window_start_year: 3,
  target_exit_window_end_year: 7,
  long_stop_year: 13,
  first_extension_start_year: null,
  first_extension_end_year: null,
  first_extension_premium_pct: null,
  second_extension_start_year: null,
  second_extension_end_year: null,
  second_extension_premium_pct: null,
  partial_buyout_allowed: false,
  partial_buyout_min_fraction: null,
  partial_buyout_increment_fraction: null,
  buyer_purchase_option_enabled: false,
  buyer_purchase_notice_days: null,
  buyer_purchase_closing_days: null,
  setup_fee_pct: null,
  setup_fee_floor: null,
  setup_fee_cap: null,
  servicing_fee_monthly: 0,
  payment_admin_fee: null,
  exit_admin_fee_amount: 0,
  realtor_representation_mode: "NONE",
  realtor_commission_pct: 0,
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
    minimum_hold_years: pickNum(dtSrc, "minimum_hold_years") ?? DEFAULT_DEAL_TERMS.minimum_hold_years,
    contract_maturity_years: pickNum(dtSrc, "contract_maturity_years", "term_years") ?? DEFAULT_DEAL_TERMS.contract_maturity_years,
    target_exit_year: pickNum(dtSrc, "target_exit_year") ?? DEFAULT_DEAL_TERMS.target_exit_year,
    target_exit_window_start_year: pickNum(dtSrc, "target_exit_window_start_year") ?? DEFAULT_DEAL_TERMS.target_exit_window_start_year,
    target_exit_window_end_year: pickNum(dtSrc, "target_exit_window_end_year") ?? DEFAULT_DEAL_TERMS.target_exit_window_end_year,
    long_stop_year: pickNum(dtSrc, "long_stop_year") ?? DEFAULT_DEAL_TERMS.long_stop_year,
    first_extension_start_year: pickNum(dtSrc, "first_extension_start_year") ?? DEFAULT_DEAL_TERMS.first_extension_start_year,
    first_extension_end_year: pickNum(dtSrc, "first_extension_end_year") ?? DEFAULT_DEAL_TERMS.first_extension_end_year,
    first_extension_premium_pct: pickNum(dtSrc, "first_extension_premium_pct") ?? DEFAULT_DEAL_TERMS.first_extension_premium_pct,
    second_extension_start_year: pickNum(dtSrc, "second_extension_start_year") ?? DEFAULT_DEAL_TERMS.second_extension_start_year,
    second_extension_end_year: pickNum(dtSrc, "second_extension_end_year") ?? DEFAULT_DEAL_TERMS.second_extension_end_year,
    second_extension_premium_pct: pickNum(dtSrc, "second_extension_premium_pct") ?? DEFAULT_DEAL_TERMS.second_extension_premium_pct,
    partial_buyout_allowed: dtSrc.partial_buyout_allowed ?? DEFAULT_DEAL_TERMS.partial_buyout_allowed,
    partial_buyout_min_fraction: pickNum(dtSrc, "partial_buyout_min_fraction") ?? DEFAULT_DEAL_TERMS.partial_buyout_min_fraction,
    partial_buyout_increment_fraction: pickNum(dtSrc, "partial_buyout_increment_fraction") ?? DEFAULT_DEAL_TERMS.partial_buyout_increment_fraction,
    buyer_purchase_option_enabled: dtSrc.buyer_purchase_option_enabled ?? DEFAULT_DEAL_TERMS.buyer_purchase_option_enabled,
    buyer_purchase_notice_days: pickNum(dtSrc, "buyer_purchase_notice_days") ?? DEFAULT_DEAL_TERMS.buyer_purchase_notice_days,
    buyer_purchase_closing_days: pickNum(dtSrc, "buyer_purchase_closing_days") ?? DEFAULT_DEAL_TERMS.buyer_purchase_closing_days,
    setup_fee_pct: pickNum(dtSrc, "setup_fee_pct") ?? DEFAULT_DEAL_TERMS.setup_fee_pct,
    setup_fee_floor: pickNum(dtSrc, "setup_fee_floor") ?? DEFAULT_DEAL_TERMS.setup_fee_floor,
    setup_fee_cap: pickNum(dtSrc, "setup_fee_cap") ?? DEFAULT_DEAL_TERMS.setup_fee_cap,
    servicing_fee_monthly: pickNum(dtSrc, "servicing_fee_monthly") ?? DEFAULT_DEAL_TERMS.servicing_fee_monthly,
    payment_admin_fee: pickNum(dtSrc, "payment_admin_fee") ?? DEFAULT_DEAL_TERMS.payment_admin_fee,
    exit_admin_fee_amount: pickNum(dtSrc, "exit_admin_fee_amount") ?? DEFAULT_DEAL_TERMS.exit_admin_fee_amount,
    realtor_representation_mode: pickStr(dtSrc, "realtor_representation_mode") ?? DEFAULT_DEAL_TERMS.realtor_representation_mode,
    realtor_commission_pct: pickNum(dtSrc, "realtor_commission_pct") ?? DEFAULT_DEAL_TERMS.realtor_commission_pct,
  };

  const scenario: AnyRecord = {
    annual_appreciation: pickNum(scSrc, "annual_appreciation", "appreciation", "appreciation_rate") ?? DEFAULT_SCENARIO.annual_appreciation,
    closing_cost_pct: pickNum(scSrc, "closing_cost_pct", "closing_costs_pct") ?? DEFAULT_SCENARIO.closing_cost_pct,
    exit_year: pickNum(scSrc, "exit_year", "exitYear", "hold_years") ?? DEFAULT_SCENARIO.exit_year,
  };

  return { deal_terms, scenario };
}
