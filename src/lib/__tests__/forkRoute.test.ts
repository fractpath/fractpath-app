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

console.log("\n--- fork route contract ---\n");

test("fork endpoint file exists", () => {
  const fs = require("fs");
  assert(
    fs.existsSync("src/api/deals/[dealId]/fork/route.ts"),
    "fork route.ts should exist",
  );
});

test("fork route exports POST handler", () => {
  const content = require("fs").readFileSync(
    "src/api/deals/[dealId]/fork/route.ts",
    "utf-8",
  );
  assert(content.includes("export async function POST"), "should export POST");
});

test("fork route checks auth", () => {
  const content = require("fs").readFileSync(
    "src/api/deals/[dealId]/fork/route.ts",
    "utf-8",
  );
  assert(content.includes("Unauthorized"), "should check for unauthorized");
});

test("fork route prevents OWNER self-fork", () => {
  const content = require("fs").readFileSync(
    "src/api/deals/[dealId]/fork/route.ts",
    "utf-8",
  );
  assert(
    content.includes("OWNER cannot fork their own deal"),
    "should prevent owner self-fork",
  );
});

test("fork route creates new deal with OWNER grant", () => {
  const content = require("fs").readFileSync(
    "src/api/deals/[dealId]/fork/route.ts",
    "utf-8",
  );
  assert(
    content.includes('role: "OWNER"') && content.includes("deal_access_grants"),
    "should create OWNER grant on new deal",
  );
});

test("fork route copies baseline snapshot", () => {
  const content = require("fs").readFileSync(
    "src/api/deals/[dealId]/fork/route.ts",
    "utf-8",
  );
  assert(
    content.includes("getLatestDealSnapshot") && content.includes("snapshot_json"),
    "should copy baseline snapshot from source deal",
  );
});

test("fork route records DEAL_CREATED event", () => {
  const content = require("fs").readFileSync(
    "src/api/deals/[dealId]/fork/route.ts",
    "utf-8",
  );
  assert(
    content.includes("DEAL_CREATED") && content.includes("forked_from_deal_id"),
    "should record fork event",
  );
});

test("fork route returns new deal_id and redirect", () => {
  const content = require("fs").readFileSync(
    "src/api/deals/[dealId]/fork/route.ts",
    "utf-8",
  );
  assert(content.includes("deal_id") && content.includes("redirect_url"), "should return deal_id and redirect_url");
});

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);
if (failed > 0) process.exit(1);
