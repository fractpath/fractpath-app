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

console.log("\n--- compute route contract ---\n");

test("compute endpoint file exists", () => {
  const fs = require("fs");
  assert(
    fs.existsSync("src/api/deals/[dealId]/snapshot/compute/route.ts"),
    "compute route.ts should exist",
  );
});

test("compute route exports POST handler", () => {
  const content = require("fs").readFileSync(
    "src/api/deals/[dealId]/snapshot/compute/route.ts",
    "utf-8",
  );
  assert(content.includes("export async function POST"), "should export POST");
});

test("compute route is OWNER-only", () => {
  const content = require("fs").readFileSync(
    "src/api/deals/[dealId]/snapshot/compute/route.ts",
    "utf-8",
  );
  assert(content.includes("OWNER only"), "should enforce OWNER only");
  assert(content.includes("403"), "should return 403 for non-owners");
});

test("compute route requires inputs object", () => {
  const content = require("fs").readFileSync(
    "src/api/deals/[dealId]/snapshot/compute/route.ts",
    "utf-8",
  );
  assert(
    content.includes("inputs is required"),
    "should validate inputs param",
  );
});

test("compute route imports computeDeal adapter", () => {
  const content = require("fs").readFileSync(
    "src/api/deals/[dealId]/snapshot/compute/route.ts",
    "utf-8",
  );
  assert(
    content.includes("computeDeal") && content.includes("computeAdapter"),
    "should import compute adapter",
  );
});

test("compute route persists snapshot via insertDealSnapshot", () => {
  const content = require("fs").readFileSync(
    "src/api/deals/[dealId]/snapshot/compute/route.ts",
    "utf-8",
  );
  assert(
    content.includes("insertDealSnapshot"),
    "should use insertDealSnapshot for persistence",
  );
});

test("compute route includes terms_version in snapshot", () => {
  const content = require("fs").readFileSync(
    "src/api/deals/[dealId]/snapshot/compute/route.ts",
    "utf-8",
  );
  assert(
    content.includes("terms_version") && content.includes("contract_version: terms_version"),
    "should map terms_version to contract_version",
  );
});

test("compute route stores computed_at and computed_by", () => {
  const content = require("fs").readFileSync(
    "src/api/deals/[dealId]/snapshot/compute/route.ts",
    "utf-8",
  );
  assert(
    content.includes("computed_at") && content.includes("computed_by"),
    "should store compute metadata",
  );
});

test("compute route returns summary in response", () => {
  const content = require("fs").readFileSync(
    "src/api/deals/[dealId]/snapshot/compute/route.ts",
    "utf-8",
  );
  assert(
    content.includes("summary: outputs.summary"),
    "should return summary in response",
  );
});

test("compute route records audit event", () => {
  const content = require("fs").readFileSync(
    "src/api/deals/[dealId]/snapshot/compute/route.ts",
    "utf-8",
  );
  assert(
    content.includes("DEAL_SNAPSHOT_COMPUTED"),
    "should record compute event",
  );
});

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);
if (failed > 0) process.exit(1);
