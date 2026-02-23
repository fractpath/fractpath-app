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

console.log("\n--- APP-003: Role Gating Hardening ---\n");

const fs = require("fs");

test("authz module exports isRealtorPersona", () => {
  const src = fs.readFileSync("src/lib/authz.ts", "utf8");
  assert(src.includes("export function isRealtorPersona"), "should export isRealtorPersona");
});

test("authz module exports assertNotRealtor", () => {
  const src = fs.readFileSync("src/lib/authz.ts", "utf8");
  assert(src.includes("export function assertNotRealtor"), "should export assertNotRealtor");
});

test("authz module exports assertOwnerGrant", () => {
  const src = fs.readFileSync("src/lib/authz.ts", "utf8");
  assert(src.includes("export function assertOwnerGrant"), "should export assertOwnerGrant");
});

test("authz checks both role and persona metadata fields", () => {
  const src = fs.readFileSync("src/lib/authz.ts", "utf8");
  assert(src.includes("user_metadata.role") || src.includes("user_metadata?.role"), "should check user_metadata.role");
  assert(src.includes("user_metadata.persona") || src.includes("user_metadata?.persona"), "should check user_metadata.persona");
});

test("snapshot/compute route uses assertNotRealtor", () => {
  const src = fs.readFileSync(
    "src/app/api/deals/[dealId]/snapshot/compute/route.ts",
    "utf8",
  );
  assert(src.includes("assertNotRealtor"), "compute route should call assertNotRealtor");
  assert(src.includes("assertOwnerGrant"), "compute route should call assertOwnerGrant");
});

test("snapshot POST route uses assertNotRealtor", () => {
  const src = fs.readFileSync(
    "src/app/api/deals/[dealId]/snapshot/route.ts",
    "utf8",
  );
  assert(src.includes("assertNotRealtor"), "snapshot POST route should call assertNotRealtor");
});

test("fork route uses assertNotRealtor", () => {
  const src = fs.readFileSync(
    "src/app/api/deals/[dealId]/fork/route.ts",
    "utf8",
  );
  assert(src.includes("assertNotRealtor"), "fork route should call assertNotRealtor");
});

test("share route uses assertNotRealtor", () => {
  const src = fs.readFileSync(
    "src/app/api/deals/[dealId]/share/route.ts",
    "utf8",
  );
  assert(src.includes("assertNotRealtor"), "share route should call assertNotRealtor");
});

test("all mutation routes import from @/lib/authz", () => {
  const routes = [
    "src/app/api/deals/[dealId]/snapshot/compute/route.ts",
    "src/app/api/deals/[dealId]/snapshot/route.ts",
    "src/app/api/deals/[dealId]/fork/route.ts",
    "src/app/api/deals/[dealId]/share/route.ts",
  ];
  for (const r of routes) {
    const src = fs.readFileSync(r, "utf8");
    assert(
      src.includes("from \"@/lib/authz\""),
      `${r} should import from @/lib/authz`,
    );
  }
});

test("deal page hides ShareDealCard for realtor", () => {
  const src = fs.readFileSync("src/app/deal/[dealId]/page.tsx", "utf8");
  const shareBlock = src.match(/ShareDealCard/);
  assert(!!shareBlock, "page should render ShareDealCard");
  assert(
    src.includes('userPersona !== "realtor"'),
    "page should check userPersona !== realtor for gating",
  );
});

test("deal page hides RecomputeSnapshotButton for realtor", () => {
  const src = fs.readFileSync("src/app/deal/[dealId]/page.tsx", "utf8");
  const jsxIdx = src.indexOf("<RecomputeSnapshotButton");
  assert(jsxIdx > -1, "page should render RecomputeSnapshotButton in JSX");
  const preceding = src.slice(Math.max(0, jsxIdx - 200), jsxIdx);
  assert(
    preceding.includes('userPersona !== "realtor"'),
    "RecomputeSnapshotButton JSX should be gated by realtor check",
  );
});

console.log(`\n--- results: ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
