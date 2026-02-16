export function getDefaultScenario(): Record<string, unknown> {
  return {
    annual_appreciation: 0.03,
    closing_cost_pct: 0.06,
    exit_year: 5,
  };
}

export function getDefaultDealTerms(): Record<string, unknown> {
  return {
    property_value: 500000,
    upfront_payment: 50000,
    monthly_payment: 500,
    number_of_payments: 120,
    payback_window_start_year: 3,
    payback_window_end_year: 7,
    timing_factor_early: 0.5,
    timing_factor_late: 1.5,
    floor_multiple: 1.0,
    ceiling_multiple: 3.0,
    downside_mode: "HARD_FLOOR",
    contract_maturity_years: 10,
    liquidity_trigger_year: 5,
    minimum_hold_years: 2,
    platform_fee: 0,
    servicing_fee_monthly: 0,
    exit_fee_pct: 0,
  };
}

export function ensureScenario(inputs: any): any {
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) {
    return { deal_terms: getDefaultDealTerms(), scenario: getDefaultScenario() };
  }

  const result = { ...inputs };

  if (!result.scenario || typeof result.scenario !== "object" || Array.isArray(result.scenario)) {
    result.scenario = getDefaultScenario();
  }

  if (!result.deal_terms || typeof result.deal_terms !== "object" || Array.isArray(result.deal_terms)) {
    result.deal_terms = getDefaultDealTerms();
  }

  return result;
}
