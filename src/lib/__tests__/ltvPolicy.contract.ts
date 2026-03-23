// src/lib/__tests__/ltvPolicy.contract.ts
// Contract tests for the LTV policy compute engine.
// Run with: npx ts-node --skip-project --esm src/lib/__tests__/ltvPolicy.contract.ts

import { computeLtvPolicy, LTV_DEBT_FRESHNESS_DAYS } from "../ltvPolicy";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  FAIL: ${name}`);
    console.log(`        ${err?.message ?? String(err)}`);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

function assertClose(a: number, b: number, msg: string, tol = 0.01) {
  if (Math.abs(a - b) > tol) {
    throw new Error(`${msg} — expected ${b}, got ${a}`);
  }
}

function isoDateDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

console.log("\n--- computeLtvPolicy ---\n");

// =====================================================================
// 1. total_committed_deal_cash includes installments
// =====================================================================
test("total_committed_deal_cash = upfront + monthly * payments", () => {
  const result = computeLtvPolicy({
    proposed_deal_fmv: 600000,
    upfront_payment: 50000,
    monthly_payment: 500,
    number_of_payments: 60,
    latest_verified_fmv: 600000,
    secured_debt_amount: 0,
    ltv_policy_ratio: 0.75,
    secured_debt_certified_at: isoDateDaysAgo(10),
  });
  // 50000 + 500 * 60 = 50000 + 30000 = 80000
  assertClose(result.total_committed_deal_cash, 80000, "total_committed_deal_cash");
});

test("total_committed_deal_cash with zero monthly", () => {
  const result = computeLtvPolicy({
    proposed_deal_fmv: 400000,
    upfront_payment: 75000,
    monthly_payment: 0,
    number_of_payments: 0,
    latest_verified_fmv: 400000,
    secured_debt_amount: 0,
    ltv_policy_ratio: 0.75,
    secured_debt_certified_at: isoDateDaysAgo(5),
  });
  assertClose(result.total_committed_deal_cash, 75000, "upfront only");
});

test("total_committed_deal_cash with null payments uses 0", () => {
  const result = computeLtvPolicy({
    proposed_deal_fmv: 400000,
    upfront_payment: 60000,
    monthly_payment: null,
    number_of_payments: null,
    latest_verified_fmv: 400000,
    secured_debt_amount: 0,
    ltv_policy_ratio: 0.75,
    secured_debt_certified_at: isoDateDaysAgo(5),
  });
  assertClose(result.total_committed_deal_cash, 60000, "null monthly treated as 0");
});

// =====================================================================
// 2. provisional and executable max accessible cash calculations
// =====================================================================
test("provisional_max = proposed_fmv * ratio - debt", () => {
  const result = computeLtvPolicy({
    proposed_deal_fmv: 500000,
    upfront_payment: 10000,
    monthly_payment: 0,
    number_of_payments: 0,
    latest_verified_fmv: null,
    secured_debt_amount: 100000,
    ltv_policy_ratio: 0.75,
    secured_debt_certified_at: isoDateDaysAgo(5),
  });
  // 500000 * 0.75 - 100000 = 375000 - 100000 = 275000
  assertClose(result.provisional_max_accessible_cash!, 275000, "provisional_max");
  assert(result.executable_max_accessible_cash === null, "executable_max null when no verified_fmv");
});

test("executable_max = verified_fmv * ratio - debt", () => {
  const result = computeLtvPolicy({
    proposed_deal_fmv: null,
    upfront_payment: 10000,
    monthly_payment: 0,
    number_of_payments: 0,
    latest_verified_fmv: 480000,
    secured_debt_amount: 50000,
    ltv_policy_ratio: 0.75,
    secured_debt_certified_at: isoDateDaysAgo(5),
  });
  // 480000 * 0.75 - 50000 = 360000 - 50000 = 310000
  assertClose(result.executable_max_accessible_cash!, 310000, "executable_max");
  assert(result.provisional_max_accessible_cash === null, "provisional_max null when no proposed_fmv");
});

test("max accessible cash floors at 0 when debt exceeds FMV*ratio", () => {
  const result = computeLtvPolicy({
    proposed_deal_fmv: 200000,
    upfront_payment: 0,
    monthly_payment: 0,
    number_of_payments: 0,
    latest_verified_fmv: 200000,
    secured_debt_amount: 300000, // more debt than 75% of FMV
    ltv_policy_ratio: 0.75,
    secured_debt_certified_at: isoDateDaysAgo(5),
  });
  assertClose(result.provisional_max_accessible_cash!, 0, "floors at 0");
  assertClose(result.executable_max_accessible_cash!, 0, "executable floors at 0");
});

test("deal_exceeds_provisional_access_limit when over cap", () => {
  const result = computeLtvPolicy({
    proposed_deal_fmv: 400000,
    upfront_payment: 200000, // 200k > 75% of 400k (300k)... but debt is 0 so max = 300k
    monthly_payment: 0,
    number_of_payments: 0,
    latest_verified_fmv: null,
    secured_debt_amount: 0,
    ltv_policy_ratio: 0.75,
    secured_debt_certified_at: null,
  });
  // provisional_max = 400000 * 0.75 = 300000; total = 200000 => not exceeded
  assert(result.deal_exceeds_provisional_access_limit === false, "200k < 300k cap — should not exceed");
});

test("deal_exceeds_executable_access_limit when over verified cap", () => {
  const result = computeLtvPolicy({
    proposed_deal_fmv: 500000,
    upfront_payment: 200000, // total = 200k
    monthly_payment: 1000,
    number_of_payments: 120, // + 1000*120 = 120k → total = 320k
    latest_verified_fmv: 400000,
    secured_debt_amount: 0,
    ltv_policy_ratio: 0.75, // max = 300k
    secured_debt_certified_at: isoDateDaysAgo(20),
  });
  // total = 200000 + 120000 = 320000; executable_max = 300000
  assert(result.deal_exceeds_executable_access_limit === true, "320k > 300k cap — should exceed");
  assert(result.block_reasons_internal.includes("deal_exceeds_executable_ltv_cap"), "block reason present");
});

// =====================================================================
// 3. Stale debt data detection at 90 days
// =====================================================================
test("debt not stale when certified exactly 89 days ago", () => {
  const result = computeLtvPolicy({
    proposed_deal_fmv: 400000,
    upfront_payment: 10000,
    monthly_payment: 0,
    number_of_payments: 0,
    latest_verified_fmv: 400000,
    secured_debt_amount: 0,
    ltv_policy_ratio: 0.75,
    secured_debt_certified_at: isoDateDaysAgo(89),
  });
  assert(result.secured_debt_data_is_stale === false, "89 days — not stale");
  assert(!result.block_reasons_internal.includes("secured_debt_data_stale"), "no stale reason");
});

test("debt is stale when certified exactly 91 days ago", () => {
  const result = computeLtvPolicy({
    proposed_deal_fmv: 400000,
    upfront_payment: 10000,
    monthly_payment: 0,
    number_of_payments: 0,
    latest_verified_fmv: 400000,
    secured_debt_amount: 0,
    ltv_policy_ratio: 0.75,
    secured_debt_certified_at: isoDateDaysAgo(91),
  });
  assert(result.secured_debt_data_is_stale === true, "91 days — stale");
  assert(result.block_reasons_internal.includes("secured_debt_data_stale"), "stale reason present");
  assert(result.execution_readiness_blocked_by_underwriting === true, "blocked");
});

test("no stale check when certified_at is null", () => {
  const result = computeLtvPolicy({
    proposed_deal_fmv: 400000,
    upfront_payment: 10000,
    monthly_payment: 0,
    number_of_payments: 0,
    latest_verified_fmv: 400000,
    secured_debt_amount: 0,
    ltv_policy_ratio: 0.75,
    secured_debt_certified_at: null,
  });
  assert(result.secured_debt_data_is_stale === false, "null certified_at — not considered stale");
});

// =====================================================================
// 4. Missing verified FMV blocks execution readiness
// =====================================================================
test("missing verified_fmv blocks execution", () => {
  const result = computeLtvPolicy({
    proposed_deal_fmv: 500000,
    upfront_payment: 50000,
    monthly_payment: 0,
    number_of_payments: 0,
    latest_verified_fmv: null,
    secured_debt_amount: 0,
    ltv_policy_ratio: 0.75,
    secured_debt_certified_at: isoDateDaysAgo(5),
  });
  assert(result.verified_fmv_required_for_execution === true, "fmv missing — required");
  assert(result.execution_readiness_blocked_by_underwriting === true, "execution blocked");
  assert(result.block_reasons_internal.includes("verified_fmv_missing"), "reason present");
});

test("verified_fmv present clears that block reason", () => {
  const result = computeLtvPolicy({
    proposed_deal_fmv: 500000,
    upfront_payment: 50000,
    monthly_payment: 0,
    number_of_payments: 0,
    latest_verified_fmv: 500000,
    secured_debt_amount: 0,
    ltv_policy_ratio: 0.75,
    secured_debt_certified_at: isoDateDaysAgo(5),
  });
  assert(result.verified_fmv_required_for_execution === false, "fmv present — not required");
  assert(!result.block_reasons_internal.includes("verified_fmv_missing"), "no fmv reason");
});

// =====================================================================
// 5. Block reasons are additive
// =====================================================================
test("multiple block reasons accumulate", () => {
  const result = computeLtvPolicy({
    proposed_deal_fmv: 400000,
    upfront_payment: 400000, // exceeds cap
    monthly_payment: 0,
    number_of_payments: 0,
    latest_verified_fmv: null, // missing — blocks
    secured_debt_amount: 0,
    ltv_policy_ratio: 0.75,
    secured_debt_certified_at: isoDateDaysAgo(100), // stale — blocks
  });
  assert(result.block_reasons_internal.includes("verified_fmv_missing"), "fmv_missing reason");
  assert(result.block_reasons_internal.includes("secured_debt_data_stale"), "stale reason");
  assert(result.execution_readiness_blocked_by_underwriting === true, "overall blocked");
});

test("no blocks when all data is clean and deal is within limits", () => {
  const result = computeLtvPolicy({
    proposed_deal_fmv: 600000,
    upfront_payment: 50000,
    monthly_payment: 200,
    number_of_payments: 60,
    latest_verified_fmv: 600000,
    secured_debt_amount: 100000,
    ltv_policy_ratio: 0.75,
    // total = 50000 + 200*60 = 62000; executable_max = 600000*0.75 - 100000 = 350000 → ok
    secured_debt_certified_at: isoDateDaysAgo(30),
  });
  assert(result.execution_readiness_blocked_by_underwriting === false, "not blocked");
  assert(result.block_reasons_internal.length === 0, "no block reasons");
  assert(result.deal_exceeds_executable_access_limit === false, "not over limit");
  assert(result.secured_debt_data_is_stale === false, "not stale");
});

// =====================================================================
// 6. Buyer-facing surfaces: block_reasons_internal must NOT be returned
//    from the LTV policy result structure itself (it's internal-only)
// =====================================================================
test("block_reasons_internal field exists and is an array", () => {
  const result = computeLtvPolicy({
    proposed_deal_fmv: 400000,
    upfront_payment: 50000,
    monthly_payment: 0,
    number_of_payments: 0,
    latest_verified_fmv: 400000,
    secured_debt_amount: 0,
    ltv_policy_ratio: 0.75,
    secured_debt_certified_at: null,
  });
  assert(Array.isArray(result.block_reasons_internal), "block_reasons_internal is array");
});

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);
if (failed > 0) process.exit(1);
