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

console.log("\n--- Contract Verification (canonical v10) ---\n");

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

  await test("Contract C: canonical compute adapter returns ok + compute_version", async () => {
    const r = await computeDeal({
      deal_terms: {
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
      },
      scenario: {
        annual_appreciation: 0.03,
        closing_cost_pct: 0.08,
        exit_year: 5,
      },
    } as any);

    assert(
      r.ok === true,
      `computeDeal should succeed, got: ${JSON.stringify(r)}`,
    );
    assert(
      typeof (r as any).result?.compute_version === "string" &&
        (r as any).result.compute_version.length > 0,
      "compute_version must exist on compute result",
    );
  });

  console.log("\n--- Results ---");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) process.exit(1);
})();
