import { normalizeWidgetPayload } from "../normalizeWidgetPayload";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
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

console.log("\n--- normalizeWidgetPayload tests ---\n");

test("null payload returns full defaults", () => {
  const r = normalizeWidgetPayload(null);
  assert(r.deal_terms.property_value === 500000, "default property_value");
  assert(r.scenario.exit_year === 5, "default exit_year");
});

test("undefined payload returns full defaults", () => {
  const r = normalizeWidgetPayload(undefined);
  assert(r.deal_terms.property_value === 500000, "default property_value");
});

test("canonical shape { deal_terms, scenario } passes through", () => {
  const r = normalizeWidgetPayload({
    deal_terms: { property_value: 700000, upfront_payment: 70000 },
    scenario: { annual_appreciation: 0.04, exit_year: 7 },
  });
  assert(r.deal_terms.property_value === 700000, "got 700000");
  assert(r.scenario.annual_appreciation === 0.04, "got 0.04");
  assert(r.scenario.exit_year === 7, "got exit_year 7");
});

test("{ inputs: { deal_terms, scenario } } shape extracts correctly", () => {
  const r = normalizeWidgetPayload({
    inputs: {
      deal_terms: { property_value: 600000 },
      scenario: { exit_year: 3 },
    },
  });
  assert(r.deal_terms.property_value === 600000, "got 600000");
  assert(r.scenario.exit_year === 3, "got exit_year 3");
});

test("full snapshot shape { snapshot_json: { inputs: { ... } } } extracts", () => {
  const r = normalizeWidgetPayload({
    contract_version: "11.0.0",
    schema_version: "11",
    snapshot_json: {
      inputs: {
        deal_terms: { property_value: 800000 },
        scenario: { annual_appreciation: 0.05 },
      },
      outputs: { results: {} },
    },
  });
  assert(r.deal_terms.property_value === 800000, "got 800000");
  assert(r.scenario.annual_appreciation === 0.05, "got 0.05");
});

test("legacy aliases: home_value -> property_value", () => {
  const r = normalizeWidgetPayload({
    deal_terms: { home_value: 450000 },
    scenario: {},
  });
  assert(r.deal_terms.property_value === 450000, "alias mapped");
});

test("legacy aliases: investment_amount -> upfront_payment", () => {
  const r = normalizeWidgetPayload({
    deal_terms: { investment_amount: 30000 },
    scenario: {},
  });
  assert(r.deal_terms.upfront_payment === 30000, "alias mapped");
});

test("legacy aliases: term_years -> contract_maturity_years", () => {
  const r = normalizeWidgetPayload({
    deal_terms: { term_years: 8 },
    scenario: {},
  });
  assert(r.deal_terms.contract_maturity_years === 8, "alias mapped");
});

test("legacy aliases: appreciation_rate -> annual_appreciation", () => {
  const r = normalizeWidgetPayload({
    deal_terms: {},
    scenario: { appreciation_rate: 0.06 },
  });
  assert(r.scenario.annual_appreciation === 0.06, "alias mapped");
});

test("missing deal_terms fields get v11 defaults", () => {
  const r = normalizeWidgetPayload({
    deal_terms: { property_value: 999000 },
    scenario: {},
  });
  assert(r.deal_terms.property_value === 999000, "provided value kept");
  assert(r.deal_terms.minimum_hold_years === 2, "default minimum_hold_years");
  assert(r.deal_terms.long_stop_year === 13, "default long_stop_year");
  assert(r.deal_terms.servicing_fee_monthly === 59, "default servicing_fee_monthly");
});

test("missing scenario fields get defaults", () => {
  const r = normalizeWidgetPayload({
    deal_terms: {},
    scenario: { exit_year: 10 },
  });
  assert(r.scenario.exit_year === 10, "provided exit_year");
  assert(r.scenario.annual_appreciation === 0.04, "default annual_appreciation");
  assert(r.scenario.closing_cost_pct === 0.06, "default closing_cost_pct");
});

test("non-finite numbers ignored", () => {
  const r = normalizeWidgetPayload({
    deal_terms: { property_value: NaN, upfront_payment: Infinity },
    scenario: {},
  });
  assert(r.deal_terms.property_value === 500000, "NaN falls back to default");
  assert(r.deal_terms.upfront_payment === 50000, "Infinity falls back to default");
});

test("string values ignored for numeric fields", () => {
  const r = normalizeWidgetPayload({
    deal_terms: { property_value: "not a number" },
    scenario: {},
  });
  assert(r.deal_terms.property_value === 500000, "string falls back to default");
});

test("empty object payload returns all defaults", () => {
  const r = normalizeWidgetPayload({});
  assert(r.deal_terms.property_value === 500000, "default property_value");
  assert(r.scenario.exit_year === 5, "default exit_year");
});

console.log("\n" + passed + " passed, " + failed + " failed out of " + (passed + failed) + " tests\n");
if (failed > 0) process.exit(1);
