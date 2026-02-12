import { computeDeal } from "../computeAdapter";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => Promise<void> | void) {
  const result = fn();
  const finish = (err?: any) => {
    if (err) {
      failed++;
      console.log(`  FAIL: ${name}`);
      console.log(`        ${err.message ?? err}`);
    } else {
      passed++;
      console.log(`  PASS: ${name}`);
    }
  };
  if (result && typeof (result as any).then === "function") {
    (result as Promise<void>).then(() => finish()).catch(finish);
  } else {
    finish();
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

console.log("\n--- Sprint 9 Contract Verification ---\n");

(async () => {
  await test("Contract A: no client component imports computeDeal or computeAdapter", () => {
    const { execSync } = require("child_process");
    const clientFiles = execSync(
      'grep -rl \'"use client"\' src/components/ src/app/ --include="*.tsx" --include="*.ts" 2>/dev/null || true',
      { encoding: "utf-8" },
    ).trim().split("\n").filter(Boolean);

    for (const f of clientFiles) {
      const content = require("fs").readFileSync(f, "utf-8");
      assert(
        !content.includes("computeDeal") && !content.includes("computeAdapter") && !content.includes("calculator-widget"),
        `Client component ${f} imports compute logic — violates single source of truth`,
      );
    }
  });

  await test("Contract A: no stale src/api/ directory exists", () => {
    const fs = require("fs");
    assert(!fs.existsSync("src/api"), "src/api/ should not exist (stale dead code)");
  });

  await test("Contract B: compute endpoint exists at App Router path", () => {
    const fs = require("fs");
    assert(
      fs.existsSync("src/app/api/deals/[dealId]/snapshot/compute/route.ts"),
      "compute route must exist under src/app/api/",
    );
  });

  await test("Contract B: compute endpoint enforces OWNER-only", () => {
    const content = require("fs").readFileSync(
      "src/app/api/deals/[dealId]/snapshot/compute/route.ts",
      "utf-8",
    );
    assert(content.includes("OWNER only") || content.includes("OWNER"), "must check OWNER role");
    assert(content.includes("403"), "must return 403 for non-OWNER");
  });

  await test("Contract B: compute endpoint calls computeDeal from adapter", () => {
    const content = require("fs").readFileSync(
      "src/app/api/deals/[dealId]/snapshot/compute/route.ts",
      "utf-8",
    );
    assert(
      content.includes('from "@/lib/computeAdapter"') && content.includes("computeDeal"),
      "must import and call computeDeal from computeAdapter",
    );
  });

  await test("Contract B: compute endpoint persists via insertDealSnapshot", () => {
    const content = require("fs").readFileSync(
      "src/app/api/deals/[dealId]/snapshot/compute/route.ts",
      "utf-8",
    );
    assert(content.includes("insertDealSnapshot"), "must persist via insertDealSnapshot");
  });

  await test("Contract C: snapshot includes terms_version mapped to contract_version", () => {
    const content = require("fs").readFileSync(
      "src/app/api/deals/[dealId]/snapshot/compute/route.ts",
      "utf-8",
    );
    assert(
      content.includes("contract_version: terms_version"),
      "must map terms_version → contract_version",
    );
  });

  await test("Contract C: snapshot includes inputs + outputs + computed_at + computed_by", () => {
    const content = require("fs").readFileSync(
      "src/app/api/deals/[dealId]/snapshot/compute/route.ts",
      "utf-8",
    );
    assert(content.includes("inputs: body.inputs"), "must include inputs");
    assert(content.includes("outputs"), "must include outputs");
    assert(content.includes("computed_at"), "must include computed_at");
    assert(content.includes("computed_by"), "must include computed_by");
  });

  await test("Contract C: widget compute produces schedule[] in outputs", async () => {
    const result = await computeDeal({
      home_value: 500000,
      fractional_percent: 10,
      term_years: 5,
      appreciation_rate: 3,
      discount_rate: 5,
    });
    assert(result.ok === true, "compute must succeed");
    if (result.ok) {
      assert(Array.isArray(result.result.outputs.schedule), "outputs.schedule must be array");
      assert(result.result.outputs.schedule.length === 6, "schedule must have year 0-5 (6 rows)");
      const row = result.result.outputs.schedule[0] as any;
      assert(typeof row.year === "number", "schedule row must have year");
      assert(typeof row.home_value === "number", "schedule row must have home_value");
    }
  });

  await test("Contract C: widget compute includes terms_version string", async () => {
    const result = await computeDeal({
      home_value: 500000,
      fractional_percent: 10,
      term_years: 5,
      appreciation_rate: 3,
      discount_rate: 5,
    });
    assert(result.ok === true, "compute must succeed");
    if (result.ok) {
      assert(
        typeof result.result.terms_version === "string" &&
          result.result.terms_version.startsWith("fractpath-terms-"),
        "terms_version must be a fractpath-terms-* string",
      );
    }
  });

  await test("Contract C: widget outputs are JSON-serializable (no cycles/functions)", async () => {
    const result = await computeDeal({
      home_value: 500000,
      fractional_percent: 10,
      term_years: 5,
      appreciation_rate: 3,
      discount_rate: 5,
    });
    assert(result.ok === true, "compute must succeed");
    if (result.ok) {
      const serialized = JSON.stringify(result.result.outputs);
      const parsed = JSON.parse(serialized);
      assert(
        Array.isArray(parsed.schedule) && typeof parsed.summary === "object",
        "round-trip serialization must preserve structure",
      );
    }
  });

  await test("Contract D: fork endpoint blocks OWNER self-fork", () => {
    const content = require("fs").readFileSync(
      "src/app/api/deals/[dealId]/fork/route.ts",
      "utf-8",
    );
    assert(
      content.includes("OWNER cannot fork their own deal"),
      "must block owner self-fork",
    );
  });

  await test("Contract D: fork does not mutate original deal", () => {
    const content = require("fs").readFileSync(
      "src/app/api/deals/[dealId]/fork/route.ts",
      "utf-8",
    );
    assert(!content.includes(".update("), "fork must not UPDATE any row in original deal");
    assert(!content.includes(".delete("), "fork must not DELETE any row in original deal");
  });

  await test("Contract D: fork creates new deal owned by requester", () => {
    const content = require("fs").readFileSync(
      "src/app/api/deals/[dealId]/fork/route.ts",
      "utf-8",
    );
    assert(content.includes("owner_user_id: user.id"), "new deal must be owned by requester");
    assert(
      content.includes('role: "OWNER"') && content.includes("deal_access_grants"),
      "must grant OWNER on new deal",
    );
  });

  await test("Contract G: widget package.json exports match dist artifacts", () => {
    const fs = require("fs");
    const pkg = JSON.parse(fs.readFileSync("packages/fractpath-calculator-widget/package.json", "utf-8"));
    assert(fs.existsSync("packages/fractpath-calculator-widget/" + pkg.main), `main (${pkg.main}) must exist`);
    assert(fs.existsSync("packages/fractpath-calculator-widget/" + pkg.types), `types (${pkg.types}) must exist`);
    const defaultExport = pkg.exports?.["."]?.default;
    if (defaultExport) {
      assert(
        fs.existsSync("packages/fractpath-calculator-widget/" + defaultExport),
        `exports default (${defaultExport}) must exist`,
      );
    }
  });

  await test("Contract G: Next.js can resolve widget package", () => {
    const fs = require("fs");
    const resolved = require.resolve("fractpath-calculator-widget");
    assert(fs.existsSync(resolved), "widget package must be resolvable");
  });

  console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);
  if (failed > 0) process.exit(1);
})();
