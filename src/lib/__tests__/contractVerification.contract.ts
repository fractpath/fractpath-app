import { computeDeal } from "../computeAdapter";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log("  PASS: " + name);
  } catch (err: any) {
    failed++;
    console.log("  FAIL: " + name);
    console.log("        " + (err.message ?? String(err)));
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

console.log("\n--- Contract Verification (v11 boundary) ---\n");

(async () => {
  const fs = require("fs");

  await test("Contract A: no stale src/api/ directory exists", () => {
    assert(!fs.existsSync("src/api"), "src/api/ should not exist");
  });

  await test("Contract B: compute endpoint exists at App Router path", () => {
    assert(
      fs.existsSync("src/app/api/deals/[dealId]/snapshot/compute/route.ts"),
      "compute route must exist",
    );
  });

  await test("Contract D: homepage submit endpoint exists at App Router path", () => {
    assert(
      fs.existsSync("src/app/api/submit/route.ts"),
      "submit route must exist",
    );
  });

  // v11 deal_terms fixture — no v10 fields (floor_multiple, timing_factor_*, exit_fee_pct, etc.)
  await test("Contract C: canonical compute adapter returns ok + v11 results", async () => {
    const r = await computeDeal({
      deal_terms: {
        property_value: 500000,
        upfront_payment: 50000,
        monthly_payment: 0,
        number_of_payments: 0,

        minimum_hold_years: 2,
        contract_maturity_years: 30,
        target_exit_year: null,
        target_exit_window_start_year: 3,
        target_exit_window_end_year: 7,
        long_stop_year: 13,

        first_extension_start_year: null,
        first_extension_end_year: null,
        first_extension_premium_pct: null,
        second_extension_start_year: null,
        second_extension_end_year: null,
        second_extension_premium_pct: null,

        partial_buyout_allowed: false,
        partial_buyout_min_fraction: null,
        partial_buyout_increment_fraction: null,

        buyer_purchase_option_enabled: false,
        buyer_purchase_notice_days: null,
        buyer_purchase_closing_days: null,

        setup_fee_pct: null,
        setup_fee_floor: null,
        setup_fee_cap: null,
        servicing_fee_monthly: 0,
        payment_admin_fee: null,
        exit_admin_fee_amount: 0,

        realtor_representation_mode: "NONE",
        realtor_commission_pct: 0,
      },
      scenario: {
        annual_appreciation: 0.03,
        closing_cost_pct: 0.08,
        exit_year: 5,
      },
    });

    assert(
      r.ok === true,
      `computeDeal should succeed, got: ${JSON.stringify(r)}`,
    );
    if (!r.ok) return;

    assert(
      typeof r.result.compute_version === "string" && r.result.compute_version.length > 0,
      "compute_version must be a non-empty string",
    );

    const results = r.result.results as any;

    assert(
      typeof results.current_contract_value === "number" && Number.isFinite(results.current_contract_value),
      "current_contract_value must be a finite number",
    );
    assert(
      typeof results.extension_adjusted_buyout_amount === "number" && Number.isFinite(results.extension_adjusted_buyout_amount),
      "extension_adjusted_buyout_amount must be a finite number",
    );
    assert(
      typeof results.total_scheduled_buyer_funding === "number" && Number.isFinite(results.total_scheduled_buyer_funding),
      "total_scheduled_buyer_funding must be a finite number",
    );
    assert(
      typeof results.funding_completion_factor === "number" && Number.isFinite(results.funding_completion_factor),
      "funding_completion_factor must be a finite number",
    );
  });

  console.log("\n--- Results ---");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) process.exit(1);
})();
