#!/usr/bin/env node
import fs from "fs";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  PASS: " + name);
  } catch (err) {
    failed++;
    console.log("  FAIL: " + name);
    console.log("        " + (err?.message ?? String(err)));
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

console.log("\n--- Canonical compute boundary verification (App repo) ---\n");

// Keep: default scenario rails must exist (app-side defensive defaults)
test("defaultScenario.ts exists and exports getDefaultScenario + ensureScenario", () => {
  const content = fs.readFileSync("src/lib/defaultScenario.ts", "utf-8");
  assert(
    content.includes("export function getDefaultScenario"),
    "missing getDefaultScenario export",
  );
  assert(content.includes("export function ensureScenario"), "missing ensureScenario export");
});

// Change: app must NOT use @fractpath/compute; must use widget via computeAdapter
test("computeAdapter.ts imports from fractpath-calculator-widget (NOT @fractpath/compute)", () => {
  const content = fs.readFileSync("src/lib/computeAdapter.ts", "utf-8");
  assert(
    content.includes('"fractpath-calculator-widget"') ||
    content.includes("'fractpath-calculator-widget'"),
    "must import from fractpath-calculator-widget",
  );
  assert(!content.includes("@fractpath/compute"), "must NOT import from @fractpath/compute");
});

// Keep: compute route should still ensure scenario defensively
test("compute route uses ensureScenario for defensive defaults", () => {
  const content = fs.readFileSync(
    "src/app/api/deals/[dealId]/snapshot/compute/route.ts",
    "utf-8",
  );
  assert(content.includes("ensureScenario"), "must call ensureScenario");
});

// Keep: contract_version mapping should be stable (do not touch constants; just enforce mapping)
test("compute route maps compute_version to contract_version", () => {
  const content = fs.readFileSync(
    "src/app/api/deals/[dealId]/snapshot/compute/route.ts",
    "utf-8",
  );
  assert(
    content.includes("contract_version: compute_version"),
    "must map contract_version from compute_version",
  );
});

// Keep: new deal should compute + persist a canonical snapshot
test("deal/new/page.tsx creates canonical snapshot on deal creation", () => {
  const content = fs.readFileSync("src/app/deal/new/page.tsx", "utf-8");
  assert(content.includes("computeDeal"), "must call computeDeal on create");
  assert(content.includes("insertDealSnapshot"), "must persist snapshot on create");
});

// Keep: recompute button exists and calls compute API
test("RecomputeSnapshotButton component exists", () => {
  assert(
    fs.existsSync("src/components/deal/RecomputeSnapshotButton.tsx"),
    "RecomputeSnapshotButton.tsx must exist",
  );
  const content = fs.readFileSync("src/components/deal/RecomputeSnapshotButton.tsx", "utf-8");
  assert(content.includes('"use client"'), "must be client component");
  assert(content.includes("/api/deals/"), "must call compute API");
});

// Keep: summary view model sanity guards
test("dealSummaryViewModel has sanity guards for IRR and multiples", () => {
  const content = fs.readFileSync("src/lib/dealSummaryViewModel.ts", "utf-8");
  assert(content.includes("safeMoney"), "must use safeMoney guard");
  assert(content.includes("Math.abs(irr) <= 1"), "must guard IRR within ±100%");
  assert(content.includes("multiple >= 0 && multiple <= 10"), "must guard multiple 0-10x");
});

function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
}

// Keep: prevent legacy output shape drift
test("no legacy outputs.summary or outputs.schedule references in production code", () => {
  const dirs = ["src/lib", "src/app", "src/components"];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const files = [];
    function walk(d) {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const p = d + "/" + entry.name;
        if (entry.isDirectory() && !entry.name.includes("__tests__")) walk(p);
        else if (
          entry.isFile() &&
          (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
        )
          files.push(p);
      }
    }
    walk(dir);
    for (const f of files) {
      const code = stripComments(fs.readFileSync(f, "utf-8"));
      assert(
        !code.includes("outputs.summary") && !code.includes("outputs.schedule"),
        f + " contains legacy outputs.summary or outputs.schedule reference",
      );
    }
  }
});

test("no legacy chart_series references in production code", () => {
  const dirs = ["src/lib", "src/app", "src/components"];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const files = [];
    function walk(d) {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const p = d + "/" + entry.name;
        if (entry.isDirectory() && !entry.name.includes("__tests__")) walk(p);
        else if (
          entry.isFile() &&
          (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
        )
          files.push(p);
      }
    }
    walk(dir);
    for (const f of files) {
      const code = stripComments(fs.readFileSync(f, "utf-8"));
      assert(!code.includes("chart_series"), f + " contains legacy chart_series reference");
    }
  }
});

// Change: ensure the repo does NOT carry embedded compute package
test("no embedded @fractpath/compute package in this repo", () => {
  assert(
    !fs.existsSync("packages/compute/package.json"),
    "packages/compute must NOT exist in app repo",
  );
});

// Change: ensure package.json does NOT depend on @fractpath/compute, and DOES depend on widget
test("package.json dependency boundary is correct", () => {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf-8"));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

  assert(!deps["@fractpath/compute"], "package.json must NOT depend on @fractpath/compute");
  assert(
    !!deps["fractpath-calculator-widget"],
    "package.json must depend on fractpath-calculator-widget",
  );
});

console.log(
  "\n" + passed + " passed, " + failed + " failed out of " + (passed + failed) + " tests\n",
);
if (failed > 0) process.exit(1);