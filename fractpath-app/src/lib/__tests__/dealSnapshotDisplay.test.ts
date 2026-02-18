import {
  extractSnapshotDisplay,
  selectSnapshot,
  formatValue,
  humanLabel,
} from "../dealSnapshotDisplay";

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
    console.log("        " + (err?.message ?? String(err)));
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

console.log("\n=== Deal Snapshot Display Tests (canonical-only v10) ===\n");

test("null snapshot returns null", () => {
  const result = extractSnapshotDisplay(null);
  assert(result === null, "expected null");
});

test("valid canonical snapshot returns outputs from outputs.results", () => {
  const row = {
    created_at: "2026-02-10T12:00:00Z",
    contract_version: "10.0.0",
    schema_version: "10",
    snapshot_json: {
      inputs: { deal_terms: { home_value: 500000 } },
      outputs: { results: { invested_capital_total: 123 } },
    },
  };

  const result = extractSnapshotDisplay(row as any);
  assert(result !== null, "expected non-null");
  assert(result!.contractVersion === "10.0.0", "contractVersion mismatch");
  assert(result!.schemaVersion === "10", "schemaVersion mismatch");
  assert(result!.inputs !== null, "inputs should exist");
  assert(result!.outputs !== null, "outputs should exist");
  assert(
    (result!.outputs as any).invested_capital_total === 123,
    "expected results value",
  );
});

test("missing outputs.results yields outputs=null", () => {
  const row = {
    created_at: "2026-02-10T12:00:00Z",
    contract_version: "10.0.0",
    schema_version: "10",
    snapshot_json: {
      inputs: { deal_terms: { home_value: 500000 } },
      outputs: {},
    },
  };

  const result = extractSnapshotDisplay(row as any);
  assert(result !== null, "expected non-null");
  assert(
    result!.outputs === null,
    "outputs should be null when results missing",
  );
});

test("formatValue handles types", () => {
  assert(formatValue(null) === "\u2014", "null");
  assert(formatValue(undefined) === "\u2014", "undefined");
  assert(formatValue(true) === "Yes", "true");
  assert(formatValue(false) === "No", "false");
  assert(formatValue("hello") === "hello", "string");
  assert(formatValue(1000).includes("1"), "number");
});

test("humanLabel converts snake_case", () => {
  assert(humanLabel("home_value") === "Home Value", "home_value");
  assert(
    humanLabel("monthly_payment") === "Monthly Payment",
    "monthly_payment",
  );
});

console.log("\n--- selectSnapshot Tests ---\n");

test("selectSnapshot: empty list returns null, isLatest true", () => {
  const { selected, isLatest } = selectSnapshot([], null);
  assert(selected === null, "expected null");
  assert(isLatest === true, "expected isLatest");
});

test("selectSnapshot: no selectedId returns first", () => {
  const items = [{ id: "a" }, { id: "b" }];
  const { selected, isLatest } = selectSnapshot(items, null);
  assert(selected!.id === "a", "expected a");
  assert(isLatest === true, "expected isLatest");
});

test("selectSnapshot: selectedId matches second yields isLatest=false", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const { selected, isLatest } = selectSnapshot(items, "b");
  assert(selected!.id === "b", "expected b");
  assert(isLatest === false, "expected not isLatest");
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
