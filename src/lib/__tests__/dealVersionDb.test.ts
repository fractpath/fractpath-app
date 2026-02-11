import { isValidVersionType, VALID_VERSION_TYPES } from "../dealVersionDb";

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

console.log("\n=== Deal Version DB Tests ===\n");

console.log("--- version_type validation ---\n");

test("OFFER is a valid version type", () => {
  assert(isValidVersionType("OFFER"), "OFFER should be valid");
});

test("COUNTER is a valid version type", () => {
  assert(isValidVersionType("COUNTER"), "COUNTER should be valid");
});

test("ACCEPT is a valid version type", () => {
  assert(isValidVersionType("ACCEPT"), "ACCEPT should be valid");
});

test("REJECT is a valid version type", () => {
  assert(isValidVersionType("REJECT"), "REJECT should be valid");
});

test("lowercase 'offer' is invalid", () => {
  assert(!isValidVersionType("offer"), "lowercase should be invalid");
});

test("empty string is invalid", () => {
  assert(!isValidVersionType(""), "empty string should be invalid");
});

test("null is invalid", () => {
  assert(!isValidVersionType(null), "null should be invalid");
});

test("undefined is invalid", () => {
  assert(!isValidVersionType(undefined), "undefined should be invalid");
});

test("number is invalid", () => {
  assert(!isValidVersionType(42), "number should be invalid");
});

test("unknown type 'WITHDRAW' is invalid", () => {
  assert(!isValidVersionType("WITHDRAW"), "WITHDRAW should be invalid");
});

console.log("\n--- VALID_VERSION_TYPES constant ---\n");

test("VALID_VERSION_TYPES has exactly 4 entries", () => {
  assert(VALID_VERSION_TYPES.length === 4, `expected 4, got ${VALID_VERSION_TYPES.length}`);
});

test("VALID_VERSION_TYPES contains all expected types", () => {
  const expected = ["OFFER", "COUNTER", "ACCEPT", "REJECT"];
  for (const t of expected) {
    assert(
      (VALID_VERSION_TYPES as readonly string[]).includes(t),
      `missing ${t}`,
    );
  }
});

console.log("\n--- version ordering (pure logic) ---\n");

test("versions sorted by created_at desc puts newest first", () => {
  const versions = [
    { version_number: 1, created_at: "2026-02-10T10:00:00Z" },
    { version_number: 3, created_at: "2026-02-10T12:00:00Z" },
    { version_number: 2, created_at: "2026-02-10T11:00:00Z" },
  ];
  const sorted = [...versions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  assert(sorted[0].version_number === 3, `expected v3 first, got v${sorted[0].version_number}`);
  assert(sorted[1].version_number === 2, `expected v2 second, got v${sorted[1].version_number}`);
  assert(sorted[2].version_number === 1, `expected v1 third, got v${sorted[2].version_number}`);
});

test("latest version is first after desc sort", () => {
  const versions = [
    { version_number: 1, created_at: "2026-02-10T10:00:00Z" },
    { version_number: 2, created_at: "2026-02-10T11:00:00Z" },
  ];
  const sorted = [...versions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const latest = sorted[0] ?? null;
  assert(latest !== null, "should have a latest");
  assert(latest.version_number === 2, `expected v2, got v${latest.version_number}`);
});

test("empty list returns null for latest", () => {
  const versions: { version_number: number; created_at: string }[] = [];
  const latest = versions.length > 0 ? versions[0] : null;
  assert(latest === null, "expected null for empty list");
});

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);
if (failed > 0) process.exit(1);
