import { buildDealTimeline, type BuildTimelineInput } from "../dealTimeline";

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

const DEAL_ID = "aaaaaaaa-bbbb-1234-abcd-ef1234567890";

function makeInput(overrides: Partial<BuildTimelineInput> = {}): BuildTimelineInput {
  return {
    dealId: DEAL_ID,
    snapshots: [],
    versions: [],
    events: [],
    ...overrides,
  };
}

console.log("\n=== Deal Timeline Tests ===\n");

console.log("--- ordering ---\n");

test("entries sorted by created_at descending", () => {
  const r = buildDealTimeline(makeInput({
    snapshots: [
      { id: "s1", created_at: "2026-01-01T00:00:00Z", contract_version: "1", schema_version: "1" },
    ],
    events: [
      { id: "e1", event_type: "DEAL_CREATED", created_at: "2026-01-02T00:00:00Z", payload: null },
    ],
    versions: [
      { id: "v1", created_at: "2026-01-03T00:00:00Z", version_number: 1, version_type: "OFFER", proposed_snapshot_id: null, base_snapshot_id: null, note: null, meta: {} },
    ],
  }));
  assert(r.length === 3, "3 entries");
  assert(r[0].id === "v1", "newest first");
  assert(r[1].id === "e1", "middle");
  assert(r[2].id === "s1", "oldest last");
});

test("same timestamp preserves stable order", () => {
  const ts = "2026-01-01T00:00:00Z";
  const r = buildDealTimeline(makeInput({
    snapshots: [{ id: "s1", created_at: ts, contract_version: "1", schema_version: "1" }],
    events: [{ id: "e1", event_type: "DEAL_CREATED", created_at: ts, payload: null }],
  }));
  assert(r.length === 2, "2 entries");
});

console.log("\n--- missing created_at ---\n");

test("missing created_at pushed to end", () => {
  const r = buildDealTimeline(makeInput({
    events: [
      { id: "e1", event_type: "DEAL_CREATED", created_at: "2026-01-01T00:00:00Z", payload: null },
      { id: "e2", event_type: "DEAL_SHARED", created_at: "", payload: null },
    ],
  }));
  assert(r.length === 2, "2 entries");
  assert(r[0].id === "e1", "valid date first");
  assert(r[1].id === "e2", "missing date last");
});

console.log("\n--- type labeling ---\n");

test("snapshot entries have type SNAPSHOT", () => {
  const r = buildDealTimeline(makeInput({
    snapshots: [{ id: "s1", created_at: "2026-01-01T00:00:00Z", contract_version: "1", schema_version: "1" }],
  }));
  assert(r[0].type === "SNAPSHOT", "type SNAPSHOT");
  assert(r[0].title === "Snapshot saved", "title");
});

test("OFFER version labeled correctly", () => {
  const r = buildDealTimeline(makeInput({
    versions: [{ id: "v1", created_at: "2026-01-01T00:00:00Z", version_number: 1, version_type: "OFFER", proposed_snapshot_id: null, base_snapshot_id: null, note: null, meta: {} }],
  }));
  assert(r[0].type === "VERSION", "type VERSION");
  assert(r[0].title === "Offer submitted", "title");
});

test("COUNTER version labeled correctly", () => {
  const r = buildDealTimeline(makeInput({
    versions: [{ id: "v1", created_at: "2026-01-01T00:00:00Z", version_number: 2, version_type: "COUNTER", proposed_snapshot_id: null, base_snapshot_id: null, note: null, meta: {} }],
  }));
  assert(r[0].title === "Counter-offer submitted", "title");
});

test("ACCEPT version labeled correctly", () => {
  const r = buildDealTimeline(makeInput({
    versions: [{ id: "v1", created_at: "2026-01-01T00:00:00Z", version_number: 3, version_type: "ACCEPT", proposed_snapshot_id: null, base_snapshot_id: null, note: null, meta: { target_version_id: "v0" } }],
  }));
  assert(r[0].title === "Version accepted", "title");
});

