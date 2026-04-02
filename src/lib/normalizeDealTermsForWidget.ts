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

    // Lifecycle defaults
    minimum_hold_years: r.minimum_hold_years ?? 2,
    contract_maturity_years: r.contract_maturity_years ?? 30,
    target_exit_year: r.target_exit_year ?? null,
    target_exit_window_start_year: r.target_exit_window_start_year ?? 3,
    target_exit_window_end_year: r.target_exit_window_end_year ?? 7,
    long_stop_year: r.long_stop_year ?? 13,

    // Extension windows
    first_extension_start_year: r.first_extension_start_year ?? null,
    first_extension_end_year: r.first_extension_end_year ?? null,
    first_extension_premium_pct: r.first_extension_premium_pct ?? null,
    second_extension_start_year: r.second_extension_start_year ?? null,
    second_extension_end_year: r.second_extension_end_year ?? null,
    second_extension_premium_pct: r.second_extension_premium_pct ?? null,

    // Partial buyout
    partial_buyout_allowed: r.partial_buyout_allowed ?? false,
    partial_buyout_min_fraction: r.partial_buyout_min_fraction ?? null,
    partial_buyout_increment_fraction: r.partial_buyout_increment_fraction ?? null,

    // Buyer purchase option
    buyer_purchase_option_enabled: r.buyer_purchase_option_enabled ?? false,
    buyer_purchase_notice_days: r.buyer_purchase_notice_days ?? null,
    buyer_purchase_closing_days: r.buyer_purchase_closing_days ?? null,

    // Fee defaults
    setup_fee_pct: r.setup_fee_pct ?? null,
    setup_fee_floor: r.setup_fee_floor ?? null,
    setup_fee_cap: r.setup_fee_cap ?? null,
    servicing_fee_monthly: r.servicing_fee_monthly ?? 0,
    payment_admin_fee: r.payment_admin_fee ?? null,
    exit_admin_fee_amount: r.exit_admin_fee_amount ?? 0,

    // Realtor defaults
    realtor_representation_mode: r.realtor_representation_mode ?? "NONE",
    realtor_commission_pct: r.realtor_commission_pct ?? 0,
  };
}
