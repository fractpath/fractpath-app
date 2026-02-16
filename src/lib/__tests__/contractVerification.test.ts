import { computeDeal } from "../computeAdapter";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
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

console.log("\n--- Contract Verification (canonical v10) ---\n");

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
        !content.includes("from \"@/lib/computeAdapter\"") && !content.includes("from \"@fractpath/compute\""),
        "Client component " + f + " imports compute logic",
      );
    }
  });

  await test("Contract A: no stale src/api/ directory exists", () => {
    const fs = require("fs");
    assert(!fs.existsSync("src/api"), "src/api/ should not exist");
  });

  await test("Contract B: compute endpoint exists at App Router path", () => {
    const fs = require("fs");
    assert(
      fs.existsSync("src/app/api/deals/[dealId]/snapshot/compute/route.ts"),
      "compute route must exist",
    );
  });

  await test("Contract B: compute endpoint enforces OWNER-only", () => {
    const content = require("fs").readFileSync(
      "src/app/api/deals/[dealId]/snapshot/compute/route.ts",
      "utf-8",
    );
    assert(content.includes("OWNER"), "must check OWNER role");
    assert(content.includes("403"), "must return 403");
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

  await test("Contract C: snapshot includes compute_version mapped to contract_version", () => {
    const content = require("fs").readFileSync(
      "src/app/api/deals/[dealId]/snapshot/compute/route.ts",
      "utf-8",
    );
    assert(
      content.includes("contract_version: compute_version"),
      "must map compute_version to contract_version",
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

  await test("Contract C: canonical compute produces results with compute_version", async () => {
    const result = await computeDeal({
      deal_terms: {
        property_value: 500000,
        upfront_payment: 50000,
        monthly_payment: 500,
        number_of_payments: 120,
        payback_window_start_year: 3,
        payback_window_end_year: 7,
        timing_factor_early: 0.5,
        timing_factor_late: 1.5,
        floor_multiple: 1.0,
        ceiling_multiple: 3.0,
        downside_mode: "HARD_FLOOR",
        contract_maturity_years: 10,
        liquidity_trigger_year: 5,
        minimum_hold_years: 2,
        platform_fee: 0,
        servicing_fee_monthly: 0,
        exit_fee_pct: 0,
      },
      scenario: {
        annual_appreciation: 0.03,
        closing_cost_pct: 0.06,
        exit_year: 5,
      },
    });
    assert(result.ok === true, "compute must succeed");
    if (result.ok) {
      assert(
        typeof result.result.compute_version === "string" &&
          result.result.compute_version.startsWith("10"),
        "compute_version must start with 10",
      );
      assert(typeof result.result.results === "object", "results must be object");
      assert(typeof (result.result.results as any).invested_capital_total === "number", "has invested_capital_total");
      assert(typeof (result.result.results as any).isa_settlement === "number", "has isa_settlement");
    }
  });

  await test("Contract C: compute outputs are JSON-serializable", async () => {
    const result = await computeDeal({
      deal_terms: {
        property_value: 500000,
        upfront_payment: 50000,
        monthly_payment: 500,
        number_of_payments: 120,
        payback_window_start_year: 3,
        payback_window_end_year: 7,
        timing_factor_early: 0.5,
        timing_factor_late: 1.5,
        floor_multiple: 1.0,
        ceiling_multiple: 3.0,
        downside_mode: "HARD_FLOOR",
        contract_maturity_years: 10,
        liquidity_trigger_year: 5,
        minimum_hold_years: 2,
        platform_fee: 0,
        servicing_fee_monthly: 0,
        exit_fee_pct: 0,
      },
      scenario: {
        annual_appreciation: 0.03,
        closing_cost_pct: 0.06,
        exit_year: 5,
      },
    });
    assert(result.ok === true, "compute must succeed");
    if (result.ok) {
      const serialized = JSON.stringify(result.result.results);
      const parsed = JSON.parse(serialized);
      assert(typeof parsed.invested_capital_total === "number", "round-trip preserves structure");
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

  await test("Contract G: @fractpath/compute package exists and is resolvable", () => {
    const fs = require("fs");
    const pkg = JSON.parse(fs.readFileSync("packages/compute/package.json", "utf-8"));
    assert(pkg.name === "@fractpath/compute", "package name must be @fractpath/compute");
    assert(pkg.version === "10.0.0", "package version must be 10.0.0");
  });

  console.log("\n" + passed + " passed, " + failed + " failed out of " + (passed + failed) + " tests\n");
  if (failed > 0) process.exit(1);
})();
