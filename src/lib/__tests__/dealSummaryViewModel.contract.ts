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
    contractVersion: "11.0.0" as string | null,
    schemaVersion: "11" as string | null,
    inputs: { deal_terms: { property_value: 500000 } } as Record<string, unknown> | null,
    outputs: {
      results: {
        current_contract_value: 520000,
        current_participation_value: 480000,
        extension_adjusted_buyout_amount: 510000,
        funding_completion_factor: 0.6,
        fractpath_revenue_to_date: 3200,
      },
    } as Record<string, unknown> | null,
    ...overrides,
  };
}

console.log("\n--- null / missing display ---\n");

test("null outputs returns Not computed", () => {
  const vm = buildDealSummaryViewModel(makeArgs({ outputs: null }));
  assert(vm.kpis.length >= 1, "at least one kpi");
  assert(vm.kpis[0].label === "Status", "label is Status");
  assert(vm.kpis[0].value === "Not computed", "value is Not computed");
});

test("empty outputs returns Not computed", () => {
  const vm = buildDealSummaryViewModel(makeArgs({ outputs: {} }));
  assert(vm.kpis[0].label === "Status", "label is Status");
  assert(vm.kpis[0].value === "Not computed", "value is Not computed");
});

console.log("\n--- KPI extraction ---\n");

test("extracts current_contract_value KPI", () => {
  const vm = buildDealSummaryViewModel(makeArgs({
    outputs: { results: { current_contract_value: 520000 } },
  }));
  assert(vm.kpis.length >= 1, "at least one kpi");
  assert(vm.kpis[0].label === "Contract value", "got " + vm.kpis[0].label);
});

test("extracts current_participation_value KPI", () => {
  const vm = buildDealSummaryViewModel(makeArgs({
    outputs: { results: { current_participation_value: 480000 } },
  }));
  const labels = vm.kpis.map((k) => k.label);
  assert(labels.includes("Participation value"), "has Participation value");
});

test("extracts extension_adjusted_buyout_amount KPI", () => {
  const vm = buildDealSummaryViewModel(makeArgs({
    outputs: { results: { extension_adjusted_buyout_amount: 510000 } },
  }));
  const labels = vm.kpis.map((k) => k.label);
  assert(labels.includes("Buyout amount"), "has Buyout amount");
});

test("extracts multiple KPIs from canonical v11 results", () => {
  const vm = buildDealSummaryViewModel(makeArgs({
    outputs: {
      results: {
        current_contract_value: 520000,
        current_participation_value: 480000,
        extension_adjusted_buyout_amount: 510000,
        funding_completion_factor: 0.6,
        fractpath_revenue_to_date: 3200,
      },
    },
  }));
  assert(vm.kpis.length >= 3, "at least 3 KPIs from rich results: " + vm.kpis.length);
});

console.log("\n--- sanity guards ---\n");

test("omits funding_completion_factor when > 1", () => {
  const vm = buildDealSummaryViewModel(makeArgs({
    outputs: { results: { current_contract_value: 500000, funding_completion_factor: 1.5 } },
  }));
  const labels = vm.kpis.map((k) => k.label);
  assert(!labels.includes("Funding completion"), "factor > 1 should be omitted");
});

test("omits funding_completion_factor when negative", () => {
  const vm = buildDealSummaryViewModel(makeArgs({
    outputs: { results: { current_contract_value: 500000, funding_completion_factor: -0.1 } },
  }));
  const labels = vm.kpis.map((k) => k.label);
  assert(!labels.includes("Funding completion"), "negative factor should be omitted");
});

test("omits NaN money fields", () => {
  const vm = buildDealSummaryViewModel(makeArgs({
    outputs: { results: { current_contract_value: NaN, current_participation_value: Infinity } },
  }));
  assert(vm.kpis[0].label === "Status", "NaN/Infinity should yield Status fallback");
});

test("shows Computed (insufficient data) when results has no renderable KPIs", () => {
  const vm = buildDealSummaryViewModel(makeArgs({
    outputs: { results: { unknown_field: 42 } },
  }));
  assert(vm.kpis[0].label === "Status", "fallback label");
  assert(vm.kpis[0].value === "Computed (insufficient data)", "fallback value: " + vm.kpis[0].value);
});

test("flat v11 results (no .results wrapper) detected via known keys", () => {
  const vm = buildDealSummaryViewModel(makeArgs({
    outputs: { current_contract_value: 500000, funding_completion_factor: 0.5 },
  }));
  const labels = vm.kpis.map((k) => k.label);
  assert(labels.includes("Contract value"), "flat v11 detection: " + JSON.stringify(labels));
});

console.log("\n" + passed + " passed, " + failed + " failed out of " + (passed + failed) + " tests\n");
if (failed > 0) process.exit(1);
