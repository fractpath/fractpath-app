import { shouldRenderDealCalculator } from "../dealCalculatorGating";

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

console.log("\n--- shouldRenderDealCalculator ---\n");

test("OWNER + latest → true", () => {
  assert(shouldRenderDealCalculator({ role: "OWNER", isLatest: true }) === true, "should be true");
});

test("OWNER + historical → false", () => {
  assert(shouldRenderDealCalculator({ role: "OWNER", isLatest: false }) === false, "should be false");
});

test("VIEWER + latest → false", () => {
  assert(shouldRenderDealCalculator({ role: "VIEWER", isLatest: true }) === false, "should be false");
});

test("VIEWER + historical → false", () => {
  assert(shouldRenderDealCalculator({ role: "VIEWER", isLatest: false }) === false, "should be false");
});

test("COUNTERPARTY + latest → false", () => {
  assert(shouldRenderDealCalculator({ role: "COUNTERPARTY", isLatest: true }) === false, "should be false");
});

test("COUNTERPARTY + historical → false", () => {
  assert(shouldRenderDealCalculator({ role: "COUNTERPARTY", isLatest: false }) === false, "should be false");
});

test("empty role → false", () => {
  assert(shouldRenderDealCalculator({ role: "", isLatest: true }) === false, "should be false");
});

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);
if (failed > 0) process.exit(1);
