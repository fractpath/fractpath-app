type AnyRecord = Record<string, any>;

function safeRecord(v: unknown): AnyRecord | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as AnyRecord)
    : null;
}

function safeNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export type DealDisplayModel = {
  propertyValue: number | null;
  upfrontAmount: number | null;
  monthlyPayment: number | null;
  paymentCount: number | null;
  exitYear: number | null;
};

export function extractDealDisplayModel(snapshot: unknown): DealDisplayModel {
  const snap = safeRecord(snapshot);
  const inputs = safeRecord(snap?.inputs);
  const dealTerms = safeRecord(inputs?.deal_terms);
  const scenario = safeRecord(inputs?.scenario);

  return {
    propertyValue:
      safeNumber(dealTerms?.property_value) ??
      safeNumber(dealTerms?.propertyValue) ??
      null,

    upfrontAmount:
      safeNumber(dealTerms?.upfront_payment) ??
      safeNumber(dealTerms?.upfrontPayment) ??
      safeNumber(dealTerms?.initial_payment) ??
      safeNumber(dealTerms?.initialPayment) ??
      safeNumber(dealTerms?.initial_buy_amount) ??
      safeNumber(dealTerms?.initialBuyAmount) ??
      null,

    monthlyPayment:
      safeNumber(dealTerms?.monthly_payment) ??
      safeNumber(dealTerms?.monthlyPayment) ??
      null,

    paymentCount:
      safeNumber(dealTerms?.number_of_payments) ??
      safeNumber(dealTerms?.numberOfPayments) ??
      null,

    exitYear:
      safeNumber(scenario?.exit_year) ?? safeNumber(scenario?.exitYear) ?? null,
  };
}
