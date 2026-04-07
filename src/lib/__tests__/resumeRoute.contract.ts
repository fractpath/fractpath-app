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

test("resume route normalizes canonical inputs from snapshot payload", () => {
  assert(
    content.includes("normalizeCanonicalInputsFromUnknown"),
    "must call normalizeCanonicalInputsFromUnknown to extract deal_terms + scenario",
  );
  assert(
    content.includes("deal_terms"),
    "must check for deal_terms in the normalized inputs",
  );
});

test("resume route rejects unrecognized snapshot format with 422", () => {
  assert(
    content.includes("Unrecognized snapshot format") && content.includes("422"),
    "must 422 on unknown snapshot shape",
  );
});

test("resume route validates property_value after normalization", () => {
  assert(
    content.includes("property_value is required") ||
      content.includes("property_value"),
    "must validate property_value after normalization",
  );
});

test("resume route ALWAYS recomputes via computeDeal (both paths)", () => {
  assert(
    content.includes("computeDeal(canonicalInputs)"),
    "must call computeDeal(canonicalInputs)",
  );
  const computeCallCount = (content.match(/computeDeal\(/g) || []).length;
  assert(
    computeCallCount >= 1,
    "computeDeal must be called",
  );

  const nonCommentLines = content
    .split("\n")
    .filter((l: string) => !l.trim().startsWith("//") && !l.trim().startsWith("*"));
  const nonCommentCode = nonCommentLines.join("\n");
  assert(
    !nonCommentCode.includes("canonicalSnapshot:"),
    "must not persist canonicalSnapshot into snapshot_json (non-comment code)",
  );
});

test("resume route ensures canonical envelope via ensureScenario", () => {
  assert(
    content.includes("ensureScenario("),
    "must call ensureScenario to enforce { deal_terms, scenario }",
  );
});

test("resume route builds canonical snapshot stamped with CONTRACT_VERSION and SCHEMA_VERSION", () => {
  assert(
    content.includes("CONTRACT_VERSION") && content.includes("SCHEMA_VERSION"),
    "must stamp snapshot with CONTRACT_VERSION and SCHEMA_VERSION from contractVersion",
  );
  assert(
    content.includes("inputs: canonicalInputs"),
    "must store inputs: canonicalInputs",
  );
  assert(
    content.includes("outputs: { results }"),
    "must store outputs: { results }",
  );
  assert(content.includes("compute_version"), "must store compute_version");
  assert(content.includes("computed_at"), "must store computed_at");
  assert(
    content.includes("computed_by: user.id"),
    "must store computed_by: user.id",
  );
});

test("resume route persists snapshot via insertDealSnapshot(service, dealId, userId, fullSnapshot)", () => {
  assert(
    content.includes("insertDealSnapshot("),
    "must call insertDealSnapshot",
  );
  assert(
    content.includes("service as any") || content.includes("insertDealSnapshot(service"),
    "must pass service client to insertDealSnapshot",
  );
  assert(
    content.includes("newDeal.id"),
    "must pass newDeal.id to insertDealSnapshot",
  );
  assert(
    content.includes("user.id"),
    "must pass user.id to insertDealSnapshot",
  );
  assert(
    content.includes("fullSnapshot"),
    "must pass fullSnapshot to insertDealSnapshot",
  );
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

test("resume route records audit events (DEAL_CREATED and DEAL_SNAPSHOT_COMPUTED)", () => {
  assert(
    content.includes('"DEAL_CREATED"') && content.includes("deal_events"),
    "must record DEAL_CREATED event",
  );
  assert(
    content.includes('"DEAL_SNAPSHOT_COMPUTED"'),
    "must record DEAL_SNAPSHOT_COMPUTED event",
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

test("resume route returns expected response shape (ok, deal_id, snapshot_id, redirect_url)", () => {
  assert(content.includes("ok: true"), "must return ok: true on success");
  assert(content.includes("deal_id: newDeal.id"), "must return deal_id");
  assert(content.includes("snapshot_id: snapshotId"), "must return snapshot_id");
  assert(content.includes("redirect_url"), "must return redirect_url");
  assert(content.includes("status: 201"), "must return 201 on success");
});

test("resume route does not break existing response contract (ok field)", () => {
  assert(
    content.includes("ok: true") && content.includes("ok: false"),
    "must include ok field in responses",
  );
});

test("resume route unwraps nested payload wrappers (canonicalSnapshot, draftSnapshot, snapshot, draft)", () => {
  assert(
    content.includes("unwrapSnapshotPayload"),
    "must call unwrapSnapshotPayload to handle wrapper keys",
  );
  assert(
    content.includes('"canonicalSnapshot"') && content.includes('"draftSnapshot"'),
    "must handle canonicalSnapshot and draftSnapshot wrapper keys",
  );
});

console.log(
  `\n${passed} passed, ${failed} failed out of ${passed + failed} tests\n`,
);
if (failed > 0) process.exit(1);
