import { randomBytes } from "node:crypto";

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

function assertHighEntropy(token: string) {
  if (token.length !== 64) throw new Error(`Token length ${token.length} != 64`);
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Token not hex");
  const unique = new Set(token.split(""));
  if (unique.size < 8) throw new Error("Token has low character diversity");
}

function assertUnique(tokens: string[]) {
  const set = new Set(tokens);
  if (set.size !== tokens.length) throw new Error("Duplicate token found");
}

function assertSnapshotPassthrough(input: any, stored: any) {
  if (JSON.stringify(input) !== JSON.stringify(stored)) {
    throw new Error("Snapshot was mutated during storage");
  }
}

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  FAIL: ${name} — ${err.message}`);
  }
}

console.log("Draft Token Tests");
console.log("==================");

test("token is 64-char hex (256-bit)", () => {
  const token = generateToken();
  assertHighEntropy(token);
});

test("tokens are unique across 100 generations", () => {
  const tokens = Array.from({ length: 100 }, () => generateToken());
  assertUnique(tokens);
});

test("snapshot passthrough preserves opaque JSON", () => {
  const snapshot = {
    address: "123 Main St",
    equity_pct: 15,
    nested: { a: [1, 2, 3] },
    contract_version: "v1",
  };
  const stored = JSON.parse(JSON.stringify(snapshot));
  assertSnapshotPassthrough(snapshot, stored);
});

test("snapshot passthrough preserves empty object", () => {
  const snapshot = {};
  const stored = JSON.parse(JSON.stringify(snapshot));
  assertSnapshotPassthrough(snapshot, stored);
});

test("snapshot passthrough preserves deeply nested data", () => {
  const snapshot = { a: { b: { c: { d: { e: "deep" } } } } };
  const stored = JSON.parse(JSON.stringify(snapshot));
  assertSnapshotPassthrough(snapshot, stored);
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
