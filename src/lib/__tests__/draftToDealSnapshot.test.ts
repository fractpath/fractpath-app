import { mapDraftToDealSnapshot } from "../draftToDealSnapshot";
import { validateFullDealSnapshotV1 } from "../dealSnapshot";
import type { DraftSnapshotV1 } from "../draftSnapshot";

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

function makeDraft(overrides: Partial<DraftSnapshotV1> = {}): DraftSnapshotV1 {
  return {
    schema_version: "1",
    inputs: { home_value: 500000, equity_pct: 15 },
    result: { monthly_payment: 1200, total_equity: 75000 },
    engine_version: "0.3.0",
    calculator_schema_version: "1.0.0",
    inputs_hash: "abc123",
    result_hash: "def456",
    ...overrides,
  };
}

console.log("\n=== DraftSnapshotV1 → FullDealSnapshotV1 Mapping Tests ===\n");

test("maps draft fields to deal snapshot fields correctly", () => {
  const draft = makeDraft();
  const result = mapDraftToDealSnapshot(draft);

  assert(result.contract_version === "1.0.0", `contract_version: ${result.contract_version}`);
  assert(result.schema_version === "1", `schema_version: ${result.schema_version}`);
  assert(result.inputs === draft.inputs, "inputs should be same reference");
  assert(result.outputs === draft.result, "outputs should map from result");
  assert(result.input_hash === "abc123", `input_hash: ${result.input_hash}`);
  assert(result.output_hash === "def456", `output_hash: ${result.output_hash}`);
  assert(result.engine_version === "0.3.0", "engine_version preserved");
  assert(result.calculator_schema_version === "1.0.0", "calculator_schema_version preserved");
});

test("uses explicit contractVersion when provided", () => {
  const draft = makeDraft();
  const result = mapDraftToDealSnapshot(draft, "2.0.0");
  assert(result.contract_version === "2.0.0", `expected 2.0.0, got ${result.contract_version}`);
});

test("falls back to calculator_schema_version for contract_version", () => {
  const draft = makeDraft({ calculator_schema_version: "3.5.0" });
  const result = mapDraftToDealSnapshot(draft);
  assert(result.contract_version === "3.5.0", `expected 3.5.0, got ${result.contract_version}`);
});

test("mapped snapshot passes FullDealSnapshotV1 validation", () => {
  const draft = makeDraft();
  const mapped = mapDraftToDealSnapshot(draft);
  const validation = validateFullDealSnapshotV1(mapped);
  assert(validation.ok === true, `validation failed: ${!validation.ok ? validation.error : ""}`);
  if (validation.ok) {
    assert(validation.input_hash === "abc123", "input_hash from validation");
    assert(validation.output_hash === "def456", "output_hash from validation");
  }
});

test("preserves opaque extra metadata fields", () => {
  const draft = makeDraft();
  const mapped = mapDraftToDealSnapshot(draft);
  assert(mapped.engine_version === "0.3.0", "engine_version");
  assert(mapped.calculator_schema_version === "1.0.0", "calculator_schema_version");
});

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);
if (failed > 0) process.exit(1);
