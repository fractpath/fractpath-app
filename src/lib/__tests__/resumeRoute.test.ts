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

test("resume route queries draft_tokens table", () => {
  assert(
    content.includes('from("draft_tokens")') && content.includes('.eq("token"'),
    "must query draft_tokens by token",
  );
});

test("resume route selects required draft_tokens columns", () => {
  assert(content.includes("expires_at"), "must select expires_at");
  assert(content.includes("redeemed_at"), "must select redeemed_at");
  assert(content.includes("redeemed_by_user_id"), "must select redeemed_by_user_id");
  assert(content.includes("snapshot_json"), "must select snapshot_json");
});

test("resume route returns 410 for expired token", () => {
  assert(
    content.includes("expires_at") && content.includes("410"),
    "must return 410 for expired token",
  );
  assert(
    content.includes("Token has expired") || content.includes("expired"),
    "must include expiry error message",
  );
});

test("resume route handles already-redeemed tokens", () => {
  assert(
    content.includes("draft.redeemed_at") || content.includes("redeemed_at"),
    "must check redeemed_at",
  );
  assert(
    content.includes("status: 200"),
    "must return 200 for already-redeemed with existing deal",
  );
  assert(
    content.includes("409"),
    "must return 409 for already-redeemed without deal",
  );
});

test("resume route looks up existing deal by source_ref for idempotent redeem", () => {
  assert(
    content.includes("draft_token:${draft.id}") && content.includes("source_ref"),
    "must look up deal by source_ref = draft_token:<id>",
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

test("canonical branch: persists canonicalSnapshot nested opaquely", () => {
  assert(
    content.includes("canonicalSnapshot: canonicalSnapshot"),
    "must nest canonicalSnapshot opaquely in snapshot payload",
  );
});

test("canonical branch: persists draft_snapshot_json nested verbatim", () => {
  assert(
    content.includes("draft_snapshot_json: draftPayload"),
    "must nest original draft snapshot_json verbatim",
  );
});

test("canonical branch: does NOT spread canonical fields into top-level", () => {
  const canonicalBlock = content.slice(
    content.indexOf("isValidCanonicalSnapshot(canonicalSnapshot)"),
    content.indexOf("} else {"),
  );
  assert(
    !canonicalBlock.includes("...cs"),
    "must NOT spread canonical fields into top-level snapshot (no silent spreading)",
  );
});

test("canonical branch: sets contract_version from cs.compute_version", () => {
  assert(
    content.includes("contract_version: cs.compute_version"),
    "must set contract_version from canonical compute_version",
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

test("app_compute branch: synthesizes canonicalSnapshot nested", () => {
  assert(
    content.includes("synthesizedCanonical"),
    "must synthesize canonical when absent",
  );
  assert(
    content.includes("canonicalSnapshot: synthesizedCanonical"),
    "must nest synthesized canonical in snapshot payload",
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

test("both branches: nest draft_snapshot_json", () => {
  const matches = content.match(/draft_snapshot_json: draftPayload/g);
  assert(
    matches !== null && matches.length >= 2,
    "must nest draft_snapshot_json in both canonical and compute branches",
  );
});

test("resume route creates deal with source_ref = draft_token:<id>", () => {
  assert(
    content.includes('owner_user_id: user.id') &&
    content.includes('.from("deals")') &&
    content.includes(".insert("),
    "must insert deal owned by user",
  );
  assert(
    content.includes("draft_token:${draft.id}"),
    "source_ref must use draft_token: prefix",
  );
});

test("resume route creates OWNER grant", () => {
  assert(
    content.includes('"OWNER"') && content.includes("deal_access_grants"),
    "must grant OWNER on new deal",
  );
});

test("resume route persists snapshot via insertDealSnapshot", () => {
  assert(content.includes("insertDealSnapshot"), "must use insertDealSnapshot");
});

test("resume route records DEAL_CREATED audit event (best-effort)", () => {
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

test("resume route updates draft_tokens with redeemed_at and redeemed_by_user_id", () => {
  assert(
    content.includes(".update(") && content.includes("redeemed_at"),
    "must update draft_tokens.redeemed_at",
  );
  assert(
    content.includes("redeemed_by_user_id: user.id"),
    "must update draft_tokens.redeemed_by_user_id",
  );
});

test("resume route uses race-safe conditional update (where redeemed_at is null)", () => {
  assert(
    content.includes('.is("redeemed_at", null)'),
    "must use conditional update where redeemed_at is null",
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
