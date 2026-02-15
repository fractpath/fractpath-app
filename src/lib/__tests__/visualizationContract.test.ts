import {
  normalizeSnapshotJson,
  extractSnapshotDisplay,
  formatValue,
  humanLabel,
} from "../dealSnapshotDisplay";
import { compareSnapshotDisplay } from "../snapshotCompare";

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

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

console.log("\n--- APP-009: normalizeSnapshotJson ---\n");

test("normalizer: prefers envelope inputs/outputs when present", () => {
  const result = normalizeSnapshotJson({
    contract_version: "v1",
    computed_at: "2025-01-01T00:00:00Z",
    computed_by: "user-1",
    inputs: { home_value: 500000 },
    outputs: { net_payout: 100000 },
    snapshot_source: "app_compute",
    canonicalSnapshot: {
      compute_version: "v0",
      computed_at: "2024-01-01T00:00:00Z",
      inputs: { home_value: 999999 },
      outputs: { net_payout: 0 },
    },
  });
  assert(result.contract_version === "v1", "envelope contract_version wins");
  assert(result.computed_at === "2025-01-01T00:00:00Z", "envelope computed_at wins");
  assert((result.inputs as any).home_value === 500000, "envelope inputs win");
  assert((result.outputs as any).net_payout === 100000, "envelope outputs win");
  assert(result.warnings.length === 0, "no warnings when envelope has all fields");
});

test("normalizer: falls back to canonicalSnapshot when envelope fields missing", () => {
  const result = normalizeSnapshotJson({
    canonicalSnapshot: {
      compute_version: "v2",
      computed_at: "2025-06-01T00:00:00Z",
      inputs: { home_value: 750000 },
      outputs: { net_payout: 200000 },
      assumptions: {},
    },
  });
  assert(result.contract_version === "v2", "falls back to canonical compute_version");
  assert(result.computed_at === "2025-06-01T00:00:00Z", "falls back to canonical computed_at");
  assert((result.inputs as any).home_value === 750000, "falls back to canonical inputs");
  assert((result.outputs as any).net_payout === 200000, "falls back to canonical outputs");
  assert(result.warnings.length === 0, "no warnings when canonical has all fields");
});

test("normalizer: produces warning when inputs missing everywhere", () => {
  const result = normalizeSnapshotJson({
    contract_version: "v1",
    outputs: { net_payout: 100 },
  });
  assert(result.warnings.some((w) => w.includes("inputs")), "warns about missing inputs");
  assert(deepEqual(result.inputs, {}), "inputs defaults to {}");
});

test("normalizer: produces warning when outputs missing everywhere", () => {
  const result = normalizeSnapshotJson({
    contract_version: "v1",
    inputs: { home_value: 500000 },
  });
  assert(result.warnings.some((w) => w.includes("outputs")), "warns about missing outputs");
  assert(deepEqual(result.outputs, {}), "outputs defaults to {}");
});

test("normalizer: handles null/undefined input gracefully", () => {
  const r1 = normalizeSnapshotJson(null);
  assert(r1.contract_version === "\u2014", "null → dash contract_version");
  assert(deepEqual(r1.inputs, {}), "null → empty inputs");
  assert(deepEqual(r1.outputs, {}), "null → empty outputs");

  const r2 = normalizeSnapshotJson(undefined);
  assert(r2.contract_version === "\u2014", "undefined → dash contract_version");
});

test("normalizer: never mutates input object", () => {
  const original = {
    canonicalSnapshot: {
      compute_version: "v1",
      computed_at: "2025-01-01T00:00:00Z",
      inputs: { home_value: 500000 },
      outputs: { net_payout: 100000 },
    },
  };
  const frozen = JSON.stringify(original);
  normalizeSnapshotJson(original);
  assert(JSON.stringify(original) === frozen, "input object must not be mutated");
});

test("normalizer: returns all required fields", () => {
  const result = normalizeSnapshotJson({});
  assert("contract_version" in result, "has contract_version");
  assert("computed_at" in result, "has computed_at");
  assert("computed_by" in result, "has computed_by");
  assert("inputs" in result, "has inputs");
  assert("outputs" in result, "has outputs");
  assert("snapshot_source" in result, "has snapshot_source");
  assert("warnings" in result, "has warnings");
  assert(Array.isArray(result.warnings), "warnings is array");
});

