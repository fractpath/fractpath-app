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

type ParseResult =
  | { ok: true; proposedSnapshotId: string; baseSnapshotId: string | null; note: string | null }
  | { ok: false; error: string; status: number };

function parseCounterBody(body: unknown): ParseResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid JSON body", status: 400 };
  }
  const b = body as Record<string, unknown>;

  const proposed = typeof b.proposed_snapshot_id === "string"
    ? b.proposed_snapshot_id.trim()
    : "";
  if (!proposed || !isUuid(proposed)) {
    return { ok: false, error: "proposed_snapshot_id is required and must be a valid UUID", status: 400 };
  }

  const base = typeof b.base_snapshot_id === "string"
    ? b.base_snapshot_id.trim()
    : null;
  if (base !== null && !isUuid(base)) {
    return { ok: false, error: "base_snapshot_id must be a valid UUID if provided", status: 400 };
  }

  const note = typeof b.note === "string" ? b.note.trim() || null : null;

  return { ok: true, proposedSnapshotId: proposed, baseSnapshotId: base, note };
}

type RoleCheckResult =
  | { authorized: true; role: "OWNER" | "COUNTERPARTY" }
  | { authorized: false; status: number; error: string };

function checkCounterRole(
  deal: { owner_user_id: string } | null,
  userId: string,
  grantRole: string | null,
): RoleCheckResult {
  if (!deal) return { authorized: false, status: 404, error: "Deal not found" };
  const isOwner = deal.owner_user_id === userId || grantRole === "OWNER";
  if (isOwner) return { authorized: true, role: "OWNER" };
  if (grantRole === "COUNTERPARTY") return { authorized: true, role: "COUNTERPARTY" };
  return { authorized: false, status: 403, error: "Forbidden (OWNER or COUNTERPARTY only)" };
}

function checkSnapshotBelongsToDeal(
  snapshot: { deal_id: string } | null,
  dealId: string,
  fieldName: string,
): { valid: true } | { valid: false; error: string; status: number } {
  if (!snapshot) {
    return { valid: false, error: `${fieldName} not found`, status: 404 };
  }
  if (snapshot.deal_id !== dealId) {
    return { valid: false, error: `${fieldName} does not belong to this deal`, status: 422 };
  }
  return { valid: true };
}

console.log("\n=== Counter Route Tests ===\n");

console.log("--- body parsing ---\n");

test("null body returns 400", () => {
  const r = parseCounterBody(null);
  assert(!r.ok, "should fail");
  if (!r.ok) assert(r.status === 400, "400");
});

test("missing proposed_snapshot_id returns 400", () => {
  const r = parseCounterBody({ note: "counter" });
  assert(!r.ok, "should fail");
  if (!r.ok) assert(r.status === 400, "400");
});

test("non-UUID proposed_snapshot_id returns 400", () => {
  const r = parseCounterBody({ proposed_snapshot_id: "bad-id" });
  assert(!r.ok, "should fail");
  if (!r.ok) assert(r.status === 400, "400");
});

test("valid body parses correctly", () => {
  const r = parseCounterBody({
    proposed_snapshot_id: "a1b2c3d4-e5f6-1234-abcd-ef1234567890",
    note: "My counter",
  });
  assert(r.ok, "should pass");
  if (r.ok) {
    assert(r.proposedSnapshotId === "a1b2c3d4-e5f6-1234-abcd-ef1234567890", "proposed");
    assert(r.baseSnapshotId === null, "base null");
    assert(r.note === "My counter", "note");
  }
});

console.log("\n--- role gating ---\n");

test("no deal returns 404", () => {
  const r = checkCounterRole(null, "user-1", null);
  assert(!r.authorized, "not authorized");
  if (!r.authorized) assert(r.status === 404, "404");
});

test("OWNER by owner_user_id is authorized", () => {
  const r = checkCounterRole({ owner_user_id: "user-1" }, "user-1", null);
  assert(r.authorized, "should be authorized");
  if (r.authorized) assert(r.role === "OWNER", "role OWNER");
});

test("OWNER by grant is authorized", () => {
  const r = checkCounterRole({ owner_user_id: "user-1" }, "user-2", "OWNER");
  assert(r.authorized, "should be authorized");
  if (r.authorized) assert(r.role === "OWNER", "role OWNER");
});

test("COUNTERPARTY is authorized", () => {
  const r = checkCounterRole({ owner_user_id: "user-1" }, "user-2", "COUNTERPARTY");
  assert(r.authorized, "should be authorized");
  if (r.authorized) assert(r.role === "COUNTERPARTY", "role COUNTERPARTY");
});

test("VIEWER is denied", () => {
  const r = checkCounterRole({ owner_user_id: "user-1" }, "user-2", "VIEWER");
  assert(!r.authorized, "viewer should be denied");
  if (!r.authorized) assert(r.status === 403, "403");
});

test("no grant at all is denied", () => {
  const r = checkCounterRole({ owner_user_id: "user-1" }, "user-2", null);
  assert(!r.authorized, "should be denied");
  if (!r.authorized) assert(r.status === 403, "403");
});

console.log("\n--- snapshot-to-deal validation ---\n");

test("null snapshot returns 404", () => {
  const r = checkSnapshotBelongsToDeal(null, "deal-1", "proposed_snapshot_id");
  assert(!r.valid, "should fail");
  if (!r.valid) assert(r.status === 404, "404");
});

test("snapshot from different deal returns 422", () => {
  const r = checkSnapshotBelongsToDeal({ deal_id: "deal-2" }, "deal-1", "proposed_snapshot_id");
  assert(!r.valid, "should fail");
  if (!r.valid) assert(r.status === 422, "422");
});

test("snapshot from same deal is valid", () => {
  const r = checkSnapshotBelongsToDeal({ deal_id: "deal-1" }, "deal-1", "proposed_snapshot_id");
  assert(r.valid, "should be valid");
});

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);
if (failed > 0) process.exit(1);
