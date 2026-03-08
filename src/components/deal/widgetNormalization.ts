export type AnyRecord = Record<string, unknown>;

// Local structural types (app repo must not import @fractpath/compute)
export type DealTerms = AnyRecord;
export type DealResults = AnyRecord;

// ---- Widget-compat normalization (stopgap until compute/widget contracts converge) ----

export function normalizeDealTermsForWidget(raw: DealTerms): DealTerms {
  const r = raw as any;
  return {
    ...(raw as any),
    platform_fee: r.platform_fee ?? 0,
    servicing_fee_monthly: r.servicing_fee_monthly ?? 0,
    exit_fee_pct: r.exit_fee_pct ?? 0,
    realtor_representation_mode: r.realtor_representation_mode ?? "NONE",
    realtor_commission_pct: r.realtor_commission_pct ?? 0,
    realtor_commission_payment_mode:
      r.realtor_commission_payment_mode ?? "PER_PAYMENT_EVENT",
  } as any;
}

export function normalizeResultsForWidget(raw: AnyRecord): DealResults {
  const r = raw as any;
  return {
    ...(raw as any),
    isa_settlement: r.isa_settlement ?? 0,
    investor_profit: r.investor_profit ?? 0,
    investor_multiple: r.investor_multiple ?? 0,
    investor_irr_annual: r.investor_irr_annual ?? 0,
    projected_fmv: r.projected_fmv ?? 0,
    timing_factor_applied: r.timing_factor_applied ?? 1,
    realtor_fee_total_projected: r.realtor_fee_total_projected ?? 0,
    realtor_fee_upfront_projected: r.realtor_fee_upfront_projected ?? 0,
    realtor_fee_installments_projected:
      r.realtor_fee_installments_projected ?? 0,
    buyer_realtor_fee_total_projected: r.buyer_realtor_fee_total_projected ?? 0,
    seller_realtor_fee_total_projected:
      r.seller_realtor_fee_total_projected ?? 0,
  } as DealResults;
}
