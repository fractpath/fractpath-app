import { getVersionBadgeStyle } from "../versionCardHelpers";

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

console.log("\n--- getVersionBadgeStyle ---\n");

test("OFFER → blue badge with 'Offer' label", () => {
  const result = getVersionBadgeStyle("OFFER");
  assert(result.label === "Offer", `expected 'Offer' but got '${result.label}'`);
  assert(result.className.includes("blue"), `expected blue class but got '${result.className}'`);
});

test("COUNTER → purple badge with 'Counter' label", () => {
  const result = getVersionBadgeStyle("COUNTER");
  assert(result.label === "Counter", `expected 'Counter' but got '${result.label}'`);
  assert(result.className.includes("purple"), `expected purple class but got '${result.className}'`);
});

test("ACCEPT → green badge with 'Accepted' label", () => {
  const result = getVersionBadgeStyle("ACCEPT");
  assert(result.label === "Accepted", `expected 'Accepted' but got '${result.label}'`);
  assert(result.className.includes("green"), `expected green class but got '${result.className}'`);
});

test("REJECT → red badge with 'Rejected' label", () => {
  const result = getVersionBadgeStyle("REJECT");
  assert(result.label === "Rejected", `expected 'Rejected' but got '${result.label}'`);
  assert(result.className.includes("red"), `expected red class but got '${result.className}'`);
});

test("undefined → gray fallback with 'Version' label", () => {
  const result = getVersionBadgeStyle(undefined);
  assert(result.label === "Version", `expected 'Version' but got '${result.label}'`);
  assert(result.className.includes("gray"), `expected gray class but got '${result.className}'`);
});

test("unknown string → gray fallback", () => {
  const result = getVersionBadgeStyle("SOMETHING_ELSE");
  assert(result.label === "Version", `expected 'Version' but got '${result.label}'`);
  assert(result.className.includes("gray"), `expected gray class but got '${result.className}'`);
});

test("empty string → gray fallback", () => {
  const result = getVersionBadgeStyle("");
  assert(result.label === "Version", `expected 'Version' but got '${result.label}'`);
});

test("version_type flows through timeline entry", () => {
  const offerBadge = getVersionBadgeStyle("OFFER");
  const counterBadge = getVersionBadgeStyle("COUNTER");
  assert(offerBadge.label !== counterBadge.label, "OFFER and COUNTER should have different labels");
  assert(offerBadge.className !== counterBadge.className, "OFFER and COUNTER should have different classes");
});

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);
if (failed > 0) process.exit(1);
