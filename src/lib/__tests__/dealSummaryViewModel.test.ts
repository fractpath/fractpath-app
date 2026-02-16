import { buildDealSummaryViewModel } from "../dealSummaryViewModel";

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

function makeArgs(overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: "10.0.0" as string | null,
    schemaVersion: "10" as string | null,
    inputs: { deal_terms: { property_value: 500000 } } as Record<string, unknown> | null,
    outputs: { results: { invested_capital_total: 50000, isa_settlement: 65000 } } as Record<string, unknown> | null,
    ...overrides,
  };
}

console.log("\n--- null / missing display ---\n");

test("null outputs returns fallback KPI", () => {
  const vm = buildDealSummaryViewModel(makeArgs({ outputs: null }));
  assert(vm.kpis.length >= 1, "at least one kpi");
  assert(vm.kpis[0].label === "Status", "label is Status");
});

test("empty outputs returns fallback KPI", () => {
  const vm = buildDealSummaryViewModel(makeArgs({ outputs: {} }));
  assert(vm.kpis[0].label === "Status", "label is Status");
});

console.log("\n--- KPI extraction ---\n");

test("extracts invested_capital_total KPI", () => {
  const vm = buildDealSummaryViewModel(makeArgs({
    outputs: { results: { invested_capital_total: 50000 } },
  }));
  assert(vm.kpis.length >= 1, "at least one kpi");
  assert(vm.kpis[0].label === "Invested capital", "got " + vm.kpis[0].label);
});

test("extracts isa_settlement KPI", () => {
  const vm = buildDealSummaryViewModel(makeArgs({
    outputs: { results: { isa_settlement: 65000 } },
  }));
  const labels = vm.kpis.map((k) => k.label);
  assert(labels.includes("ISA settlement"), "has ISA settlement");
});

test("extracts multiple KPIs from canonical results", () => {
  const vm = buildDealSummaryViewModel(makeArgs({
    outputs: {
      results: {
        invested_capital_total: 50000,
        projected_fmv: 600000,
        isa_settlement: 65000,
        investor_multiple: 1.3,
        investor_irr_annual: 0.058,
        investor_profit: 15000,
      },
    },
  }));
  assert(vm.kpis.length >= 3, "at least 3 KPIs from rich results");
});

test("fallback Status when results has no known keys", () => {
  const vm = buildDealSummaryViewModel(makeArgs({
    outputs: { results: { unknown_field: 42 } },
  }));
  assert(vm.kpis[0].label === "Status", "fallback label");
  assert(vm.kpis[0].value === "Computed", "fallback value");
});

console.log("\n" + passed + " passed, " + failed + " failed out of " + (passed + failed) + " tests\n");
if (failed > 0) process.exit(1);
