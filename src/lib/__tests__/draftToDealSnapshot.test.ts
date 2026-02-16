import { mapDraftToDealSnapshot } from "../draftToDealSnapshot";

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

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

console.log("\n=== DraftSnapshotV1 -> FullDealSnapshotV1 Mapping Tests (canonical-only v10) ===\n");

test("maps draft fields to canonical v10 shape", () => {
  const draft = {
    calculator_schema_version: "1.0.0",
    inputs: { home_value: 500000, equity_pct: 15 },
    result: { monthly_payment: 1200, total_equity: 75000 },
    engine_version: "0.3.0",
  };
  const result = mapDraftToDealSnapshot(draft);

  assert(result.contract_version === "1.0.0", "contract_version from calculator_schema_version");
  assert(result.schema_version === "10", "schema_version is 10");
  assert(isRecord(result.inputs), "inputs is object");
  assert(isRecord((result.inputs as any).deal_terms), "inputs.deal_terms exists");
  assert((result.inputs as any).deal_terms.home_value === 500000, "deal_terms.home_value preserved");
  assert(isRecord(result.outputs), "outputs is object");
  assert(isRecord((result.outputs as any).results), "outputs.results exists");
  assert((result.outputs as any).results.monthly_payment === 1200, "results.monthly_payment preserved");
});

test("uses contractVersionOverride when provided", () => {
  const draft = {
    calculator_schema_version: "1.0.0",
    inputs: { home_value: 500000 },
    result: { monthly_payment: 1200 },
  };
  const result = mapDraftToDealSnapshot(draft, "2.0.0");
  assert(result.contract_version === "2.0.0", "expected override 2.0.0, got " + result.contract_version);
});

test("falls back to calculator_schema_version for contract_version", () => {
  const draft = {
    calculator_schema_version: "3.5.0",
    inputs: { home_value: 500000 },
    result: { monthly_payment: 1200 },
  };
  const result = mapDraftToDealSnapshot(draft);
  assert(result.contract_version === "3.5.0", "expected 3.5.0, got " + result.contract_version);
});

test("defaults contract_version to 10.0.0 when no version provided", () => {
  const draft = {
    inputs: { home_value: 500000 },
    result: { monthly_payment: 1200 },
  };
  const result = mapDraftToDealSnapshot(draft);
  assert(result.contract_version === "10.0.0", "expected 10.0.0, got " + result.contract_version);
});

test("wraps flat inputs as deal_terms", () => {
  const draft = {
    inputs: { home_value: 500000, equity_pct: 15 },
    result: {},
  };
  const mapped = mapDraftToDealSnapshot(draft);
  const dt = (mapped.inputs as any).deal_terms;
  assert(isRecord(dt), "deal_terms should be object");
  assert(dt.home_value === 500000, "home_value");
  assert(dt.equity_pct === 15, "equity_pct");
});

test("preserves already-nested deal_terms", () => {
  const draft = {
    inputs: { deal_terms: { home_value: 500000 } },
    result: {},
  };
  const mapped = mapDraftToDealSnapshot(draft);
  const dt = (mapped.inputs as any).deal_terms;
  assert(isRecord(dt), "deal_terms should be object");
  assert(dt.home_value === 500000, "home_value preserved from nested");
});

test("preserves opaque extra metadata fields", () => {
  const draft = {
    inputs: { home_value: 500000 },
    result: { monthly_payment: 1200 },
    engine_version: "0.3.0",
    some_meta: { custom: true },
  };
  const mapped = mapDraftToDealSnapshot(draft);
  assert(mapped.engine_version === "0.3.0", "engine_version preserved");
  assert((mapped as any).some_meta?.custom === true, "custom meta preserved");
});

test("empty result maps to empty results object", () => {
  const draft = {
    inputs: { home_value: 500000 },
  };
  const mapped = mapDraftToDealSnapshot(draft);
  const results = (mapped.outputs as any).results;
  assert(isRecord(results), "results should be object");
  assert(Object.keys(results).length === 0, "results should be empty");
});

console.log("\n" + passed + " passed, " + failed + " failed out of " + (passed + failed) + " tests\n");
if (failed > 0) process.exit(1);
