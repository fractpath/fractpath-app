import { computeDeal } from "../computeAdapter";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log("  PASS: " + name);
  } catch (err: any) {
    failed++;
    console.log("  FAIL: " + name);
    console.log("        " + (err?.message ?? String(err)));
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

function isObj(v: any): boolean {
  return v !== null && typeof v === "object" && Array.isArray(v) === false;
}

const VALID_INPUTS = {
  deal_terms: {
    property_value: 500000,
    upfront_payment: 50000,

    contract_maturity_years: 10,

    realtor_fee_pct: 0.06,
    maintenance_pct: 0.01,
    property_tax_pct: 0.012,
    insurance_pct: 0.006,
    hoa_monthly: 0,

    initial_mortgage_balance: 0,
    mortgage_rate: 0.06,
    mortgage_term_years: 30,
    mortgage_payment_type: "amortizing",

    investor_share_of_appreciation: 0.35,
    homeowner_share_of_appreciation: 0.65,
    investment_fee_pct: 0,
    exit_fee_pct: 0,
    origination_fee_pct: 0,
  },
  scenario: {
    annual_appreciation: 0.03,
    closing_cost_pct: 0.06,
    exit_year: 5,
  },
};

async function main() {
  console.log("\n--- computeDeal adapter (canonical-only v10.2) ---\n");

  await test("rejects missing deal_terms", async () => {
    const result: any = await computeDeal({});
    assert(result.ok === false, "expected ok=false");
    assert(
      !result.ok && result.code === "BAD_INPUT",
      "expected BAD_INPUT code",
    );
  });

  await test("rejects missing scenario", async () => {
    const result: any = await computeDeal({
      deal_terms: { property_value: 500000 },
    });
    assert(result.ok === false, "expected ok=false");
    assert(
      !result.ok && result.code === "BAD_INPUT",
      "expected BAD_INPUT code",
    );
  });

  await test("computeDeal returns ok + compute_version + results object", async () => {
    const result: any = await computeDeal(VALID_INPUTS);

    assert(result.ok === true, "expected ok=true");
    if (!result.ok) return;

    assert(isObj(result.result), "expected result object");
    assert(
      typeof result.result.compute_version === "string",
      "expected compute_version string",
    );
    assert(
      result.result.compute_version === "10.2.0",
      "expected compute_version 10.2.0",
    );
    assert(isObj(result.result.results), "expected results object");

    // Spot-check canonical KPI presence
    assert(
      typeof result.result.results.invested_capital_total === "number",
      "has invested_capital_total",
    );
    assert(
      typeof result.result.results.isa_settlement === "number",
      "has isa_settlement",
    );
    assert(
      typeof result.result.results.investor_irr_annual === "number",
      "has investor_irr_annual",
    );
  });

  await test("compute is deterministic", async () => {
    const r1: any = await computeDeal(VALID_INPUTS);
    const r2: any = await computeDeal(VALID_INPUTS);
    assert(r1.ok && r2.ok, "both should be ok");
    if (!r1.ok || !r2.ok) return;
    assert(
      JSON.stringify(r1.result) === JSON.stringify(r2.result),
      "results should be identical across calls",
    );
  });

  console.log(
    "\n" +
      passed +
      " passed, " +
      failed +
      " failed out of " +
      (passed + failed) +
      " tests\n",
  );
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
