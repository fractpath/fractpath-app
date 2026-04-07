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

// v11 deal_terms shape — no v10 fields (floor_multiple, timing_factor_*, exit_fee_pct, etc.)
const VALID_INPUTS = {
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
    closing_cost_pct: 0.06,
    exit_year: 5,
  },
};

async function main() {
  console.log("\n--- computeDeal adapter contract tests (v11 boundary) ---\n");

  await test("rejects missing deal_terms", async () => {
    const result: any = await computeDeal({});
    assert(result.ok === false, "expected ok=false");
    assert(!result.ok && result.code === "BAD_INPUT", "expected BAD_INPUT code");
  });

  await test("rejects missing scenario", async () => {
    const result: any = await computeDeal({
      deal_terms: { property_value: 500000 },
    });
    assert(result.ok === false, "expected ok=false");
    assert(!result.ok && result.code === "BAD_INPUT", "expected BAD_INPUT code");
  });

  await test("computeDeal returns ok + non-empty compute_version string", async () => {
    const result: any = await computeDeal(VALID_INPUTS);
    assert(result.ok === true, "expected ok=true");
    if (!result.ok) return;
    assert(isObj(result.result), "expected result object");
    assert(
      typeof result.result.compute_version === "string" &&
        result.result.compute_version.length > 0,
      "expected non-empty compute_version string",
    );
    assert(isObj(result.result.results), "expected results object");
  });

  await test("results contain v11 buyout / valuation fields as finite numbers", async () => {
    const result: any = await computeDeal(VALID_INPUTS);
    assert(result.ok === true, "expected ok=true");
    if (!result.ok) return;
    const r = result.result.results;

    assert(
      typeof r.current_contract_value === "number" && Number.isFinite(r.current_contract_value),
      `current_contract_value must be finite, got ${r.current_contract_value}`,
    );
    assert(
      typeof r.current_participation_value === "number" && Number.isFinite(r.current_participation_value),
      `current_participation_value must be finite, got ${r.current_participation_value}`,
    );
    assert(
      typeof r.extension_adjusted_buyout_amount === "number" && Number.isFinite(r.extension_adjusted_buyout_amount),
      `extension_adjusted_buyout_amount must be finite, got ${r.extension_adjusted_buyout_amount}`,
    );
    assert(
      typeof r.funding_completion_factor === "number" && Number.isFinite(r.funding_completion_factor),
      `funding_completion_factor must be finite, got ${r.funding_completion_factor}`,
    );
  });

  await test("results contain v11 funding fields as finite numbers", async () => {
    const result: any = await computeDeal(VALID_INPUTS);
    assert(result.ok === true, "expected ok=true");
    if (!result.ok) return;
    const r = result.result.results;

    assert(
      typeof r.total_scheduled_buyer_funding === "number" && Number.isFinite(r.total_scheduled_buyer_funding),
      `total_scheduled_buyer_funding must be finite`,
    );
    assert(
      typeof r.base_buyout_amount === "number" && Number.isFinite(r.base_buyout_amount),
      `base_buyout_amount must be finite`,
    );
    // partial_buyout_amount_50 is only computed when partial_buyout_allowed=true;
    // VALID_INPUTS uses the default (false) so we do not assert it here.
  });

  await test("results do NOT contain old v10 field names", async () => {
    const result: any = await computeDeal(VALID_INPUTS);
    assert(result.ok === true, "expected ok=true");
    if (!result.ok) return;
    const r = result.result.results;

    assert(!("isa_settlement" in r), "isa_settlement must not appear in v11 results");
    assert(!("investor_profit" in r), "investor_profit must not appear in v11 results");
    assert(!("investor_irr_annual" in r), "investor_irr_annual must not appear in v11 results");
    assert(!("floor_amount" in r), "floor_amount must not appear in v11 results");
    assert(!("ceiling_amount" in r), "ceiling_amount must not appear in v11 results");
    assert(!("timing_factor_applied" in r), "timing_factor_applied must not appear in v11 results");
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
    "\n" + passed + " passed, " + failed + " failed out of " + (passed + failed) + " tests\n",
  );
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
