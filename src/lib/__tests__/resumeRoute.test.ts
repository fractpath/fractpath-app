const fs = require("fs");

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

const ROUTE_PATH = "src/app/api/deals/resume/route.ts";
const content = fs.readFileSync(ROUTE_PATH, "utf-8");

console.log("\n--- Resume Route Contract Tests ---\n");

test("resume endpoint file exists at correct App Router path", () => {
  assert(fs.existsSync(ROUTE_PATH), "route.ts must exist");
});

test("resume route exports POST handler", () => {
  assert(content.includes("export async function POST"), "must export POST");
});

test("resume route checks authentication", () => {
  assert(content.includes("supabase.auth.getUser()"), "must check auth");
  assert(content.includes("Unauthorized") && content.includes("401"), "must return 401");
});

test("resume route validates token parameter", () => {
  assert(content.includes("token is required"), "must validate token");
});

test("resume route looks up draft by token", () => {
  assert(
    content.includes('from("draft_snapshots")') && content.includes('.eq("token"'),
    "must query draft_snapshots by token",
  );
});

test("resume route handles already-redeemed drafts idempotently", () => {
  assert(
    content.includes("redeemed_deal_id"),
    "must check redeemed_deal_id for idempotent redeem",
  );
  assert(
    content.includes("status: 200"),
    "must return 200 for already-redeemed",
  );
});

test("resume route has canonical_snapshot branch (no recompute)", () => {
  assert(
    content.includes("canonicalSnapshot") && content.includes('"canonical_snapshot"'),
    "must detect canonicalSnapshot in payload",
  );
  assert(
    content.includes("isValidCanonicalSnapshot"),
    "must validate canonical snapshot shape",
  );
});

test("canonical branch: persists compute_version as contract_version", () => {
  assert(
    content.includes("contract_version: cs.compute_version"),
    "must map compute_version → contract_version",
  );
});

test("canonical branch: persists computed_at from canonical payload", () => {
  assert(
    content.includes("computed_at: cs.computed_at"),
    "must preserve original computed_at",
  );
});

test("canonical branch: preserves all canonical fields via opaque spread", () => {
  assert(
    content.includes("...cs"),
    "must spread canonical snapshot to preserve all opaque fields (assumptions, etc.)",
  );
});

test("canonical branch: marks snapshot_source = canonical_snapshot", () => {
  assert(
    content.includes('snapshot_source: snapshotSource') &&
    content.includes('"canonical_snapshot"'),
    "must set snapshot_source to canonical_snapshot",
  );
});

test("canonical branch: does NOT call computeDeal", () => {
  const canonicalBlock = content.slice(
    content.indexOf("isValidCanonicalSnapshot(canonicalSnapshot)"),
    content.indexOf("} else {"),
  );
  assert(
    !canonicalBlock.includes("computeDeal("),
    "canonical path must not call computeDeal",
  );
});

test("app_compute branch: calls computeDeal from adapter", () => {
  assert(
    content.includes('from "@/lib/computeAdapter"') && content.includes("computeDeal"),
    "must import and call computeDeal",
  );
});

test("app_compute branch: validates draft via validateDraftSnapshotV1", () => {
  assert(
    content.includes("validateDraftSnapshotV1(draftPayload)"),
    "must validate draft before compute",
  );
});

test("app_compute branch: maps draft via mapDraftToDealSnapshot", () => {
  assert(
    content.includes("mapDraftToDealSnapshot"),
    "must map draft to deal snapshot format",
  );
});

test("app_compute branch: marks snapshot_source = app_compute", () => {
  assert(
    content.includes('"app_compute"'),
    "must set snapshot_source to app_compute",
  );
});

test("both branches: persist deal_terms_defaults_used", () => {
  const matches = content.match(/deal_terms_defaults_used/g);
  assert(
    matches !== null && matches.length >= 3,
    "must reference deal_terms_defaults_used in payload extraction + both snapshot objects",
  );
});

test("resume route creates deal with owner grant", () => {
  assert(
    content.includes('owner_user_id: user.id') &&
    content.includes('.from("deals")') &&
    content.includes(".insert("),
    "must insert deal owned by user",
  );
  assert(
    content.includes('"OWNER"') && content.includes("deal_access_grants"),
    "must grant OWNER on new deal",
  );
});

test("resume route persists snapshot via insertDealSnapshot", () => {
  assert(content.includes("insertDealSnapshot"), "must use insertDealSnapshot");
});

test("resume route records DEAL_CREATED audit event", () => {
  assert(
    content.includes('"DEAL_CREATED"') && content.includes("deal_events"),
    "must record audit event",
  );
});

test("resume route audit event includes snapshot_source", () => {
  assert(
    content.includes("snapshot_source: snapshotSource") ||
    content.includes("snapshot_source"),
    "audit event payload must include snapshot_source",
  );
});

test("resume route marks draft as redeemed", () => {
  assert(
    content.includes(".update(") && content.includes("redeemed_deal_id"),
    "must update draft_snapshots.redeemed_deal_id",
  );
});

test("resume route returns expected response shape (ok, deal_id, redirect_url)", () => {
  assert(content.includes("deal_id: newDeal.id"), "must return deal_id");
  assert(content.includes("redirect_url"), "must return redirect_url");
  assert(content.includes("status: 201"), "must return 201 on success");
});

test("resume route does not break existing response contract (ok field)", () => {
  assert(
    content.includes("ok: true") && content.includes("ok: false"),
    "must return ok field in responses",
  );
});

test("isValidCanonicalSnapshot validates required fields", () => {
  assert(content.includes("compute_version"), "must validate compute_version");
  assert(content.includes("computed_at"), "must validate computed_at");
  assert(content.includes("c.inputs"), "must validate inputs");
  assert(content.includes("c.outputs"), "must validate outputs");
});

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);
if (failed > 0) process.exit(1);