test("normalizer: snapshot_source from envelope", () => {
  const result = normalizeSnapshotJson({ snapshot_source: "canonical_snapshot" });
  assert(result.snapshot_source === "canonical_snapshot", "reads snapshot_source");
});

console.log("\n--- APP-009: extractSnapshotDisplay (SnapshotDisplayData contract) ---\n");

test("extractSnapshotDisplay: returns null for null input", () => {
  assert(extractSnapshotDisplay(null) === null, "null in → null out");
});

test("extractSnapshotDisplay: returns all SnapshotDisplayData fields", () => {
  const result = extractSnapshotDisplay({
    created_at: "2025-01-01",
    contract_version: "v1",
    schema_version: "1",
    input_hash: "abc",
    output_hash: "def",
    snapshot_json: { inputs: { x: 1 }, outputs: { y: 2 } },
  });
  assert(result !== null, "not null");
  assert(result!.contractVersion === "v1", "contractVersion");
  assert(result!.schemaVersion === "1", "schemaVersion");
  assert(result!.inputHash === "abc", "inputHash");
  assert(result!.outputHash === "def", "outputHash");
  assert(result!.createdAt === "2025-01-01", "createdAt");
  assert(result!.inputs !== null, "inputs not null");
  assert(result!.outputs !== null, "outputs not null");
  assert("chartSeries" in result!, "has chartSeries field");
});

test("extractSnapshotDisplay: resolves canonical-only snapshot", () => {
  const result = extractSnapshotDisplay({
    created_at: "2025-01-01",
    contract_version: "v2",
    schema_version: "1",
    input_hash: null,
    output_hash: null,
    snapshot_json: {
      canonicalSnapshot: {
        compute_version: "v2",
        computed_at: "2025-01-01T00:00:00Z",
        inputs: { home_value: 500000 },
        outputs: { net_payout: 150000 },
        assumptions: {},
      },
    },
  });
  assert(result !== null, "not null");
  assert(result!.inputs !== null, "canonical inputs resolved");
  assert((result!.inputs as any).home_value === 500000, "canonical inputs values");
  assert(result!.outputs !== null, "canonical outputs resolved");
  assert((result!.outputs as any).net_payout === 150000, "canonical outputs values");
});

test("extractSnapshotDisplay: preserves SnapshotDisplayData shape (no new/removed fields)", () => {
  const result = extractSnapshotDisplay({
    created_at: "2025-01-01",
    contract_version: "v1",
    schema_version: "1",
    input_hash: null,
    output_hash: null,
    snapshot_json: {},
  });
  const keys = Object.keys(result!).sort();
  const expected = ["chartSeries", "contractVersion", "createdAt", "inputHash", "inputs", "outputHash", "outputs", "schemaVersion"].sort();
  assert(deepEqual(keys, expected), `shape must be exactly ${expected.join(", ")} but got ${keys.join(", ")}`);
});

console.log("\n--- APP-011: compareSnapshotDisplay with canonical normalization ---\n");

test("compare: canonical-only vs envelope yields no false diffs", () => {
  const envelopeSnapshot = {
    contract_version: "v1",
    inputs: { home_value: 500000 },
    outputs: { net_payout: 100000 },
  };
  const canonicalSnapshot = {
    canonicalSnapshot: {
      compute_version: "v1",
      computed_at: "2025-01-01",
      inputs: { home_value: 500000 },
      outputs: { net_payout: 100000 },
    },
  };
  const result = compareSnapshotDisplay(envelopeSnapshot, canonicalSnapshot);
  assert(result.inputDiffs.length === 0, "no input diffs for same data");
  assert(result.outputDiffs.length === 0, "no output diffs for same data");
  assert(result.metaDiffs.length === 0, "no meta diffs for same contract_version");
});

test("compare: detects real diffs between canonical snapshots", () => {
  const a = {
    canonicalSnapshot: {
      compute_version: "v1",
      computed_at: "2025-01-01",
      inputs: { home_value: 500000 },
      outputs: { net_payout: 100000 },
    },
  };
  const b = {
    canonicalSnapshot: {
      compute_version: "v1",
      computed_at: "2025-01-01",
      inputs: { home_value: 600000 },
      outputs: { net_payout: 120000 },
    },
  };
  const result = compareSnapshotDisplay(a, b);
  assert(result.inputDiffs.length === 1, "detects input diff");
  assert(result.inputDiffs[0].key === "home_value", "diff key is home_value");
  assert(result.outputDiffs.length === 1, "detects output diff");
});

