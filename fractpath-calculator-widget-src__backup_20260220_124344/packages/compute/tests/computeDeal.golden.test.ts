import { describe, expect, test } from "vitest";
import { computeDeal, COMPUTE_VERSION, type DealTerms, type ScenarioAssumptions } from "../src/index.js";

function baseTerms(overrides: Partial<DealTerms> = {}): DealTerms {
  return {
    property_value: 500_000,
    upfront_payment: 50_000,
    monthly_payment: 1_000,
    number_of_payments: 120,

    payback_window_start_year: 3,
    payback_window_end_year: 10,
    timing_factor_early: 1,
    timing_factor_late: 1,

    floor_multiple: 1,
    ceiling_multiple: 2, // keep low so DYF can exceed it in this test
    downside_mode: "HARD_FLOOR",

    contract_maturity_years: 30,
    liquidity_trigger_year: 12,
    minimum_hold_years: 3,

    platform_fee: 2_500,
    servicing_fee_monthly: 15,
    exit_fee_pct: 0.01,

    duration_yield_floor_enabled: false,
    duration_yield_floor_start_year: null,
    duration_yield_floor_min_multiple: null,

    ...overrides,
  };
}

function baseScenario(overrides: Partial<ScenarioAssumptions> = {}): ScenarioAssumptions {
  return {
    annual_appreciation: 0.04,
    closing_cost_pct: 0.06,
    exit_year: 7,
    ...overrides,
  };
}

describe("computeDeal golden contract", () => {
  test("output is JSON-serializable and compute_version is stable", () => {
    const terms = baseTerms();
    const scenario = baseScenario();

    const out = computeDeal(terms, scenario);

    expect(out.compute_version).toBe(COMPUTE_VERSION);
    expect(typeof out.compute_version).toBe("string");
    expect(out.compute_version.length).toBeGreaterThan(0);

    // JSON serializable drift guard
    expect(() => JSON.stringify(out)).not.toThrow();
    const roundTrip = JSON.parse(JSON.stringify(out));
    expect(roundTrip).toBeTruthy();
    expect(roundTrip.compute_version).toBe(COMPUTE_VERSION);
  });

  test("exit_month flooring: payments are counted using floor(exit_year * 12)", () => {
    // exit_year produces a fractional month count: 1.5 years -> 18.0 months (integer) is too easy.
    // Use 1.41 years -> 16.92 months -> floor = 16 payments max.
    const terms = baseTerms({
      upfront_payment: 10_000,
      monthly_payment: 1_000,
      number_of_payments: 120,
      // Make sure settlement doesn't obscure invested_capital_total via rounding:
      floor_multiple: 0,
      ceiling_multiple: 100,
      downside_mode: "NO_FLOOR",
      duration_yield_floor_enabled: false,
      duration_yield_floor_start_year: null,
      duration_yield_floor_min_multiple: null,
    });

    const scenario = baseScenario({
      annual_appreciation: 0.0,
      exit_year: 1.41,
    });

    const out = computeDeal(terms, scenario);

    const expectedExitMonth = Math.floor(scenario.exit_year * 12); // 16
    const expectedPaymentsMade = Math.min(terms.number_of_payments, expectedExitMonth);
    const expectedIBA = terms.upfront_payment + terms.monthly_payment * expectedPaymentsMade;

    expect(expectedExitMonth).toBe(16);
    expect(out.invested_capital_total).toBe(expectedIBA);
  });

  test("DYF can override ceiling: settlement may exceed ceiling_amount when DYF applies", () => {
    const terms = baseTerms({
      // Make ceiling low and DYF floor high enough to exceed it.
      upfront_payment: 100_000,
      monthly_payment: 0,
      number_of_payments: 0,

      floor_multiple: 0,
      ceiling_multiple: 1.2, // ceiling = 120k

      downside_mode: "NO_FLOOR",

      duration_yield_floor_enabled: true,
      duration_yield_floor_start_year: 10,
      duration_yield_floor_min_multiple: 2.0, // DYF floor = 200k (> 120k)
    });

    const scenario = baseScenario({
      annual_appreciation: 0.0,
      exit_year: 30, // long hold, triggers DYF
    });

    const out = computeDeal(terms, scenario);

    expect(out.ceiling_amount).toBe(120_000);
    expect(out.dyf_floor_amount).toBe(200_000);

    // DYF should apply and lift settlement above the standard ceiling cap
    expect(out.dyf_applied).toBe(true);
    expect(out.isa_settlement).toBe(out.dyf_floor_amount);
    expect(out.isa_settlement).toBeGreaterThan(out.ceiling_amount);
  });
});
