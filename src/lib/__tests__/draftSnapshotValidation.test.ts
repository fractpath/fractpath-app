import { createHash } from "node:crypto";
import { validateDraftSnapshotV1 } from "../draftSnapshot";

function hash(obj: unknown): string {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

function makeValidSnapshot(overrides: Record<string, unknown> = {}) {
  const inputs = { home_value: 500000, equity_pct: 15 };
  const result = { monthly_payment: 1200, total_equity: 75000 };
  return {
    schema_version: "1",
    inputs,
    result,
    engine_version: "0.3.0",
    calculator_schema_version: "1.0.0",
    inputs_hash: hash(inputs),
    result_hash: hash(result),
    ...overrides,
  };
}

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  FAIL: ${name} — ${err.message}`);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

console.log("DraftSnapshot v1 Validation Tests");
console.log("===================================");

test("happy path: valid snapshot passes validation", () => {
  const snap = makeValidSnapshot();
  const result = validateDraftSnapshotV1(snap);
  assert(result.ok === true, "Expected ok=true");
  if (result.ok) {
    assert(result.snapshot.schema_version === "1", "schema_version mismatch");
    assert(result.snapshot.engine_version === "0.3.0", "engine_version mismatch");
    assert(JSON.stringify(result.snapshot.inputs) === JSON.stringify(snap.inputs), "inputs mutated");
    assert(JSON.stringify(result.snapshot.result) === JSON.stringify(snap.result), "result mutated");
  }
});

test("rejects unsupported schema_version", () => {
  const snap = makeValidSnapshot({ schema_version: "99" });
  const result = validateDraftSnapshotV1(snap);
  assert(result.ok === false, "Expected ok=false");
  if (!result.ok) {
    assert(result.code === "INVALID_SCHEMA_VERSION", `Expected INVALID_SCHEMA_VERSION, got ${result.code}`);
  }
});

test("rejects missing schema_version", () => {
  const snap = makeValidSnapshot();
  delete (snap as any).schema_version;
  const result = validateDraftSnapshotV1(snap);
  assert(result.ok === false, "Expected ok=false");
  if (!result.ok) {
    assert(result.code === "MISSING_FIELD", `Expected MISSING_FIELD, got ${result.code}`);
  }
});

test("rejects missing inputs", () => {
  const snap = makeValidSnapshot();
  delete (snap as any).inputs;
  const result = validateDraftSnapshotV1(snap);
  assert(result.ok === false, "Expected ok=false");
  if (!result.ok) {
    assert(result.code === "MISSING_FIELD", `Expected MISSING_FIELD, got ${result.code}`);
  }
});

test("rejects missing result", () => {
  const snap = makeValidSnapshot();
  delete (snap as any).result;
  const result = validateDraftSnapshotV1(snap);
  assert(result.ok === false, "Expected ok=false");
  if (!result.ok) {
    assert(result.code === "MISSING_FIELD", `Expected MISSING_FIELD, got ${result.code}`);
  }
});

test("rejects missing engine_version", () => {
  const snap = makeValidSnapshot({ engine_version: "" });
  const result = validateDraftSnapshotV1(snap);
  assert(result.ok === false, "Expected ok=false");
  if (!result.ok) {
    assert(result.code === "MISSING_FIELD", `Expected MISSING_FIELD, got ${result.code}`);
  }
});

test("rejects inputs_hash mismatch", () => {
  const snap = makeValidSnapshot({ inputs_hash: "deadbeef" });
  const result = validateDraftSnapshotV1(snap);
  assert(result.ok === false, "Expected ok=false");
  if (!result.ok) {
    assert(result.code === "HASH_MISMATCH", `Expected HASH_MISMATCH, got ${result.code}`);
  }
});

test("rejects result_hash mismatch", () => {
  const snap = makeValidSnapshot({ result_hash: "cafebabe" });
  const result = validateDraftSnapshotV1(snap);
  assert(result.ok === false, "Expected ok=false");
  if (!result.ok) {
    assert(result.code === "HASH_MISMATCH", `Expected HASH_MISMATCH, got ${result.code}`);
  }
});

test("rejects non-object payload (null)", () => {
  const result = validateDraftSnapshotV1(null);
  assert(result.ok === false, "Expected ok=false");
  if (!result.ok) {
    assert(result.code === "INVALID_TYPE", `Expected INVALID_TYPE, got ${result.code}`);
  }
});

test("rejects non-object payload (array)", () => {
  const result = validateDraftSnapshotV1([1, 2, 3]);
  assert(result.ok === false, "Expected ok=false");
  if (!result.ok) {
    assert(result.code === "INVALID_TYPE", `Expected INVALID_TYPE, got ${result.code}`);
  }
});

test("snapshot inputs/result preserved verbatim", () => {
  const inputs = { a: { b: [1, 2, 3] }, c: "test" };
  const result = { x: 42, y: { z: true } };
  const snap = makeValidSnapshot({
    inputs,
    result,
    inputs_hash: hash(inputs),
    result_hash: hash(result),
  });
  const validation = validateDraftSnapshotV1(snap);
  assert(validation.ok === true, "Expected ok=true");
  if (validation.ok) {
    assert(
      JSON.stringify(validation.snapshot.inputs) === JSON.stringify(inputs),
      "inputs were mutated",
    );
    assert(
      JSON.stringify(validation.snapshot.result) === JSON.stringify(result),
      "result was mutated",
    );
  }
});

test("idempotent: same snapshot validates identically twice", () => {
  const snap = makeValidSnapshot();
  const r1 = validateDraftSnapshotV1(snap);
  const r2 = validateDraftSnapshotV1(snap);
  assert(r1.ok === true && r2.ok === true, "Both should pass");
  if (r1.ok && r2.ok) {
    assert(
      JSON.stringify(r1.snapshot) === JSON.stringify(r2.snapshot),
      "Results differ",
    );
  }
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