test("compare: handles null/undefined sides gracefully", () => {
  const result = compareSnapshotDisplay(null, undefined);
  assert(result.inputDiffs.length === 0, "no diffs for null vs undefined");
  assert(result.outputDiffs.length === 0, "no output diffs");
  assert(result.metaDiffs.length === 0, "no meta diffs");
});

test("compare: never mutates input objects", () => {
  const a = { canonicalSnapshot: { compute_version: "v1", computed_at: "t", inputs: { x: 1 }, outputs: { y: 2 } } };
  const b = { inputs: { x: 1 }, outputs: { y: 3 }, contract_version: "v1" };
  const aFrozen = JSON.stringify(a);
  const bFrozen = JSON.stringify(b);
  compareSnapshotDisplay(a, b);
  assert(JSON.stringify(a) === aFrozen, "a not mutated");
  assert(JSON.stringify(b) === bFrozen, "b not mutated");
});

console.log("\n--- APP-012: Timeline metadata resilience ---\n");

const fs = require("fs");

test("timeline: buildDealTimeline reads contract_version from snapshot metadata (not snapshot_json)", () => {
  const timelineContent = fs.readFileSync("src/lib/dealTimeline.ts", "utf-8");
  assert(
    timelineContent.includes("s.contract_version"),
    "must read contract_version from snapshot row metadata",
  );
  assert(
    !timelineContent.includes("snapshot_json.contract_version") &&
    !timelineContent.includes("canonicalSnapshot"),
    "must not access snapshot_json or canonicalSnapshot for timeline labels",
  );
});

test("timeline: buildDealTimeline uses ?? fallback for missing version", () => {
  const timelineContent = fs.readFileSync("src/lib/dealTimeline.ts", "utf-8");
  assert(
    timelineContent.includes('s.contract_version ?? "?"'),
    "must fallback to ? for missing contract_version",
  );
});

console.log("\n--- APP-013: Visualization invariants ---\n");

test("invariant: normalizeSnapshotJson is a pure function (same input → same output)", () => {
  const input = {
    canonicalSnapshot: {
      compute_version: "v1",
      computed_at: "2025-01-01",
      inputs: { home_value: 500000 },
      outputs: { net_payout: 100000 },
    },
  };
  const r1 = normalizeSnapshotJson(input);
  const r2 = normalizeSnapshotJson(input);
  assert(deepEqual(r1, r2), "must produce identical output for same input");
});

test("invariant: normalizer source file does not mutate input (no assignment to parameter)", () => {
  const displayContent = fs.readFileSync("src/lib/dealSnapshotDisplay.ts", "utf-8");
  const normFnStart = displayContent.indexOf("export function normalizeSnapshotJson");
  const normFnEnd = displayContent.indexOf("export interface SnapshotDisplayData");
  const normBody = displayContent.slice(normFnStart, normFnEnd);
  assert(
    !normBody.includes("snapshotJson.") || !normBody.includes("snapshotJson.canonicalSnapshot ="),
    "normalizer must not assign to input parameter properties",
  );
});

test("invariant: compareSnapshotDisplay imports normalizeSnapshotJson", () => {
  const compareContent = fs.readFileSync("src/lib/snapshotCompare.ts", "utf-8");
  assert(
    compareContent.includes("normalizeSnapshotJson"),
    "compare must use normalizer for canonical support",
  );
});

test("invariant: extractSnapshotDisplay uses normalizeSnapshotJson", () => {
  const displayContent = fs.readFileSync("src/lib/dealSnapshotDisplay.ts", "utf-8");
  const extractFn = displayContent.slice(
    displayContent.indexOf("export function extractSnapshotDisplay"),
    displayContent.indexOf("export interface SnapshotListItem"),
  );
  assert(
    extractFn.includes("normalizeSnapshotJson"),
    "extractSnapshotDisplay must use normalizer",
  );
});

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);
if (failed > 0) process.exit(1);
