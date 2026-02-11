import { buildDealSummaryViewModel } from "../dealSummaryViewModel";
import type { SnapshotDisplayData } from "../dealSnapshotDisplay";

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

function makeDisplay(overrides: Partial<SnapshotDisplayData> = {}): SnapshotDisplayData {
  return {
    contractVersion: "1",
    schemaVersion: "1",
    inputHash: "abc",
    outputHash: "def",
    createdAt: "2026-01-01T00:00:00Z",
    inputs: { home_value: 500000, term: 10 },
    outputs: { net_at_exit: 120000, buy_amount: 50000, growth_rate: 0.03 },
    chartSeries: null,
    ...overrides,
  };
}

console.log("\n--- null / missing display ---\n");

test("null display returns fallback KPI", () => {
  const vm = buildDealSummaryViewModel(null, false);
  assert(vm.kpis.length === 1, "one kpi");
  assert(vm.kpis[0].label === "Status", "label is Status");
  assert(vm.kpis[0].value === "Scenario saved", "value fallback");
  assert(vm.exits.length === 0, "no exits");
  assert(vm.assumptions.length === 0, "no assumptions");
  assert(vm.flags.hasOutputs === false, "no outputs");
  assert(vm.flags.hasExits === false, "no exits flag");
  assert(vm.flags.hasAssumptions === false, "no assumptions flag");
});

test("null outputs returns fallback KPI", () => {
  const vm = buildDealSummaryViewModel(makeDisplay({ outputs: null }), false);
  assert(vm.kpis[0].label === "Status", "label is Status");
  assert(vm.flags.hasOutputs === false, "no outputs flag");
  assert(vm.flags.hasExits === false, "no exits");
});

console.log("\n--- KPI extraction ---\n");

test("extracts headline KPI from net_at_exit", () => {
  const vm = buildDealSummaryViewModel(makeDisplay(), false);
  assert(vm.kpis[0].label === "Net At Exit", `got ${vm.kpis[0].label}`);
  assert(vm.kpis[0].value === "120,000", `got ${vm.kpis[0].value}`);
});

test("extracts supporting KPIs from outputs", () => {
  const vm = buildDealSummaryViewModel(makeDisplay(), false);
  assert(vm.kpis.length >= 2, "at least 2 kpis");
  const labels = vm.kpis.map((k) => k.label);
  assert(labels.includes("Buy Amount"), "has Buy Amount");
});

test("caps KPIs at 5", () => {
  const vm = buildDealSummaryViewModel(
    makeDisplay({
      outputs: {
        net_at_exit: 100,
        buy_amount: 200,
        term: 5,
        growth_rate: 0.03,
        monthly_payment: 500,
        equity_share: 0.1,
      },
    }),
    false,
  );
  assert(vm.kpis.length <= 5, `got ${vm.kpis.length}`);
});

test("fallback Status when no headline key exists", () => {
  const vm = buildDealSummaryViewModel(
    makeDisplay({ outputs: { misc_field: 42 } }),
    false,
  );
  assert(vm.kpis[0].label === "Status", "fallback label");
  assert(vm.kpis[0].value === "Scenario saved", "fallback value");
  assert(vm.flags.hasOutputs === true, "has outputs");
});

test("pulls supporting KPIs from inputs when outputs lacks them", () => {
  const vm = buildDealSummaryViewModel(
    makeDisplay({
      outputs: { net_at_exit: 100 },
      inputs: { buy_amount: 50000, term: 10 },
    }),
    false,
  );
  const labels = vm.kpis.map((k) => k.label);
  assert(labels.includes("Buy Amount"), "has Buy Amount from inputs");
});

console.log("\n--- isHistorical flag ---\n");

test("isHistorical=true propagated", () => {
  const vm = buildDealSummaryViewModel(makeDisplay(), true);
  assert(vm.flags.isHistorical === true, "is historical");
});

test("isHistorical=false propagated", () => {
  const vm = buildDealSummaryViewModel(makeDisplay(), false);
  assert(vm.flags.isHistorical === false, "not historical");
});

console.log("\n--- exit rows ---\n");

test("extracts exits from settlements", () => {
  const vm = buildDealSummaryViewModel(
    makeDisplay({
      outputs: {
        net_at_exit: 100,
        settlements: {
          early: { net_payout: 80000, timing: "Year 3" },
          standard: { net_payout: 120000, timing: "Year 5" },
          late: { net_payout: 160000, timing: "Year 7" },
        },
      },
    }),
    false,
  );
  assert(vm.exits.length === 3, `got ${vm.exits.length}`);
  assert(vm.exits[0].label === "Early exit", "early label");
  assert(vm.exits[0].netPayout === "80,000", `got ${vm.exits[0].netPayout}`);
  assert(vm.exits[1].label === "Standard exit", "standard label");
  assert(vm.exits[2].label === "Late exit", "late label");
  assert(vm.flags.hasExits === true, "has exits");
});

test("no exits when settlements absent", () => {
  const vm = buildDealSummaryViewModel(makeDisplay(), false);
  assert(vm.exits.length === 0, "no exits");
  assert(vm.flags.hasExits === false, "no exits flag");
});

test("extracts exits from exit_early/exit_standard alternate keys", () => {
  const vm = buildDealSummaryViewModel(
    makeDisplay({
      outputs: {
        exit_early: { net_payout: 70000, year: 2 },
        exit_standard: { payout: 110000, exit_year: 5 },
      },
    }),
    false,
  );
  assert(vm.exits.length === 2, `got ${vm.exits.length}`);
  assert(vm.exits[0].netPayout === "70,000", `got ${vm.exits[0].netPayout}`);
  assert(vm.exits[1].netPayout === "110,000", `got ${vm.exits[1].netPayout}`);
});

console.log("\n--- assumptions ---\n");

test("extracts assumptions from inputs", () => {
  const vm = buildDealSummaryViewModel(
    makeDisplay({ inputs: { home_value: 500000, appreciation_rate: 0.04, term: 10 } }),
    false,
  );
  assert(vm.assumptions.length >= 2, `got ${vm.assumptions.length}`);
  const labels = vm.assumptions.map((a) => a.label);
  assert(labels.includes("Home Value"), "has Home Value");
  assert(labels.includes("Appreciation Rate"), "has Appreciation Rate");
  assert(vm.flags.hasAssumptions === true, "has assumptions");
});

test("omits assumptions when inputs is null", () => {
  const vm = buildDealSummaryViewModel(makeDisplay({ inputs: null }), false);
  assert(vm.assumptions.length === 0, "no assumptions");
  assert(vm.flags.hasAssumptions === false, "no assumptions flag");
});

test("caps assumptions at 6", () => {
  const vm = buildDealSummaryViewModel(
    makeDisplay({
      inputs: {
        home_value: 1,
        property_value: 2,
        appreciation_rate: 3,
        discount_rate: 4,
        holding_period: 5,
        term: 6,
        term_years: 7,
        inflation_rate: 8,
      },
    }),
    false,
  );
  assert(vm.assumptions.length <= 6, `got ${vm.assumptions.length}`);
});

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);
if (failed > 0) process.exit(1);
