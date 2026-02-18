import { selectBaseSnapshotId } from "../counterBaseSnapshot";

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

const UUID_A = "aaaaaaaa-aaaa-1aaa-aaaa-aaaaaaaaaaaa";
const UUID_B = "bbbbbbbb-bbbb-1bbb-bbbb-bbbbbbbbbbbb";

console.log("\n--- selectBaseSnapshotId ---\n");

test("selectedSnapshotId present → returns it", () => {
  const result = selectBaseSnapshotId({ selectedSnapshotId: UUID_A, latestSnapshotId: UUID_B });
  assert(result === UUID_A, `expected ${UUID_A} but got ${result}`);
});

test("selectedSnapshotId null, latestSnapshotId present → returns latest", () => {
  const result = selectBaseSnapshotId({ selectedSnapshotId: null, latestSnapshotId: UUID_B });
  assert(result === UUID_B, `expected ${UUID_B} but got ${result}`);
});

test("selectedSnapshotId undefined, latestSnapshotId present → returns latest", () => {
  const result = selectBaseSnapshotId({ selectedSnapshotId: undefined, latestSnapshotId: UUID_B });
  assert(result === UUID_B, `expected ${UUID_B} but got ${result}`);
});

test("both null → returns null", () => {
  const result = selectBaseSnapshotId({ selectedSnapshotId: null, latestSnapshotId: null });
  assert(result === null, `expected null but got ${result}`);
});

test("both undefined → returns null", () => {
  const result = selectBaseSnapshotId({ selectedSnapshotId: undefined, latestSnapshotId: undefined });
  assert(result === null, `expected null but got ${result}`);
});

test("selectedSnapshotId empty string → returns latestSnapshotId", () => {
  const result = selectBaseSnapshotId({ selectedSnapshotId: "", latestSnapshotId: UUID_B });
  assert(result === UUID_B, `expected ${UUID_B} but got ${result}`);
});

test("both empty strings → returns null", () => {
  const result = selectBaseSnapshotId({ selectedSnapshotId: "", latestSnapshotId: "" });
  assert(result === null, `expected null but got ${result}`);
});

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);
if (failed > 0) process.exit(1);
