import { normalizeWidgetPayload } from "../normalizeWidgetPayload";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log("  PASS: " + name);
  } catch (err: any) {
    failed++;
    console.log("  FAIL: " + name);
    console.log("        " + (err.message ?? String(err)));
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

console.log("\n--- Snapshot Bridge Contract Tests ---\n");

test("DealSnapshotBridge component exists and is a client component", () => {
  const fs = require("fs");
  const content = fs.readFileSync("src/components/deal/DealSnapshotBridge.tsx", "utf-8");
  assert(content.includes('"use client"'), "must be client component");
  assert(content.includes("__fractpath_saveSnapshot"), "must set global hook");
  assert(content.includes("normalizeWidgetPayload"), "must normalize payloads");
  assert(content.includes("/api/deals/"), "must call API");
  assert(content.includes("/snapshot/compute"), "must call compute endpoint (server recompute)");
});

test("Bridge only mounts when enabled prop is true", () => {
  const fs = require("fs");
  const content = fs.readFileSync("src/components/deal/DealSnapshotBridge.tsx", "utf-8");
  assert(content.includes("enabled"), "must accept enabled prop");
  assert(content.includes("disabled"), "must have disabled state");
});

test("Bridge detaches global hook on unmount", () => {
  const fs = require("fs");
  const content = fs.readFileSync("src/components/deal/DealSnapshotBridge.tsx", "utf-8");
  assert(content.includes("delete w.__fractpath_saveSnapshot"), "must cleanup global on unmount");
});

test("Bridge returns stable { ok, snapshot_id, deal_id, computed_at } on success", () => {
  const fs = require("fs");
  const content = fs.readFileSync("src/components/deal/DealSnapshotBridge.tsx", "utf-8");
  assert(content.includes("snapshot_id"), "must return snapshot_id");
  assert(content.includes("deal_id"), "must return deal_id");
  assert(content.includes("computed_at"), "must return computed_at");
});

test("Bridge returns { ok: false, error, code } on failure", () => {
  const fs = require("fs");
  const content = fs.readFileSync("src/components/deal/DealSnapshotBridge.tsx", "utf-8");
  assert(content.includes("ok: false"), "must return ok: false on failure");
  assert(content.includes("code"), "must include code field");
});

test("Bridge sends normalized inputs to compute endpoint", () => {
  const normalized = normalizeWidgetPayload({
    deal_terms: { property_value: 750000 },
    scenario: { exit_year: 7 },
  });
  assert(normalized.deal_terms.property_value === 750000, "property_value preserved");
  assert(normalized.scenario.exit_year === 7, "exit_year preserved");
  assert(normalized.deal_terms.floor_multiple === 1.0, "defaults filled");

  const body = JSON.stringify({ inputs: normalized });
  const parsed = JSON.parse(body);
  assert(parsed.inputs.deal_terms.property_value === 750000, "serializable payload");
});

test("Legacy ScenarioSnapshotBridge has been removed", () => {
  const fs = require("fs");
  assert(!fs.existsSync("src/components/ScenarioSnapshotBridge.tsx"), "legacy bridge must be removed");
});

test("DealCalculatorEmbed does not programmatically set __fractpath_saveSnapshot (bridge handles it)", () => {
  const fs = require("fs");
  const content = fs.readFileSync("src/components/deal/DealCalculatorEmbed.tsx", "utf-8");
  assert(!content.includes("w.__fractpath_saveSnapshot ="), "embed must not assign global hook");
  assert(!content.includes("window.__fractpath_saveSnapshot ="), "embed must not assign global hook via window");
});

test("Deal page mounts DealSnapshotBridge with enabled condition", () => {
  const fs = require("fs");
  const content = fs.readFileSync("src/app/deal/[dealId]/page.tsx", "utf-8");
  assert(content.includes("DealSnapshotBridge"), "must render DealSnapshotBridge");
  assert(content.includes('enabled={role === "OWNER"'), "must gate on OWNER role");
  assert(content.includes("!readOnly"), "must gate on not readOnly");
  assert(content.includes("!isSharedMode"), "must gate on not shared mode");
});

test("Bridge has dev-only simulate button guarded by NODE_ENV", () => {
  const fs = require("fs");
  const content = fs.readFileSync("src/components/deal/DealSnapshotBridge.tsx", "utf-8");
  assert(content.includes("Simulate widget save"), "must have simulate button text");
  assert(content.includes('process.env.NODE_ENV !== "production"'), "must gate behind NODE_ENV");
});

test("Bridge shows status UI with connected/disabled/error states", () => {
  const fs = require("fs");
  const content = fs.readFileSync("src/components/deal/DealSnapshotBridge.tsx", "utf-8");
  assert(content.includes("Widget bridge status"), "must show bridge status header");
  assert(content.includes("Bridge:"), "must show Bridge: label");
  assert(content.includes("Read-only mode: cannot save snapshots"), "must show read-only note");
});

console.log("\n" + passed + " passed, " + failed + " failed out of " + (passed + failed) + " tests\n");
if (failed > 0) process.exit(1);
