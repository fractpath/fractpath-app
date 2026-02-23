type AnyRecord = Record<string, unknown>;

export function normalizeDealTermsForWidget(raw: AnyRecord): AnyRecord {
  const r = raw as any;

  return {
    ...raw,

    // System defaults (only applied if missing)
    platform_fee: r.platform_fee ?? 2500,
    servicing_fee_monthly: r.servicing_fee_monthly ?? 20,
    exit_fee_pct: r.exit_fee_pct ?? 0.01,

    // Realtor defaults (no realtor by default)
    realtor_representation_mode: r.realtor_representation_mode ?? "NONE",
    realtor_commission_pct: r.realtor_commission_pct ?? 0,
    realtor_commission_payment_mode: r.realtor_commission_payment_mode ?? "UPFRONT",
  };
}
