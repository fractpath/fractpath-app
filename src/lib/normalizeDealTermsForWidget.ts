type AnyRecord = Record<string, unknown>;

export function normalizeDealTermsForWidget(raw: AnyRecord): AnyRecord {
  const r = raw as any;

  return {
    ...raw,

    // Core economics defaults
    property_value: r.property_value ?? 600000,
    upfront_payment: r.upfront_payment ?? 100000,
    monthly_payment: r.monthly_payment ?? 0,
    number_of_payments: r.number_of_payments ?? 0,

    // Timing / settlement defaults
    payback_window_start_year: r.payback_window_start_year ?? 3,
    payback_window_end_year: r.payback_window_end_year ?? 7,
    timing_factor_early: r.timing_factor_early ?? 1,
    timing_factor_late: r.timing_factor_late ?? 1,

    // Protection defaults
    floor_multiple: r.floor_multiple ?? 1.1,
    ceiling_multiple: r.ceiling_multiple ?? 2.0,
    downside_mode: r.downside_mode ?? "HARD_FLOOR",

    // Lifecycle defaults
    contract_maturity_years: r.contract_maturity_years ?? 30,
    liquidity_trigger_year: r.liquidity_trigger_year ?? 13,
    minimum_hold_years: r.minimum_hold_years ?? 2,

    // Duration yield floor defaults
    duration_yield_floor_enabled: r.duration_yield_floor_enabled ?? false,
    duration_yield_floor_start_year:
      r.duration_yield_floor_start_year ?? null,
    duration_yield_floor_min_multiple:
      r.duration_yield_floor_min_multiple ?? null,

    // Fee defaults
    platform_fee: r.platform_fee ?? 2500,
    servicing_fee_monthly: r.servicing_fee_monthly ?? 20,
    exit_fee_pct: r.exit_fee_pct ?? 0.01,

    // Realtor defaults
    realtor_representation_mode: r.realtor_representation_mode ?? "NONE",
    realtor_commission_pct: r.realtor_commission_pct ?? 0,
    realtor_commission_payment_mode:
      r.realtor_commission_payment_mode ?? "PER_PAYMENT_EVENT",
  };
}