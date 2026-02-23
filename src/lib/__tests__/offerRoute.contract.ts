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

function parseOfferBody(body: unknown): ParseResult {
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

function computeNextVersionNumber(latestVersionNumber: number | null): number {
  return latestVersionNumber !== null ? latestVersionNumber + 1 : 1;
}

console.log("\n=== Offer Route Tests ===\n");

console.log("--- dealId validation ---\n");

test("valid UUID passes", () => {
  assert(isUuid("a1b2c3d4-e5f6-1234-abcd-ef1234567890"), "should pass");
});

test("invalid UUID fails", () => {
  assert(!isUuid("not-a-uuid"), "should fail");
});

console.log("\n--- body parsing ---\n");

test("null body returns 400", () => {
  const r = parseOfferBody(null);
  assert(!r.ok, "should fail");
  if (!r.ok) assert(r.status === 400, "400");
});

test("missing proposed_snapshot_id returns 400", () => {
  const r = parseOfferBody({ note: "hi" });
  assert(!r.ok, "should fail");
  if (!r.ok) assert(r.status === 400, "400");
});

test("non-UUID proposed_snapshot_id returns 400", () => {
  const r = parseOfferBody({ proposed_snapshot_id: "not-uuid" });
  assert(!r.ok, "should fail");
  if (!r.ok) assert(r.status === 400, "400");
});

test("non-UUID base_snapshot_id returns 400", () => {
  const r = parseOfferBody({
    proposed_snapshot_id: "a1b2c3d4-e5f6-1234-abcd-ef1234567890",
    base_snapshot_id: "bad",
  });
  assert(!r.ok, "should fail");
  if (!r.ok) assert(r.status === 400, "400");
});

test("valid body with proposed only parses correctly", () => {
  const r = parseOfferBody({
    proposed_snapshot_id: "a1b2c3d4-e5f6-1234-abcd-ef1234567890",
  });
  assert(r.ok, "should pass");
  if (r.ok) {
    assert(r.proposedSnapshotId === "a1b2c3d4-e5f6-1234-abcd-ef1234567890", "proposed match");
    assert(r.baseSnapshotId === null, "base null");
    assert(r.note === null, "note null");
  }
});

test("valid body with all fields parses correctly", () => {
  const r = parseOfferBody({
    proposed_snapshot_id: "a1b2c3d4-e5f6-1234-abcd-ef1234567890",
    base_snapshot_id: "b2c3d4e5-f6a7-2345-bcde-f12345678901",
    note: "Initial offer",
  });
  assert(r.ok, "should pass");
  if (r.ok) {
    assert(r.proposedSnapshotId === "a1b2c3d4-e5f6-1234-abcd-ef1234567890", "proposed");
    assert(r.baseSnapshotId === "b2c3d4e5-f6a7-2345-bcde-f12345678901", "base");
    assert(r.note === "Initial offer", "note");
  }
});

test("empty note becomes null", () => {
  const r = parseOfferBody({
    proposed_snapshot_id: "a1b2c3d4-e5f6-1234-abcd-ef1234567890",
    note: "   ",
  });
  assert(r.ok, "should pass");
  if (r.ok) assert(r.note === null, "whitespace note should be null");
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

test("snapshot from same deal returns valid", () => {
  const r = checkSnapshotBelongsToDeal({ deal_id: "deal-1" }, "deal-1", "proposed_snapshot_id");
  assert(r.valid, "should be valid");
});

console.log("\n--- version number computation ---\n");

test("first version is 1 when no existing versions", () => {
  assert(computeNextVersionNumber(null) === 1, "should be 1");
});

test("next version increments from latest", () => {
  assert(computeNextVersionNumber(3) === 4, "should be 4");
});

test("next version from 0 is 1", () => {
  assert(computeNextVersionNumber(0) === 1, "should be 1");
});

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);
if (failed > 0) process.exit(1);
