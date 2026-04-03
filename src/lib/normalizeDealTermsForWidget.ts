import { CANONICAL_DEAL_TERM_DEFAULTS } from "@/lib/canonicalDefaults";

type AnyRecord = Record<string, unknown>;

const D = CANONICAL_DEAL_TERM_DEFAULTS;

export function normalizeDealTermsForWidget(raw: AnyRecord): AnyRecord {
  const r = raw as any;

  return {
    ...raw,

    // Core economics
    property_value: r.property_value ?? D.property_value,
    upfront_payment: r.upfront_payment ?? D.upfront_payment,
    monthly_payment: r.monthly_payment ?? D.monthly_payment,
    number_of_payments: r.number_of_payments ?? D.number_of_payments,

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

    // Fees — canonical contract defaults (not zero)
    setup_fee_pct: r.setup_fee_pct ?? D.setup_fee_pct,
    setup_fee_floor: r.setup_fee_floor ?? D.setup_fee_floor,
    setup_fee_cap: r.setup_fee_cap ?? D.setup_fee_cap,
    servicing_fee_monthly: r.servicing_fee_monthly ?? D.servicing_fee_monthly,
    payment_admin_fee: r.payment_admin_fee ?? D.payment_admin_fee,
    exit_admin_fee_amount: r.exit_admin_fee_amount ?? D.exit_admin_fee_amount,

    // Realtor
    realtor_representation_mode: r.realtor_representation_mode ?? D.realtor_representation_mode,
    realtor_commission_pct: r.realtor_commission_pct ?? D.realtor_commission_pct,
  };
}
