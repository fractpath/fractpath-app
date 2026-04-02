export type AnyRecord = Record<string, unknown>;

// Local structural types (app repo must not import @fractpath/compute)
export type DealTerms = AnyRecord;
export type DealResults = AnyRecord;

// ---- v11 widget-compat normalization ----

export function normalizeDealTermsForWidget(raw: DealTerms): DealTerms {
  const r = raw as any;
  return {
    ...(raw as any),
    // Lifecycle
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
    // Fees
    setup_fee_pct: r.setup_fee_pct ?? null,
    setup_fee_floor: r.setup_fee_floor ?? null,
    setup_fee_cap: r.setup_fee_cap ?? null,
    servicing_fee_monthly: r.servicing_fee_monthly ?? 0,
    payment_admin_fee: r.payment_admin_fee ?? null,
    exit_admin_fee_amount: r.exit_admin_fee_amount ?? 0,
    // Realtor
    realtor_representation_mode: r.realtor_representation_mode ?? "NONE",
    realtor_commission_pct: r.realtor_commission_pct ?? 0,
  } as any;
}

export function normalizeResultsForWidget(raw: AnyRecord): DealResults {
  const r = raw as any;
  return {
    ...(raw as any),
    // Funding
    total_scheduled_buyer_funding: r.total_scheduled_buyer_funding ?? 0,
    actual_buyer_funding_to_date: r.actual_buyer_funding_to_date ?? 0,
    funding_completion_factor: r.funding_completion_factor ?? 0,
    // Appreciation share
    scheduled_buyer_appreciation_share: r.scheduled_buyer_appreciation_share ?? 0,
    effective_buyer_appreciation_share: r.effective_buyer_appreciation_share ?? 0,
    buyer_base_capital_component: r.buyer_base_capital_component ?? 0,
    buyer_appreciation_claim: r.buyer_appreciation_claim ?? 0,
    // Valuation
    current_contract_value: r.current_contract_value ?? 0,
    current_participation_value: r.current_participation_value ?? 0,
    base_buyout_amount: r.base_buyout_amount ?? 0,
    extension_adjusted_buyout_amount: r.extension_adjusted_buyout_amount ?? 0,
    // Partial buyout tiers
    partial_buyout_amount_25: r.partial_buyout_amount_25 ?? null,
    partial_buyout_amount_50: r.partial_buyout_amount_50 ?? null,
    partial_buyout_amount_75: r.partial_buyout_amount_75 ?? null,
    // Purchase option
    discount_purchase_price: r.discount_purchase_price ?? null,
    // Window
    current_window: r.current_window ?? null,
    // FractPath revenue
    fractpath_setup_fee_amount: r.fractpath_setup_fee_amount ?? 0,
    fractpath_revenue_to_date: r.fractpath_revenue_to_date ?? 0,
    // Realtor
    realtor_fee_total_projected: r.realtor_fee_total_projected ?? 0,
  } as DealResults;
}
