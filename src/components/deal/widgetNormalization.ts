import { CANONICAL_DEAL_TERM_DEFAULTS } from "@/lib/canonicalDefaults";

export type AnyRecord = Record<string, unknown>;

// Local structural types (app repo must not import @fractpath/compute)
export type DealTerms = AnyRecord;
export type DealResults = AnyRecord;

const D = CANONICAL_DEAL_TERM_DEFAULTS;

/**
 * Stale-zero guard for fee fields that must be positive.
 * Old snapshots may store 0 for fee fields that were not yet seeded.
 * `??` alone does not catch 0 (only null/undefined), so we treat 0 as stale.
 */
function pos(v: unknown, d: number): number {
  return typeof v === "number" && v > 0 ? v : d;
}

// ---- v11 widget-compat normalization ----

export function normalizeDealTermsForWidget(raw: DealTerms): DealTerms {
  const r = raw as any;
  return {
    ...(raw as any),
    // Lifecycle
    minimum_hold_years: r.minimum_hold_years ?? D.minimum_hold_years,
    contract_maturity_years: r.contract_maturity_years ?? D.contract_maturity_years,
    target_exit_year: r.target_exit_year ?? D.target_exit_year,
    target_exit_window_start_year: r.target_exit_window_start_year ?? D.target_exit_window_start_year,
    target_exit_window_end_year: r.target_exit_window_end_year ?? D.target_exit_window_end_year,
    long_stop_year: r.long_stop_year ?? D.long_stop_year,
    // Extension windows
    first_extension_start_year: r.first_extension_start_year ?? D.first_extension_start_year,
    first_extension_end_year: r.first_extension_end_year ?? D.first_extension_end_year,
    first_extension_premium_pct: r.first_extension_premium_pct ?? D.first_extension_premium_pct,
    second_extension_start_year: r.second_extension_start_year ?? D.second_extension_start_year,
    second_extension_end_year: r.second_extension_end_year ?? D.second_extension_end_year,
    second_extension_premium_pct: r.second_extension_premium_pct ?? D.second_extension_premium_pct,
    // Partial buyout
    partial_buyout_allowed: r.partial_buyout_allowed ?? D.partial_buyout_allowed,
    partial_buyout_min_fraction: r.partial_buyout_min_fraction ?? D.partial_buyout_min_fraction,
    partial_buyout_increment_fraction: r.partial_buyout_increment_fraction ?? D.partial_buyout_increment_fraction,
    // Buyer purchase option
    buyer_purchase_option_enabled: r.buyer_purchase_option_enabled ?? D.buyer_purchase_option_enabled,
    buyer_purchase_notice_days: r.buyer_purchase_notice_days ?? D.buyer_purchase_notice_days,
    buyer_purchase_closing_days: r.buyer_purchase_closing_days ?? D.buyer_purchase_closing_days,
    // Fees — use pos() so stale-zero snapshots get the canonical default, not 0.
    setup_fee_pct: pos(r.setup_fee_pct, D.setup_fee_pct),
    setup_fee_floor: r.setup_fee_floor ?? D.setup_fee_floor,
    setup_fee_cap: r.setup_fee_cap ?? D.setup_fee_cap,
    servicing_fee_monthly: pos(r.servicing_fee_monthly, D.servicing_fee_monthly),
    payment_admin_fee: pos(r.payment_admin_fee, D.payment_admin_fee),
    exit_admin_fee_amount: pos(r.exit_admin_fee_amount, D.exit_admin_fee_amount),
    // Realtor
    realtor_representation_mode: r.realtor_representation_mode ?? D.realtor_representation_mode,
    realtor_commission_pct: r.realtor_commission_pct ?? D.realtor_commission_pct,
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
    partial_buyout_amount_25: r.partial_buyout_amount_25 ?? 0,
    partial_buyout_amount_50: r.partial_buyout_amount_50 ?? 0,
    partial_buyout_amount_75: r.partial_buyout_amount_75 ?? 0,
    // Purchase option
    discount_purchase_price: r.discount_purchase_price ?? 0,
    // Window
    current_window: r.current_window ?? null,
    // FractPath revenue
    fractpath_setup_fee_amount: r.fractpath_setup_fee_amount ?? 0,
    fractpath_revenue_to_date: r.fractpath_revenue_to_date ?? 0,
    // Realtor
    realtor_fee_total_projected: r.realtor_fee_total_projected ?? 0,
  } as DealResults;
}
