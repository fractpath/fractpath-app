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

console.log("\n--- Resume Route Contract Tests (Canonical-only v10) ---\n");

test("resume endpoint file exists at correct App Router path", () => {
  assert(fs.existsSync(ROUTE_PATH), "route.ts must exist");
});

test("resume route exports POST handler", () => {
  assert(content.includes("export async function POST"), "must export POST");
});

test("resume route checks authentication", () => {
  assert(content.includes("supabase.auth.getUser()"), "must check auth");
  assert(
    content.includes("Unauthorized") && content.includes("401"),
    "must return 401",
  );
});

test("resume route validates token parameter", () => {
  assert(content.includes("token is required"), "must validate token");
});

test("resume route queries draft_tokens table by token", () => {
  assert(
    content.includes('from("draft_tokens")') && content.includes('.eq("token"'),
    "must query draft_tokens by token",
  );
});

test("resume route selects required draft_tokens columns", () => {
  assert(content.includes("snapshot_json"), "must select snapshot_json");
  assert(content.includes("expires_at"), "must select expires_at");
  assert(content.includes("redeemed_at"), "must select redeemed_at");
  assert(
    content.includes("redeemed_by_user_id"),
    "must select redeemed_by_user_id",
  );
});

test("resume route returns 410 for expired token", () => {
  assert(
    content.includes("Token has expired") && content.includes("410"),
    "must return 410 for expired token",
  );
});

test("resume route handles already-redeemed tokens with idempotent deal lookup", () => {
  assert(
    content.includes("draft.redeemed_at") || content.includes("redeemed_at"),
    "must check redeemed state",
  );
  assert(
    content.includes("source_ref") &&
      content.includes("draft_token:${draft.id}"),
    "must look up deal by source_ref",
  );
  assert(
    content.includes("status: 200"),
    "must return 200 when existing deal found",
  );
  assert(
    content.includes("409"),
    "must return 409 when redeemed but no deal exists",
  );
});

test("resume route enforces canonical payload (canonicalSnapshot preferred; canonicalInputs fallback)", () => {
  // Must reference canonical handoff keys
  assert(
    content.includes("canonicalSnapshot") ||
      content.includes("canonicalInputs"),
    "must reference canonicalSnapshot or canonicalInputs",
  );

  // Must NOT use legacy DraftSnapshotV1 gates anymore
  assert(
    !content.includes("validateDraftSnapshotV1"),
    "must not use validateDraftSnapshotV1",
  );
  assert(
    !content.includes("mapDraftToDealSnapshot"),
    "must not use mapDraftToDealSnapshot",
  );

  // Must support compute fallback
  assert(
    content.includes("computeDeal("),
    "must call computeDeal for canonicalInputs fallback",
  );

  // Must hard fail to prevent drift
  assert(
    content.includes("Missing canonical payload") && content.includes("422"),
    "must 422 when canonicalSnapshot/canonicalInputs missing",
  );
});

test("resume route ensures canonical envelope via ensureScenario", () => {
  assert(
    content.includes("ensureScenario("),
    "must call ensureScenario to enforce { deal_terms, scenario }",
  );
});

test("resume route persists a canonical v10 snapshot", () => {
  // Either passthrough or computed snapshot must be canonical-shaped
  assert(content.includes("schema_version"), "must set schema_version");
  assert(content.includes("compute_version"), "must store compute_version");
  assert(content.includes("inputs"), "must store inputs");
  assert(content.includes("outputs"), "must store outputs");

  // Compute path sets computed_at explicitly; passthrough may already have it
  assert(
    content.includes("computed_at"),
    "must store computed_at (at least on compute path)",
  );
});

test("resume route persists snapshot via insertDealSnapshot(service, dealId, userId, ...)", () => {
  assert(
    content.includes("insertDealSnapshot("),
    "must call insertDealSnapshot",
  );
  assert(
    content.includes("service as any") ||
      content.includes("insertDealSnapshot(service"),
    "must pass service client to insertDealSnapshot",
  );
  assert(content.includes("newDeal.id"), "must pass newDeal.id");
  assert(content.includes("user.id"), "must pass user.id");
});

test("resume route creates deal with source_ref = draft_token:<id>", () => {
  assert(
    content.includes("owner_user_id: user.id") &&
      content.includes('.from("deals")') &&
      content.includes(".insert("),
    "must insert deal owned by user",
  );
  assert(
    content.includes("source_ref: `draft_token:${draft.id}`"),
    "source_ref must use draft_token: prefix",
  );
});

test("resume route creates OWNER grant", () => {
  assert(
    content.includes('"OWNER"') && content.includes("deal_access_grants"),
    "must grant OWNER on new deal",
  );
});

test("resume route records audit events (DEAL_CREATED and snapshot event)", () => {
  assert(
    content.includes('"DEAL_CREATED"') && content.includes("deal_events"),
    "must record DEAL_CREATED event",
  );
  // Either computed or imported snapshot event is acceptable
  assert(
    content.includes('"DEAL_SNAPSHOT_COMPUTED"') ||
      content.includes('"DEAL_SNAPSHOT_IMPORTED"'),
    "must record a snapshot event (computed or imported)",
  );
});

test("resume route attempts to redeem draft token (best-effort)", () => {
  assert(
    content.includes(".update(") && content.includes("redeemed_at"),
    "must attempt update redeemed_at",
  );
  assert(
    content.includes("redeemed_by_user_id: user.id"),
    "must attempt update redeemed_by_user_id",
  );
  assert(
    content.includes('.is("redeemed_at", null)'),
    "must use conditional update where redeemed_at is null",
  );
});

test("resume route returns expected response shape (ok, deal_id, redirect_url)", () => {
  assert(content.includes("ok: true"), "must return ok: true on success");
  assert(content.includes("deal_id: newDeal.id"), "must return deal_id");
  assert(content.includes("redirect_url"), "must return redirect_url");
  assert(content.includes("status: 201"), "must return 201 on success");
});

test("resume route does not break existing response contract (ok field)", () => {
  assert(
    content.includes("ok: true") && content.includes("ok: false"),
    "must include ok field in responses",
  );
});

console.log(
  `\n${passed} passed, ${failed} failed out of ${passed + failed} tests\n`,
);
if (failed > 0) process.exit(1);
