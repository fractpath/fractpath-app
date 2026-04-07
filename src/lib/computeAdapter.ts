import {
  CANONICAL_DEAL_TERM_DEFAULTS,
  CANONICAL_SCENARIO_DEFAULTS,
} from "@/lib/canonicalDefaults";

type Ok<T> = { ok: true; result: T };
type Err = {
  ok: false;
  code: "BAD_INPUT" | "NOT_INTEGRATED" | "ERROR";
  error: string;
};

export type CanonicalComputeOk = {
  compute_version: string;
  results: Record<string, unknown>;
};

function isObj(v: any): boolean {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function num(v: any): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const COMPUTE_VERSION = "11.0.0";

// Internal engine-compat defaults retained for canonical callers.
// These are merged with caller-supplied v11 terms before compute.
const ENGINE_COMPAT_DEFAULTS: Record<string, unknown> = {
  monthly_payment: CANONICAL_DEAL_TERM_DEFAULTS.monthly_payment,
  number_of_payments: CANONICAL_DEAL_TERM_DEFAULTS.number_of_payments,

  minimum_hold_years: CANONICAL_DEAL_TERM_DEFAULTS.minimum_hold_years,
  contract_maturity_years: CANONICAL_DEAL_TERM_DEFAULTS.contract_maturity_years,

  target_exit_year: CANONICAL_DEAL_TERM_DEFAULTS.target_exit_year,
  target_exit_window_start_year:
    CANONICAL_DEAL_TERM_DEFAULTS.target_exit_window_start_year,
  target_exit_window_end_year:
    CANONICAL_DEAL_TERM_DEFAULTS.target_exit_window_end_year,
  long_stop_year: CANONICAL_DEAL_TERM_DEFAULTS.long_stop_year,

  first_extension_start_year:
    CANONICAL_DEAL_TERM_DEFAULTS.first_extension_start_year,
  first_extension_end_year:
    CANONICAL_DEAL_TERM_DEFAULTS.first_extension_end_year,
  first_extension_premium_pct:
    CANONICAL_DEAL_TERM_DEFAULTS.first_extension_premium_pct,

  second_extension_start_year:
    CANONICAL_DEAL_TERM_DEFAULTS.second_extension_start_year,
  second_extension_end_year:
    CANONICAL_DEAL_TERM_DEFAULTS.second_extension_end_year,
  second_extension_premium_pct:
    CANONICAL_DEAL_TERM_DEFAULTS.second_extension_premium_pct,

  partial_buyout_allowed: CANONICAL_DEAL_TERM_DEFAULTS.partial_buyout_allowed,
  partial_buyout_min_fraction:
    CANONICAL_DEAL_TERM_DEFAULTS.partial_buyout_min_fraction,
  partial_buyout_increment_fraction:
    CANONICAL_DEAL_TERM_DEFAULTS.partial_buyout_increment_fraction,

  buyer_purchase_option_enabled:
    CANONICAL_DEAL_TERM_DEFAULTS.buyer_purchase_option_enabled,
  buyer_purchase_notice_days:
    CANONICAL_DEAL_TERM_DEFAULTS.buyer_purchase_notice_days,
  buyer_purchase_closing_days:
    CANONICAL_DEAL_TERM_DEFAULTS.buyer_purchase_closing_days,

  setup_fee_pct: CANONICAL_DEAL_TERM_DEFAULTS.setup_fee_pct,
  setup_fee_floor: CANONICAL_DEAL_TERM_DEFAULTS.setup_fee_floor,
  setup_fee_cap: CANONICAL_DEAL_TERM_DEFAULTS.setup_fee_cap,
  servicing_fee_monthly: CANONICAL_DEAL_TERM_DEFAULTS.servicing_fee_monthly,
  payment_admin_fee: CANONICAL_DEAL_TERM_DEFAULTS.payment_admin_fee,
  exit_admin_fee_amount: CANONICAL_DEAL_TERM_DEFAULTS.exit_admin_fee_amount,

  realtor_representation_mode:
    CANONICAL_DEAL_TERM_DEFAULTS.realtor_representation_mode,
  realtor_commission_pct: CANONICAL_DEAL_TERM_DEFAULTS.realtor_commission_pct,
};

const SCENARIO_DEFAULTS: Record<string, unknown> = {
  annual_appreciation: CANONICAL_SCENARIO_DEFAULTS.annual_appreciation,
  closing_cost_pct: CANONICAL_SCENARIO_DEFAULTS.closing_cost_pct,
  exit_year: CANONICAL_SCENARIO_DEFAULTS.exit_year,
};

function currentWindow(terms: Record<string, any>, exitYear: number): string {
  if (exitYear < Number(terms.target_exit_window_start_year))
    return "pre_target";
  if (exitYear <= Number(terms.target_exit_window_end_year))
    return "target_exit";
  if (
    exitYear >= Number(terms.first_extension_start_year) &&
    exitYear <= Number(terms.first_extension_end_year)
  ) {
    return "first_extension";
  }
  if (
    exitYear >= Number(terms.second_extension_start_year) &&
    exitYear <= Number(terms.second_extension_end_year)
  ) {
    return "second_extension";
  }
  if (exitYear > Number(terms.long_stop_year)) return "post_long_stop";
  return "post_long_stop";
}

function extensionAdjustedBuyoutAmount(
  baseBuyoutAmount: number,
  window: string,
  terms: Record<string, any>,
): number {
  switch (window) {
    case "pre_target":
    case "target_exit":
      return roundMoney(baseBuyoutAmount);
    case "first_extension":
      return roundMoney(
        baseBuyoutAmount * (1 + Number(terms.first_extension_premium_pct ?? 0)),
      );
    case "second_extension":
    case "post_long_stop":
      return roundMoney(
        baseBuyoutAmount *
          (1 + Number(terms.second_extension_premium_pct ?? 0)),
      );
    default:
      return roundMoney(baseBuyoutAmount);
  }
}

function isValidPartialFraction(
  fraction: number,
  minFraction: number,
  incrementFraction: number,
): boolean {
  if (fraction < minFraction || incrementFraction <= 0) return false;
  const quotient = fraction / incrementFraction;
  return Math.abs(quotient - Math.round(quotient)) < 1e-9;
}

function partialBuyoutAmounts(
  terms: Record<string, any>,
  extensionAdjustedBuyout: number,
): { 25: number | null; 50: number | null; 75: number | null } {
  if (!terms.partial_buyout_allowed) {
    return { 25: null, 50: null, 75: null };
  }

  const out: { 25: number | null; 50: number | null; 75: number | null } = {
    25: null,
    50: null,
    75: null,
  };

  const minFraction = Number(terms.partial_buyout_min_fraction ?? 0);
  const incrementFraction = Number(
    terms.partial_buyout_increment_fraction ?? 0,
  );

  for (const pct of [25, 50, 75] as const) {
    const fraction = pct / 100;
    if (isValidPartialFraction(fraction, minFraction, incrementFraction)) {
      out[pct] = roundMoney(extensionAdjustedBuyout * fraction);
    }
  }

  return out;
}

function projectedRealtorFee(
  terms: Record<string, any>,
  paymentsToDate: number,
): number {
  if (
    terms.realtor_representation_mode === "NONE" ||
    Number(terms.realtor_commission_pct ?? 0) === 0
  ) {
    return 0;
  }

  return roundMoney(
    (Number(terms.upfront_payment) +
      Number(terms.monthly_payment) * paymentsToDate) *
      Number(terms.realtor_commission_pct),
  );
}

function canonicalComputeDeal(
  terms: Record<string, any>,
  scenario: Record<string, any>,
): Record<string, unknown> {
  const exitYear = Number(scenario.exit_year);
  const totalMonths = Math.floor(exitYear * 12);
  const paymentsToDate = Math.min(
    Number(terms.number_of_payments),
    totalMonths,
  );

  const totalScheduledBuyerFunding = roundMoney(
    Number(terms.upfront_payment) +
      Number(terms.monthly_payment) * Number(terms.number_of_payments),
  );
  const actualBuyerFundingToDate = roundMoney(
    Number(terms.upfront_payment) +
      Number(terms.monthly_payment) * paymentsToDate,
  );

  const fundingCompletionFactor =
    totalScheduledBuyerFunding > 0
      ? actualBuyerFundingToDate / totalScheduledBuyerFunding
      : 0;

  const scheduledBuyerAppreciationShare =
    Number(terms.property_value) > 0
      ? totalScheduledBuyerFunding / Number(terms.property_value)
      : 0;

  const effectiveBuyerAppreciationShare =
    scheduledBuyerAppreciationShare * fundingCompletionFactor;

  const currentContractValue = roundMoney(
    scenario.fmv_override !== undefined &&
      scenario.fmv_override !== null &&
      Number(scenario.fmv_override) > 0
      ? Number(scenario.fmv_override)
      : Number(terms.property_value) *
          Math.pow(1 + Number(scenario.annual_appreciation), exitYear),
  );

  const buyerBaseCapitalComponent = actualBuyerFundingToDate;
  const grossAppreciation = Math.max(
    0,
    currentContractValue - Number(terms.property_value),
  );
  const buyerAppreciationClaim = roundMoney(
    grossAppreciation * effectiveBuyerAppreciationShare,
  );
  const currentParticipationValue = roundMoney(
    buyerBaseCapitalComponent + buyerAppreciationClaim,
  );

  const fractpathSetupFeeAmount = roundMoney(
    Math.min(
      Math.max(
        totalScheduledBuyerFunding * Number(terms.setup_fee_pct),
        Number(terms.setup_fee_floor),
      ),
      Number(terms.setup_fee_cap),
    ),
  );

  const fractpathRevenueToDate = roundMoney(
    fractpathSetupFeeAmount +
      Number(terms.servicing_fee_monthly) * totalMonths +
      Number(terms.payment_admin_fee) * paymentsToDate +
      Number(terms.exit_admin_fee_amount),
  );

  const baseBuyoutAmount = roundMoney(
    currentParticipationValue + Number(terms.exit_admin_fee_amount),
  );

  const window = currentWindow(terms, exitYear);
  const extensionAdjustedBuyout = extensionAdjustedBuyoutAmount(
    baseBuyoutAmount,
    window,
    terms,
  );
  const partials = partialBuyoutAmounts(terms, extensionAdjustedBuyout);

  const discountPurchasePrice = terms.buyer_purchase_option_enabled
    ? roundMoney(currentContractValue - currentParticipationValue)
    : null;

  return {
    total_scheduled_buyer_funding: totalScheduledBuyerFunding,
    actual_buyer_funding_to_date: actualBuyerFundingToDate,
    funding_completion_factor: fundingCompletionFactor,
    scheduled_buyer_appreciation_share: scheduledBuyerAppreciationShare,
    effective_buyer_appreciation_share: effectiveBuyerAppreciationShare,
    buyer_base_capital_component: buyerBaseCapitalComponent,
    buyer_appreciation_claim: buyerAppreciationClaim,
    current_contract_value: currentContractValue,
    current_participation_value: currentParticipationValue,
    base_buyout_amount: baseBuyoutAmount,
    extension_adjusted_buyout_amount: extensionAdjustedBuyout,
    partial_buyout_amount_25: partials[25],
    partial_buyout_amount_50: partials[50],
    partial_buyout_amount_75: partials[75],
    discount_purchase_price: discountPurchasePrice,
    current_window: window,
    fractpath_setup_fee_amount: fractpathSetupFeeAmount,
    fractpath_revenue_to_date: fractpathRevenueToDate,
    realtor_fee_total_projected: projectedRealtorFee(terms, paymentsToDate),
    compute_version: COMPUTE_VERSION,
  };
}

export async function computeDeal(
  inputs: any,
): Promise<Ok<CanonicalComputeOk> | Err> {
  if (!isObj(inputs)) {
    return { ok: false, code: "BAD_INPUT", error: "inputs must be an object" };
  }
  if (!isObj(inputs.deal_terms)) {
    return { ok: false, code: "BAD_INPUT", error: "deal_terms is required" };
  }
  if (!isObj(inputs.scenario)) {
    return { ok: false, code: "BAD_INPUT", error: "scenario is required" };
  }

  const property_value = num(inputs.deal_terms.property_value);
  const upfront_payment = num(inputs.deal_terms.upfront_payment);
  const exit_year = num(
    inputs.scenario.exit_year ?? SCENARIO_DEFAULTS.exit_year,
  );

  if (property_value === null) {
    return {
      ok: false,
      code: "BAD_INPUT",
      error: "deal_terms.property_value is required",
    };
  }
  if (upfront_payment === null) {
    return {
      ok: false,
      code: "BAD_INPUT",
      error: "deal_terms.upfront_payment is required",
    };
  }
  if (exit_year === null) {
    return {
      ok: false,
      code: "BAD_INPUT",
      error: "scenario.exit_year is required",
    };
  }

  const terms: Record<string, unknown> = {
    ...ENGINE_COMPAT_DEFAULTS,
    ...inputs.deal_terms,
  };

  const scenario: Record<string, unknown> = {
    ...SCENARIO_DEFAULTS,
    ...inputs.scenario,
  };

  let engineOutput: any;
  try {
    engineOutput = canonicalComputeDeal(terms as any, scenario as any);
  } catch (e: any) {
    return { ok: false, code: "ERROR", error: e?.message ?? String(e) };
  }

  const computeVersion: string =
    typeof engineOutput.compute_version === "string"
      ? engineOutput.compute_version
      : COMPUTE_VERSION;

  return {
    ok: true,
    result: {
      compute_version: computeVersion,
      results: {
        ...(isObj(engineOutput) ? engineOutput : {}),
        compute_version: computeVersion,
      },
    },
  };
}

export const computeDealAdapter = computeDeal;
