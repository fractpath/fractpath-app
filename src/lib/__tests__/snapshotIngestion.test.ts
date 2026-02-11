import { validateFullDealSnapshotV1 } from "../dealSnapshot";

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

function parseSnapshotBody(body: unknown): { ok: true; snapshot: unknown } | { ok: false; error: string; status: number } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid JSON body", status: 400 };
  }
  const b = body as Record<string, unknown>;
  if (!b.snapshot || typeof b.snapshot !== "object" || Array.isArray(b.snapshot)) {
    return { ok: false, error: "snapshot is required and must be a JSON object", status: 400 };
  }
  return { ok: true, snapshot: b.snapshot };
}

function checkOwnership(
  deal: { owner_user_id: string } | null,
  userId: string,
  grantRole: string | null,
): { authorized: boolean; status: number; error: string } {
  if (!deal) return { authorized: false, status: 404, error: "Deal not found" };
  if (deal.owner_user_id === userId) return { authorized: true, status: 200, error: "" };
  if (grantRole === "OWNER") return { authorized: true, status: 200, error: "" };
  return { authorized: false, status: 403, error: "Forbidden (OWNER only)" };
}

console.log("\n=== Snapshot Ingestion Route Tests ===\n");

console.log("--- dealId validation ---\n");

test("valid UUID passes isUuid", () => {
  assert(isUuid("a1b2c3d4-e5f6-1234-abcd-ef1234567890"), "should pass");
});

test("invalid UUID fails isUuid", () => {
  assert(!isUuid("not-a-uuid"), "should fail");
  assert(!isUuid(""), "empty should fail");
});

console.log("\n--- request body parsing ---\n");

test("missing body returns 400", () => {
  const result = parseSnapshotBody(null);
  assert(!result.ok, "should fail");
  if (!result.ok) assert(result.status === 400, "status 400");
});

test("missing snapshot field returns 400", () => {
  const result = parseSnapshotBody({ other: "data" });
  assert(!result.ok, "should fail");
  if (!result.ok) assert(result.status === 400, "status 400");
});

test("snapshot as array returns 400", () => {
  const result = parseSnapshotBody({ snapshot: [1, 2, 3] });
  assert(!result.ok, "should fail");
  if (!result.ok) assert(result.status === 400, "status 400");
});

test("valid snapshot object passes parsing", () => {
  const result = parseSnapshotBody({
    snapshot: {
      contract_version: "1.0.0",
      schema_version: "1",
      inputs: { a: 1 },
      outputs: { b: 2 },
    },
  });
  assert(result.ok, "should pass");
});

console.log("\n--- ownership check ---\n");

test("no deal returns 404", () => {
  const result = checkOwnership(null, "user-1", null);
  assert(!result.authorized, "not authorized");
  assert(result.status === 404, "status 404");
});

test("owner_user_id match returns authorized", () => {
  const result = checkOwnership({ owner_user_id: "user-1" }, "user-1", null);
  assert(result.authorized, "should be authorized");
});

test("non-owner without grant returns 403", () => {
  const result = checkOwnership({ owner_user_id: "user-1" }, "user-2", null);
  assert(!result.authorized, "not authorized");
  assert(result.status === 403, "status 403");
});

test("non-owner with VIEWER grant returns 403", () => {
  const result = checkOwnership({ owner_user_id: "user-1" }, "user-2", "VIEWER");
  assert(!result.authorized, "viewer not authorized");
  assert(result.status === 403, "status 403");
});

test("non-owner with OWNER grant returns authorized", () => {
  const result = checkOwnership({ owner_user_id: "user-1" }, "user-2", "OWNER");
  assert(result.authorized, "OWNER grant should authorize");
});

console.log("\n--- validation gating (insertDealSnapshot uses validateFullDealSnapshotV1) ---\n");

test("valid snapshot passes validation", () => {
  const result = validateFullDealSnapshotV1({
    contract_version: "1.0.0",
    schema_version: "1",
    inputs: { home_value: 500000 },
    outputs: { monthly_payment: 1200 },
  });
  assert(result.ok, "should pass validation");
});

test("missing contract_version fails with MISSING_FIELD", () => {
  const result = validateFullDealSnapshotV1({
    schema_version: "1",
    inputs: { a: 1 },
    outputs: { b: 2 },
  });
  assert(!result.ok, "should fail");
  if (!result.ok) assert(result.code === "MISSING_FIELD", `code: ${result.code}`);
});

test("missing inputs fails with MISSING_FIELD", () => {
  const result = validateFullDealSnapshotV1({
    contract_version: "1.0.0",
    schema_version: "1",
    outputs: { b: 2 },
  });
  assert(!result.ok, "should fail");
  if (!result.ok) assert(result.code === "MISSING_FIELD", `code: ${result.code}`);
});

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);
if (failed > 0) process.exit(1);
