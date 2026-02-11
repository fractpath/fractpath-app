import { extractSnapshotDisplay, formatValue, humanLabel } from "../dealSnapshotDisplay";

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

console.log("\n=== Deal Snapshot Display Tests ===\n");

test("null snapshot returns null (empty state path)", () => {
  const result = extractSnapshotDisplay(null);
  assert(result === null, "expected null");
});

test("valid snapshot returns display data (snapshot path)", () => {
  const row = {
    created_at: "2026-02-10T12:00:00Z",
    contract_version: "1.0.0",
    schema_version: "1",
    input_hash: "abc123",
    output_hash: "def456",
    snapshot_json: {
      contract_version: "1.0.0",
      schema_version: "1",
      inputs: { home_value: 500000 },
      outputs: { monthly_payment: 1200 },
    },
  };
  const result = extractSnapshotDisplay(row);
  assert(result !== null, "expected non-null");
  assert(result!.contractVersion === "1.0.0", "contract_version mismatch");
  assert(result!.schemaVersion === "1", "schema_version mismatch");
  assert(result!.inputHash === "abc123", "input_hash mismatch");
  assert(result!.outputHash === "def456", "output_hash mismatch");
  assert(result!.inputs !== null, "inputs should exist");
  assert(result!.outputs !== null, "outputs should exist");
  assert(result!.chartSeries === null, "no chart_series expected");
});

test("missing optional hashes degrade to em dash", () => {
  const row = {
    created_at: "2026-02-10T12:00:00Z",
    contract_version: "1.0.0",
    schema_version: "1",
    input_hash: null,
    output_hash: null,
    snapshot_json: {
      inputs: { a: 1 },
      outputs: { b: 2 },
    },
  };
  const result = extractSnapshotDisplay(row);
  assert(result !== null, "expected non-null");
  assert(result!.inputHash === "\u2014", "should show em dash for null hash");
  assert(result!.outputHash === "\u2014", "should show em dash for null hash");
});

test("missing inputs in snapshot_json degrades gracefully", () => {
  const row = {
    created_at: "2026-02-10T12:00:00Z",
    contract_version: "1.0.0",
    schema_version: "1",
    input_hash: null,
    output_hash: null,
    snapshot_json: {
      outputs: { b: 2 },
    },
  };
  const result = extractSnapshotDisplay(row);
  assert(result !== null, "expected non-null");
  assert(result!.inputs === null, "missing inputs should be null");
  assert(result!.outputs !== null, "outputs should exist");
});

test("missing outputs in snapshot_json degrades gracefully", () => {
  const row = {
    created_at: "2026-02-10T12:00:00Z",
    contract_version: "1.0.0",
    schema_version: "1",
    input_hash: null,
    output_hash: null,
    snapshot_json: {
      inputs: { a: 1 },
    },
  };
  const result = extractSnapshotDisplay(row);
  assert(result !== null, "expected non-null");
  assert(result!.inputs !== null, "inputs should exist");
  assert(result!.outputs === null, "missing outputs should be null");
});

test("chart_series present as array is extracted", () => {
  const row = {
    created_at: "2026-02-10T12:00:00Z",
    contract_version: "1.0.0",
    schema_version: "1",
    input_hash: null,
    output_hash: null,
    snapshot_json: {
      inputs: { a: 1 },
      outputs: { b: 2 },
      chart_series: [{ year: 1, value: 100 }, { year: 2, value: 200 }],
    },
  };
  const result = extractSnapshotDisplay(row);
  assert(result !== null, "expected non-null");
  assert(result!.chartSeries !== null, "chart_series should exist");
  assert(result!.chartSeries!.length === 2, "should have 2 entries");
});

test("chart_series as non-array is ignored", () => {
  const row = {
    created_at: "2026-02-10T12:00:00Z",
    contract_version: "1.0.0",
    schema_version: "1",
    input_hash: null,
    output_hash: null,
    snapshot_json: {
      inputs: { a: 1 },
      outputs: { b: 2 },
      chart_series: "not an array",
    },
  };
  const result = extractSnapshotDisplay(row);
  assert(result!.chartSeries === null, "non-array chart_series should be null");
});

test("formatValue handles various types", () => {
  assert(formatValue(null) === "\u2014", "null");
  assert(formatValue(undefined) === "\u2014", "undefined");
  assert(formatValue(true) === "Yes", "true");
  assert(formatValue(false) === "No", "false");
  assert(formatValue("hello") === "hello", "string");
  assert(formatValue(1000).includes("1"), "number");
});

test("humanLabel converts snake_case to title case", () => {
  assert(humanLabel("home_value") === "Home Value", `got: ${humanLabel("home_value")}`);
  assert(humanLabel("monthly_payment") === "Monthly Payment", `got: ${humanLabel("monthly_payment")}`);
});

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);
if (failed > 0) process.exit(1);
