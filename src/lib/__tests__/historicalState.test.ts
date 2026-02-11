import { computeHistoricalState } from "../historicalState";

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

const DEAL = "aaaaaaaa-bbbb-1234-abcd-ef1234567890";
const SNAP_A = "11111111-2222-3333-4444-555555555555";
const SNAP_B = "66666666-7777-8888-9999-aaaaaaaaaaaa";

console.log("\n--- no selectedId (latest view) ---\n");

test("no selectedId → not historical", () => {
  const r = computeHistoricalState({ selectedId: null, latestId: SNAP_A, dealId: DEAL });
  assert(r.isHistorical === false, "should not be historical");
});

test("no selectedId → backToLatestHref points to deal", () => {
  const r = computeHistoricalState({ selectedId: null, latestId: SNAP_A, dealId: DEAL });
  assert(r.backToLatestHref === `/deal/${DEAL}`, `got ${r.backToLatestHref}`);
});

console.log("\n--- selectedId matches latestId ---\n");

test("selectedId === latestId → not historical", () => {
  const r = computeHistoricalState({ selectedId: SNAP_A, latestId: SNAP_A, dealId: DEAL });
  assert(r.isHistorical === false, "should not be historical");
});

console.log("\n--- selectedId differs from latestId ---\n");

test("selectedId !== latestId → historical", () => {
  const r = computeHistoricalState({ selectedId: SNAP_B, latestId: SNAP_A, dealId: DEAL });
  assert(r.isHistorical === true, "should be historical");
});

test("historical → backToLatestHref points to deal", () => {
  const r = computeHistoricalState({ selectedId: SNAP_B, latestId: SNAP_A, dealId: DEAL });
  assert(r.backToLatestHref === `/deal/${DEAL}`, `got ${r.backToLatestHref}`);
});

console.log("\n--- latestId is null (no snapshots) ---\n");

test("selectedId present but latestId null → historical", () => {
  const r = computeHistoricalState({ selectedId: SNAP_A, latestId: null, dealId: DEAL });
  assert(r.isHistorical === true, "should be historical");
});

test("both null → not historical", () => {
  const r = computeHistoricalState({ selectedId: null, latestId: null, dealId: DEAL });
  assert(r.isHistorical === false, "should not be historical");
});

console.log("\n--- all roles see same result ---\n");

test("helper is role-agnostic (same input → same output)", () => {
  const input = { selectedId: SNAP_B, latestId: SNAP_A, dealId: DEAL };
  const r1 = computeHistoricalState(input);
  const r2 = computeHistoricalState(input);
  assert(r1.isHistorical === r2.isHistorical, "deterministic");
  assert(r1.backToLatestHref === r2.backToLatestHref, "same href");
});

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);
if (failed > 0) process.exit(1);
