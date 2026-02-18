import { validateFullDealSnapshotV1 } from "../dealSnapshot";

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

function makeValidSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    contract_version: "1.0.0",
    schema_version: "1",
    inputs: { home_value: 500000, equity_pct: 15 },
    outputs: { monthly_payment: 1200, total_equity: 75000 },
    input_hash: "abc123",
    output_hash: "def456",
    ...overrides,
  };
}

console.log("\n=== FullDealSnapshotV1 Validation Tests ===\n");

test("valid snapshot passes validation", () => {
  const r = validateFullDealSnapshotV1(makeValidSnapshot());
  assert(r.ok === true, "expected ok");
  if (r.ok) {
    assert(r.contract_version === "1.0.0", "contract_version mismatch");
    assert(r.schema_version === "1", "schema_version mismatch");
    assert(r.input_hash === "abc123", "input_hash mismatch");
    assert(r.output_hash === "def456", "output_hash mismatch");
  }
});

test("valid snapshot without optional hashes passes", () => {
  const snap = makeValidSnapshot();
  delete (snap as any).input_hash;
  delete (snap as any).output_hash;
  const r = validateFullDealSnapshotV1(snap);
  assert(r.ok === true, "expected ok");
  if (r.ok) {
    assert(r.input_hash === null, "input_hash should be null");
    assert(r.output_hash === null, "output_hash should be null");
  }
});

test("rejects null payload", () => {
  const r = validateFullDealSnapshotV1(null);
  assert(r.ok === false, "expected error");
  if (!r.ok) assert(r.code === "INVALID_TYPE", `wrong code: ${r.code}`);
});

test("rejects array payload", () => {
  const r = validateFullDealSnapshotV1([1, 2, 3]);
  assert(r.ok === false, "expected error");
  if (!r.ok) assert(r.code === "INVALID_TYPE", `wrong code: ${r.code}`);
});

test("rejects missing contract_version", () => {
  const r = validateFullDealSnapshotV1(makeValidSnapshot({ contract_version: undefined }));
  assert(r.ok === false, "expected error");
  if (!r.ok) assert(r.code === "MISSING_FIELD", `wrong code: ${r.code}`);
});

test("rejects empty contract_version", () => {
  const r = validateFullDealSnapshotV1(makeValidSnapshot({ contract_version: "  " }));
  assert(r.ok === false, "expected error");
  if (!r.ok) assert(r.code === "MISSING_FIELD", `wrong code: ${r.code}`);
});

test("rejects missing schema_version", () => {
  const r = validateFullDealSnapshotV1(makeValidSnapshot({ schema_version: undefined }));
  assert(r.ok === false, "expected error");
  if (!r.ok) assert(r.code === "MISSING_FIELD", `wrong code: ${r.code}`);
});

test("rejects missing inputs", () => {
  const r = validateFullDealSnapshotV1(makeValidSnapshot({ inputs: undefined }));
  assert(r.ok === false, "expected error");
  if (!r.ok) assert(r.code === "MISSING_FIELD", `wrong code: ${r.code}`);
});

test("rejects inputs as array", () => {
  const r = validateFullDealSnapshotV1(makeValidSnapshot({ inputs: [1, 2] }));
  assert(r.ok === false, "expected error");
  if (!r.ok) assert(r.code === "MISSING_FIELD", `wrong code: ${r.code}`);
});

test("rejects missing outputs", () => {
  const r = validateFullDealSnapshotV1(makeValidSnapshot({ outputs: undefined }));
  assert(r.ok === false, "expected error");
  if (!r.ok) assert(r.code === "MISSING_FIELD", `wrong code: ${r.code}`);
});

test("rejects outputs as array", () => {
  const r = validateFullDealSnapshotV1(makeValidSnapshot({ outputs: [1, 2] }));
  assert(r.ok === false, "expected error");
  if (!r.ok) assert(r.code === "MISSING_FIELD", `wrong code: ${r.code}`);
});

test("rejects non-string input_hash", () => {
  const r = validateFullDealSnapshotV1(makeValidSnapshot({ input_hash: 123 }));
  assert(r.ok === false, "expected error");
  if (!r.ok) assert(r.code === "INVALID_FIELD_TYPE", `wrong code: ${r.code}`);
});

test("rejects non-string output_hash", () => {
  const r = validateFullDealSnapshotV1(makeValidSnapshot({ output_hash: true }));
  assert(r.ok === false, "expected error");
  if (!r.ok) assert(r.code === "INVALID_FIELD_TYPE", `wrong code: ${r.code}`);
});

test("preserves extra fields in snapshot (opaque pass-through)", () => {
  const snap = makeValidSnapshot({ extra_field: "should survive" });
  const r = validateFullDealSnapshotV1(snap);
  assert(r.ok === true, "expected ok");
  if (r.ok) {
    assert((r.snapshot as any).extra_field === "should survive", "extra field lost");
  }
});

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);
if (failed > 0) process.exit(1);
