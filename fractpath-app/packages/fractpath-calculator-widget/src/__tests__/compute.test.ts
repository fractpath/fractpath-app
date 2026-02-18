import { computeDeal, TERMS_VERSION, SCHEMA_VERSION } from "../compute";

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
    console.log(`        ${err.message}`);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log("\n--- fractpath-calculator-widget compute ---\n");

test("TERMS_VERSION is a string", () => {
  assertEq(typeof TERMS_VERSION, "string", "TERMS_VERSION type");
  assert(TERMS_VERSION.length > 0, "TERMS_VERSION non-empty");
});

test("SCHEMA_VERSION is a string", () => {
  assertEq(SCHEMA_VERSION, "1", "SCHEMA_VERSION");
});

test("Scenario 1: 500k / 10% / 10yr — golden fixture", () => {
  const result = computeDeal({
    home_value: 500000,
    fractional_percent: 10,
    term_years: 10,
    appreciation_rate: 3,
    discount_rate: 5,
  });

  assertEq(result.terms_version, "fractpath-terms-v1.0", "terms_version");

  const s = result.outputs.summary;
  assertEq(s.home_value, 500000, "home_value");
  assertEq(s.buy_amount, 50000, "buy_amount");
  assertEq(s.estimated_end_value, 671958.19, "estimated_end_value");
  assertEq(s.investor_share_at_exit, 67195.82, "investor_share_at_exit");
  assertEq(s.homeowner_net_at_exit, 604762.37, "homeowner_net_at_exit");
  assertEq(s.total_return_multiple, 1.34, "total_return_multiple");

  assertEq(result.outputs.schedule.length, 11, "schedule rows (0-10)");

  const early = result.outputs.settlements.early;
  assertEq(early.exit_year, 3, "early exit_year");
  assertEq(early.home_value_at_exit, 546363.5, "early home_value_at_exit");
  assertEq(early.investor_payout, 47196.93, "early investor_payout");

  const standard = result.outputs.settlements.standard;
  assertEq(standard.exit_year, 10, "standard exit_year");

  const late = result.outputs.settlements.late;
  assertEq(late.exit_year, 15, "late exit_year");
});

test("Scenario 2: 250k / 15% / 5yr — golden fixture", () => {
  const result = computeDeal({
    home_value: 250000,
    fractional_percent: 15,
    term_years: 5,
    appreciation_rate: 4,
    discount_rate: 6,
  });

  assertEq(result.terms_version, "fractpath-terms-v1.0", "terms_version");

  const s = result.outputs.summary;
  assertEq(s.buy_amount, 37500, "buy_amount");
  assertEq(s.estimated_end_value, 304163.23, "estimated_end_value");
  assertEq(s.investor_share_at_exit, 45624.48, "investor_share_at_exit");
  assertEq(s.homeowner_net_at_exit, 258538.75, "homeowner_net_at_exit");
  assertEq(s.total_return_multiple, 1.22, "total_return_multiple");

  assertEq(result.outputs.schedule.length, 6, "schedule rows (0-5)");

  const early = result.outputs.settlements.early;
  assertEq(early.exit_year, 1, "early exit_year");
  assertEq(early.investor_payout, 36792.45, "early investor_payout");
});

test("Scenario 3: 1M / 20% / 15yr — golden fixture", () => {
  const result = computeDeal({
    home_value: 1000000,
    fractional_percent: 20,
    term_years: 15,
    appreciation_rate: 5,
    discount_rate: 3,
  });

  assertEq(result.terms_version, "fractpath-terms-v1.0", "terms_version");

  const s = result.outputs.summary;
  assertEq(s.buy_amount, 200000, "buy_amount");
  assertEq(s.estimated_end_value, 2078928.18, "estimated_end_value");
  assertEq(s.total_return_multiple, 2.08, "total_return_multiple");

  assertEq(result.outputs.schedule.length, 16, "schedule rows (0-15)");
});

test("output shape: summary, schedule, settlements", () => {
  const result = computeDeal({
    home_value: 400000,
    fractional_percent: 12,
    term_years: 7,
    appreciation_rate: 3.5,
    discount_rate: 4,
  });

  assert(typeof result.outputs.summary === "object", "summary is object");
  assert(Array.isArray(result.outputs.schedule), "schedule is array");
  assert(typeof result.outputs.settlements === "object", "settlements is object");
  assert(typeof result.outputs.settlements.early === "object", "early settlement");
  assert(typeof result.outputs.settlements.standard === "object", "standard settlement");
  assert(typeof result.outputs.settlements.late === "object", "late settlement");
});

test("schedule rows have required fields", () => {
  const result = computeDeal({
    home_value: 300000,
    fractional_percent: 10,
    term_years: 5,
    appreciation_rate: 3,
    discount_rate: 5,
  });

  const row = result.outputs.schedule[3];
  assert(typeof row.year === "number", "year");
  assert(typeof row.home_value === "number", "home_value");
  assert(typeof row.fractional_value === "number", "fractional_value");
  assert(typeof row.homeowner_equity === "number", "homeowner_equity");
  assert(typeof row.investor_equity === "number", "investor_equity");
  assert(typeof row.cumulative_appreciation === "number", "cumulative_appreciation");
});

test("deterministic: same inputs produce identical outputs", () => {
  const inputs = {
    home_value: 500000,
    fractional_percent: 10,
    term_years: 10,
    appreciation_rate: 3,
    discount_rate: 5,
  };
  const a = JSON.stringify(computeDeal(inputs));
  const b = JSON.stringify(computeDeal(inputs));
  assertEq(a, b, "deterministic outputs");
});

test("pure function: no window/document dependency", () => {
  assert(typeof (globalThis as any).window === "undefined", "no window in Node");
  const result = computeDeal({
    home_value: 500000,
    fractional_percent: 10,
    term_years: 10,
    appreciation_rate: 3,
    discount_rate: 5,
  });
  assert(result.terms_version.length > 0, "runs in Node");
});

test("rejects invalid inputs: negative home_value", () => {
  try {
    computeDeal({ home_value: -100, fractional_percent: 10, term_years: 5, appreciation_rate: 3, discount_rate: 5 });
    throw new Error("should have thrown");
  } catch (e: any) {
    assert(e.message.includes("home_value"), "error mentions home_value");
  }
});

test("rejects invalid inputs: fractional_percent > 100", () => {
  try {
    computeDeal({ home_value: 500000, fractional_percent: 150, term_years: 5, appreciation_rate: 3, discount_rate: 5 });
    throw new Error("should have thrown");
  } catch (e: any) {
    assert(e.message.includes("fractional_percent"), "error mentions fractional_percent");
  }
});

test("rejects invalid inputs: term_years = 0", () => {
  try {
    computeDeal({ home_value: 500000, fractional_percent: 10, term_years: 0, appreciation_rate: 3, discount_rate: 5 });
    throw new Error("should have thrown");
  } catch (e: any) {
    assert(e.message.includes("term_years"), "error mentions term_years");
  }
});

test("schedule year 0 = initial state (no appreciation)", () => {
  const result = computeDeal({
    home_value: 500000,
    fractional_percent: 10,
    term_years: 5,
    appreciation_rate: 3,
    discount_rate: 5,
  });
  const row0 = result.outputs.schedule[0];
  assertEq(row0.year, 0, "year 0");
  assertEq(row0.home_value, 500000, "initial home_value");
  assertEq(row0.cumulative_appreciation, 0, "no initial appreciation");
});

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);
if (failed > 0) process.exit(1);