test("REJECT version labeled correctly", () => {
  const r = buildDealTimeline(makeInput({
    versions: [{ id: "v1", created_at: "2026-01-01T00:00:00Z", version_number: 4, version_type: "REJECT", proposed_snapshot_id: null, base_snapshot_id: null, note: null, meta: {} }],
  }));
  assert(r[0].title === "Version rejected", "title");
});

test("event labels are human-readable", () => {
  const r = buildDealTimeline(makeInput({
    events: [
      { id: "e1", event_type: "DEAL_CREATED", created_at: "2026-01-01T00:00:00Z", payload: null },
      { id: "e2", event_type: "DEAL_VERSION_DECIDED", created_at: "2026-01-02T00:00:00Z", payload: null },
    ],
  }));
  assert(r[0].title === "Decision recorded", "DEAL_VERSION_DECIDED label");
  assert(r[1].title === "Deal created", "DEAL_CREATED label");
});

console.log("\n--- link construction ---\n");

test("snapshot link points to snapshot view", () => {
  const r = buildDealTimeline(makeInput({
    snapshots: [{ id: "s1", created_at: "2026-01-01T00:00:00Z", contract_version: "1", schema_version: "1" }],
  }));
  assert(r[0].href === `/deal/${DEAL_ID}?snapshot=s1`, "href");
});

test("OFFER with both snapshots links to compare", () => {
  const r = buildDealTimeline(makeInput({
    versions: [{ id: "v1", created_at: "2026-01-01T00:00:00Z", version_number: 1, version_type: "OFFER", proposed_snapshot_id: "snap-b", base_snapshot_id: "snap-a", note: null, meta: {} }],
  }));
  assert(r[0].href === `/deal/${DEAL_ID}/compare?a=snap-a&b=snap-b`, "compare href");
});

test("OFFER with only proposed links to snapshot", () => {
  const r = buildDealTimeline(makeInput({
    versions: [{ id: "v1", created_at: "2026-01-01T00:00:00Z", version_number: 1, version_type: "OFFER", proposed_snapshot_id: "snap-b", base_snapshot_id: null, note: null, meta: {} }],
  }));
  assert(r[0].href === `/deal/${DEAL_ID}?snapshot=snap-b`, "snapshot href");
});

test("ACCEPT version has no link", () => {
  const r = buildDealTimeline(makeInput({
    versions: [{ id: "v1", created_at: "2026-01-01T00:00:00Z", version_number: 3, version_type: "ACCEPT", proposed_snapshot_id: null, base_snapshot_id: null, note: null, meta: { target_version_id: "v0" } }],
  }));
  assert(r[0].href === null, "no href for ACCEPT");
});

test("events have no links", () => {
  const r = buildDealTimeline(makeInput({
    events: [{ id: "e1", event_type: "DEAL_CREATED", created_at: "2026-01-01T00:00:00Z", payload: null }],
  }));
  assert(r[0].href === null, "no href");
});

console.log("\n--- subtitle ---\n");

test("version note included in subtitle", () => {
  const r = buildDealTimeline(makeInput({
    versions: [{ id: "v1", created_at: "2026-01-01T00:00:00Z", version_number: 1, version_type: "OFFER", proposed_snapshot_id: null, base_snapshot_id: null, note: "Initial offer", meta: {} }],
  }));
  assert(r[0].subtitle === "#1 — Initial offer", "subtitle with note");
});

test("version without note shows just number", () => {
  const r = buildDealTimeline(makeInput({
    versions: [{ id: "v1", created_at: "2026-01-01T00:00:00Z", version_number: 5, version_type: "COUNTER", proposed_snapshot_id: null, base_snapshot_id: null, note: null, meta: {} }],
  }));
  assert(r[0].subtitle === "#5", "subtitle number only");
});

console.log("\n--- empty inputs ---\n");

test("empty inputs produce empty timeline", () => {
  const r = buildDealTimeline(makeInput());
  assert(r.length === 0, "empty");
});

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);
if (failed > 0) process.exit(1);
