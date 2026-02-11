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

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

const VALID_DECISIONS = ["ACCEPT", "REJECT"] as const;

type ParseResult =
  | { ok: true; decision: string; note: string | null }
  | { ok: false; error: string; status: number };

function parseDecisionBody(body: unknown): ParseResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid JSON body", status: 400 };
  }
  const b = body as Record<string, unknown>;

  const decision = typeof b.decision === "string"
    ? b.decision.trim().toUpperCase()
    : "";
  if (!decision || !(VALID_DECISIONS as readonly string[]).includes(decision)) {
    return { ok: false, error: "decision is required and must be ACCEPT or REJECT", status: 400 };
  }

  const note = typeof b.note === "string" ? b.note.trim() || null : null;

  return { ok: true, decision, note };
}

type RoleCheckResult =
  | { authorized: true }
  | { authorized: false; status: number; error: string };

function checkOwnerOnly(
  deal: { owner_user_id: string } | null,
  userId: string,
  grantRole: string | null,
): RoleCheckResult {
  if (!deal) return { authorized: false, status: 404, error: "Deal not found" };
  const isOwner = deal.owner_user_id === userId || grantRole === "OWNER";
  if (isOwner) return { authorized: true };
  return { authorized: false, status: 403, error: "Forbidden (OWNER only)" };
}

function checkVersionBelongsToDeal(
  version: { deal_id: string; version_type: string } | null,
  dealId: string,
): { valid: true } | { valid: false; error: string; status: number } {
  if (!version) {
    return { valid: false, error: "Version not found", status: 404 };
  }
  if (version.deal_id !== dealId) {
    return { valid: false, error: "Version does not belong to this deal", status: 422 };
  }
  return { valid: true };
}

function checkAlreadyDecided(
  existingDecisions: Array<{ meta?: { target_version_id?: string }; version_type: string }>,
  targetVersionId: string,
): { conflict: false } | { conflict: true; error: string; status: number } {
  const alreadyDecided = existingDecisions.some(
    (d) => d.meta?.target_version_id === targetVersionId,
  );
  if (alreadyDecided) {
    return { conflict: true, error: "This version has already been decided", status: 409 };
  }
  return { conflict: false };
}

console.log("\n=== Decision Route Tests ===\n");

console.log("--- body parsing ---\n");

test("null body returns 400", () => {
  const r = parseDecisionBody(null);
  assert(!r.ok, "should fail");
  if (!r.ok) assert(r.status === 400, "400");
});

test("missing decision returns 400", () => {
  const r = parseDecisionBody({ note: "some note" });
  assert(!r.ok, "should fail");
  if (!r.ok) assert(r.status === 400, "400");
});

test("invalid decision value returns 400", () => {
  const r = parseDecisionBody({ decision: "MAYBE" });
  assert(!r.ok, "should fail");
  if (!r.ok) assert(r.status === 400, "400");
});

test("ACCEPT is valid", () => {
  const r = parseDecisionBody({ decision: "ACCEPT" });
  assert(r.ok, "should pass");
  if (r.ok) assert(r.decision === "ACCEPT", "ACCEPT");
});

test("REJECT is valid", () => {
  const r = parseDecisionBody({ decision: "REJECT" });
  assert(r.ok, "should pass");
  if (r.ok) assert(r.decision === "REJECT", "REJECT");
});

test("case-insensitive decision parsing", () => {
  const r = parseDecisionBody({ decision: "accept" });
  assert(r.ok, "should pass");
  if (r.ok) assert(r.decision === "ACCEPT", "normalizes to ACCEPT");
});

test("note is optional and parsed", () => {
  const r = parseDecisionBody({ decision: "ACCEPT", note: "  Looks good  " });
  assert(r.ok, "should pass");
  if (r.ok) assert(r.note === "Looks good", "trimmed note");
});

test("empty note becomes null", () => {
  const r = parseDecisionBody({ decision: "REJECT", note: "   " });
  assert(r.ok, "should pass");
  if (r.ok) assert(r.note === null, "null note");
});

console.log("\n--- role gating ---\n");

test("no deal returns 404", () => {
  const r = checkOwnerOnly(null, "user-1", null);
  assert(!r.authorized, "not authorized");
  if (!r.authorized) assert(r.status === 404, "404");
});

test("OWNER by owner_user_id is authorized", () => {
  const r = checkOwnerOnly({ owner_user_id: "user-1" }, "user-1", null);
  assert(r.authorized, "should be authorized");
});

test("OWNER by grant is authorized", () => {
  const r = checkOwnerOnly({ owner_user_id: "user-1" }, "user-2", "OWNER");
  assert(r.authorized, "should be authorized");
});

test("COUNTERPARTY is denied", () => {
  const r = checkOwnerOnly({ owner_user_id: "user-1" }, "user-2", "COUNTERPARTY");
  assert(!r.authorized, "should be denied");
  if (!r.authorized) assert(r.status === 403, "403");
});

test("VIEWER is denied", () => {
  const r = checkOwnerOnly({ owner_user_id: "user-1" }, "user-2", "VIEWER");
  assert(!r.authorized, "should be denied");
  if (!r.authorized) assert(r.status === 403, "403");
});

test("no grant at all is denied", () => {
  const r = checkOwnerOnly({ owner_user_id: "user-1" }, "user-2", null);
  assert(!r.authorized, "should be denied");
  if (!r.authorized) assert(r.status === 403, "403");
});

console.log("\n--- version-to-deal validation ---\n");

test("null version returns 404", () => {
  const r = checkVersionBelongsToDeal(null, "deal-1");
  assert(!r.valid, "should fail");
  if (!r.valid) assert(r.status === 404, "404");
});

test("version from different deal returns 422", () => {
  const r = checkVersionBelongsToDeal({ deal_id: "deal-2", version_type: "OFFER" }, "deal-1");
  assert(!r.valid, "should fail");
  if (!r.valid) assert(r.status === 422, "422");
});

test("version from same deal is valid", () => {
  const r = checkVersionBelongsToDeal({ deal_id: "deal-1", version_type: "OFFER" }, "deal-1");
  assert(r.valid, "should be valid");
});

console.log("\n--- duplicate decision prevention ---\n");

test("no existing decisions means no conflict", () => {
  const r = checkAlreadyDecided([], "version-1");
  assert(!r.conflict, "no conflict");
});

test("existing decision on different version means no conflict", () => {
  const r = checkAlreadyDecided(
    [{ meta: { target_version_id: "version-2" }, version_type: "ACCEPT" }],
    "version-1",
  );
  assert(!r.conflict, "no conflict");
});

test("existing decision on same version returns 409", () => {
  const r = checkAlreadyDecided(
    [{ meta: { target_version_id: "version-1" }, version_type: "ACCEPT" }],
    "version-1",
  );
  assert(r.conflict, "should conflict");
  if (r.conflict) assert(r.status === 409, "409");
});

test("existing REJECT on same version also returns 409", () => {
  const r = checkAlreadyDecided(
    [{ meta: { target_version_id: "version-1" }, version_type: "REJECT" }],
    "version-1",
  );
  assert(r.conflict, "should conflict");
  if (r.conflict) assert(r.status === 409, "409");
});

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);
if (failed > 0) process.exit(1);
