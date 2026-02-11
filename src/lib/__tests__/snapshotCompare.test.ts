import { compareSnapshotDisplay } from "../snapshotCompare";

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

console.log("\n=== Snapshot Compare Tests ===\n");

console.log("--- identical snapshots ---\n");

test("identical snapshots produce no diffs", () => {
  const snap = {
    contract_version: "1.0",
    schema_version: "1",
    inputs: { home_value: 500000, term: 10 },
    outputs: { monthly_payment: 2500 },
  };
  const r = compareSnapshotDisplay(snap, snap);
  assert(r.inputDiffs.length === 0, "no input diffs");
  assert(r.outputDiffs.length === 0, "no output diffs");
  assert(r.metaDiffs.length === 0, "no meta diffs");
});

test("equal-by-value snapshots produce no diffs", () => {
  const a = {
    contract_version: "1.0",
    schema_version: "1",
    inputs: { home_value: 500000 },
    outputs: { result: 100 },
  };
  const b = {
    contract_version: "1.0",
    schema_version: "1",
    inputs: { home_value: 500000 },
    outputs: { result: 100 },
  };
  const r = compareSnapshotDisplay(a, b);
  assert(r.inputDiffs.length === 0, "no input diffs");
  assert(r.outputDiffs.length === 0, "no output diffs");
});

console.log("\n--- changed inputs ---\n");

test("changed numeric input is detected", () => {
  const a = { inputs: { home_value: 500000 }, outputs: {} };
  const b = { inputs: { home_value: 600000 }, outputs: {} };
  const r = compareSnapshotDisplay(a, b);
  assert(r.inputDiffs.length === 1, "one input diff");
  assert(r.inputDiffs[0].key === "home_value", "correct key");
  assert(r.inputDiffs[0].a === 500000, "a value");
  assert(r.inputDiffs[0].b === 600000, "b value");
});

test("changed string input is detected", () => {
  const a = { inputs: { mode: "conservative" }, outputs: {} };
  const b = { inputs: { mode: "aggressive" }, outputs: {} };
  const r = compareSnapshotDisplay(a, b);
  assert(r.inputDiffs.length === 1, "one input diff");
  assert(r.inputDiffs[0].key === "mode", "correct key");
});

console.log("\n--- changed outputs ---\n");

test("changed output is detected", () => {
  const a = { inputs: {}, outputs: { monthly_payment: 2500 } };
  const b = { inputs: {}, outputs: { monthly_payment: 3000 } };
  const r = compareSnapshotDisplay(a, b);
  assert(r.outputDiffs.length === 1, "one output diff");
  assert(r.outputDiffs[0].key === "monthly_payment", "correct key");
});

console.log("\n--- missing/added keys ---\n");

test("key present only in A shows up as diff", () => {
  const a = { inputs: { home_value: 500000, extra: 42 }, outputs: {} };
  const b = { inputs: { home_value: 500000 }, outputs: {} };
  const r = compareSnapshotDisplay(a, b);
  assert(r.inputDiffs.length === 1, "one diff for missing key");
  assert(r.inputDiffs[0].key === "extra", "correct key");
  assert(r.inputDiffs[0].a === 42, "a has value");
  assert(r.inputDiffs[0].b === null, "b is null");
});

test("key present only in B shows up as diff", () => {
  const a = { inputs: {}, outputs: {} };
  const b = { inputs: { new_field: "hello" }, outputs: {} };
  const r = compareSnapshotDisplay(a, b);
  assert(r.inputDiffs.length === 1, "one diff");
  assert(r.inputDiffs[0].key === "new_field", "correct key");
  assert(r.inputDiffs[0].a === null, "a is null");
  assert(r.inputDiffs[0].b === "hello", "b has value");
});

console.log("\n--- null/undefined handling ---\n");

test("null snapshots produce no diffs", () => {
  const r = compareSnapshotDisplay(null, null);
  assert(r.inputDiffs.length === 0, "no diffs");
  assert(r.outputDiffs.length === 0, "no diffs");
});

test("null vs object shows diffs for all keys", () => {
  const b = { inputs: { home_value: 100 }, outputs: { result: 50 } };
  const r = compareSnapshotDisplay(null, b);
  assert(r.inputDiffs.length === 1, "one input diff");
  assert(r.outputDiffs.length === 1, "one output diff");
});

test("undefined inputs treated as empty", () => {
  const a = { outputs: {} } as any;
  const b = { inputs: { x: 1 }, outputs: {} };
  const r = compareSnapshotDisplay(a, b);
  assert(r.inputDiffs.length === 1, "one diff");
});

console.log("\n--- meta diffs ---\n");

test("changed contract_version is detected", () => {
  const a = { contract_version: "1.0", schema_version: "1", inputs: {}, outputs: {} };
  const b = { contract_version: "2.0", schema_version: "1", inputs: {}, outputs: {} };
  const r = compareSnapshotDisplay(a, b);
  assert(r.metaDiffs.length === 1, "one meta diff");
  assert(r.metaDiffs[0].key === "contract_version", "correct key");
});

test("changed schema_version is detected", () => {
  const a = { contract_version: "1.0", schema_version: "1", inputs: {}, outputs: {} };
  const b = { contract_version: "1.0", schema_version: "2", inputs: {}, outputs: {} };
  const r = compareSnapshotDisplay(a, b);
  assert(r.metaDiffs.length === 1, "one meta diff");
  assert(r.metaDiffs[0].key === "schema_version", "correct key");
});

console.log("\n--- nested object values ---\n");

test("identical nested objects produce no diff", () => {
  const a = { inputs: { details: { a: 1, b: 2 } }, outputs: {} };
  const b = { inputs: { details: { a: 1, b: 2 } }, outputs: {} };
  const r = compareSnapshotDisplay(a, b);
  assert(r.inputDiffs.length === 0, "no diffs");
});

test("changed nested object detected as diff", () => {
  const a = { inputs: { details: { a: 1 } }, outputs: {} };
  const b = { inputs: { details: { a: 2 } }, outputs: {} };
  const r = compareSnapshotDisplay(a, b);
  assert(r.inputDiffs.length === 1, "one diff");
  assert(r.inputDiffs[0].key === "details", "correct key");
});

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);
if (failed > 0) process.exit(1);
