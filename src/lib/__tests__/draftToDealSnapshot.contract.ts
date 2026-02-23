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

console.log(
  "\n=== Draft -> Canonical Inputs Mapping Tests (v10 canonical envelope) ===\n",
);

test("returns { inputs: { deal_terms, scenario } } envelope", () => {
  const draft = {
    inputs: { property_value: 500000, upfront_payment: 50000 },
  };

  const mapped = mapDraftToDealSnapshot(draft as any);

  assert(isRecord(mapped), "mapped is object");
  assert(isRecord((mapped as any).inputs), "mapped.inputs is object");
  assert(
    isRecord((mapped as any).inputs.deal_terms),
    "inputs.deal_terms is object",
  );
  assert(
    isRecord((mapped as any).inputs.scenario),
    "inputs.scenario is object",
  );
});

test("wraps flat draft.inputs as deal_terms when no deal_terms nesting exists", () => {
  const draft = {
    inputs: { property_value: 500000, upfront_payment: 50000 },
  };

  const mapped = mapDraftToDealSnapshot(draft as any);
  const dt = (mapped as any).inputs.deal_terms;

  assert(dt.property_value === 500000, "property_value preserved");
  assert(dt.upfront_payment === 50000, "upfront_payment preserved");
});

test("preserves already-nested inputs.deal_terms", () => {
  const draft = {
    inputs: { deal_terms: { property_value: 600000 } },
  };

  const mapped = mapDraftToDealSnapshot(draft as any);
  const dt = (mapped as any).inputs.deal_terms;

  assert(isRecord(dt), "deal_terms is object");
  assert(dt.property_value === 600000, "nested property_value preserved");
});

test("preserves inputs.scenario when present", () => {
  const draft = {
    inputs: {
      deal_terms: { property_value: 500000 },
      scenario: { exit_year: 5, annual_appreciation: 0.03 },
    },
  };

  const mapped = mapDraftToDealSnapshot(draft as any);
  const sc = (mapped as any).inputs.scenario;

  assert(isRecord(sc), "scenario is object");
  assert(sc.exit_year === 5, "exit_year preserved");
  assert(sc.annual_appreciation === 0.03, "annual_appreciation preserved");
});

test("falls back to top-level draft.scenario when inputs.scenario is missing", () => {
  const draft = {
    inputs: { deal_terms: { property_value: 500000 } },
    scenario: { exit_year: 7 },
  };

  const mapped = mapDraftToDealSnapshot(draft as any);
  const sc = (mapped as any).inputs.scenario;

  assert(isRecord(sc), "scenario is object");
  assert(sc.exit_year === 7, "exit_year preserved from top-level scenario");
});

test("defaults scenario to empty object when absent (ensureScenario fills later)", () => {
  const draft = {
    inputs: { deal_terms: { property_value: 500000 } },
  };

  const mapped = mapDraftToDealSnapshot(draft as any);
  const sc = (mapped as any).inputs.scenario;

  assert(isRecord(sc), "scenario is object");
  assert(Object.keys(sc).length === 0, "scenario should be empty object");
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
