// scripts/generateCanonicalSnapshots.ts
import { createClient } from "@supabase/supabase-js";
import { computeDeal } from "../src/lib/computeAdapter";
import { insertDealSnapshot } from "../src/lib/dealSnapshotDb";

type UUID = string;

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  if (i === -1) return null;
  return process.argv[i + 1] ?? null;
}

function pickScenario(i: number) {
  // Small, deliberate variations to prove snapshots differ
  const scenarios = [
    {
      annual_appreciation: 0.03,
      closing_cost_pct: 0.06,
      exit_year: 10,
      fmv_override: null as number | null,
    },
    {
      annual_appreciation: 0.03,
      closing_cost_pct: 0.06,
      exit_year: 3,
      fmv_override: null as number | null,
    },
    {
      annual_appreciation: 0.03,
      closing_cost_pct: 0.06,
      exit_year: 15,
      fmv_override: null as number | null,
    },
    {
      annual_appreciation: 0.05,
      closing_cost_pct: 0.06,
      exit_year: 10,
      fmv_override: null as number | null,
    },
    {
      annual_appreciation: 0.01,
      closing_cost_pct: 0.06,
      exit_year: 10,
      fmv_override: null as number | null,
    },
  ];
  return scenarios[i % scenarios.length];
}

async function main() {
  const ownerUserId = arg("--owner");
  const limitRaw = arg("--limit") ?? "5";

  if (!ownerUserId || !isUuid(ownerUserId)) {
    throw new Error(
      "Usage: npx tsx scripts/generateCanonicalSnapshots.ts --owner <OWNER_USER_ID_UUID> [--limit 5]",
    );
  }

  const limit = Number(limitRaw);
  if (!Number.isFinite(limit) || limit < 1 || limit > 50) {
    throw new Error("--limit must be an integer between 1 and 50");
  }

  const url = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  // Canonical inputs fixture (DealTerms must match packages/compute/src/types.ts)
  const baseDealTerms = {
    property_value: 500000,
    upfront_payment: 50000,
    monthly_payment: 0,
    number_of_payments: 0,

    floor_multiple: 1.0,
    ceiling_multiple: 3.0,
    downside_mode: "HARD_FLOOR" as const,

    payback_window_start_year: 3,
    payback_window_end_year: 10,
    timing_factor_early: 0.7,
    timing_factor_late: 0.9,

    duration_yield_floor_enabled: false,
    duration_yield_floor_start_year: null as number | null,
    duration_yield_floor_min_multiple: null as number | null,
  };

  let ok = 0;
  let failed = 0;
  const createdDealIds: UUID[] = [];

  console.log(
    `Creating ${limit} deal(s) for owner ${ownerUserId} and inserting canonical snapshots...`,
  );

  for (let i = 0; i < limit; i++) {
    // 1) Create a new deal owned by the user (service role)
    const { data: newDeal, error: dealErr } = await (
      supabase.from("deals") as any
    )
      .insert({
        owner_user_id: ownerUserId,
        status: "ACTIVE",
        created_from: "script_generate_canonical_snapshots",
        source_ref: `seed:${new Date().toISOString()}:${i}`,
        mode: "app",
      })
      .select("id")
      .single();

    if (dealErr || !newDeal?.id) {
      failed++;
      console.error(
        `[FAIL deal insert] i=${i} err=${dealErr?.message ?? "unknown"}`,
      );
      continue;
    }

    const dealId: UUID = newDeal.id;
    createdDealIds.push(dealId);

    // 2) Ensure OWNER grant exists (some flows check grants table)
    const { error: grantErr } = await (
      supabase.from("deal_access_grants") as any
    ).insert({
      deal_id: dealId,
      user_id: ownerUserId,
      role: "OWNER",
      created_by: ownerUserId,
    });

    // If you have uniqueness constraints, a duplicate insert may error; treat as non-fatal.
    if (grantErr) {
      console.warn(
        `[WARN grant insert] deal=${dealId} err=${grantErr.message}`,
      );
    }

    // 3) Compute canonical outputs via adapter boundary
    const scenario = pickScenario(i);

    const compute = await computeDeal({
      deal_terms: baseDealTerms as any,
      scenario: scenario as any,
    });

    if (!compute.ok) {
      failed++;
      console.error(
        `[FAIL compute] deal=${dealId} code=${compute.code} err=${compute.error}`,
      );
      continue;
    }

    const computedAt = new Date().toISOString();

    // Canonical-only structure: outputs always wrap the canonical compute results.
    const canonicalOutputs: Record<string, unknown> = {
      results: compute.result.results,
    };

    const canonicalSnapshot = {
      compute_version: compute.result.compute_version,
      computed_at: computedAt,
      inputs: {
        deal_terms: baseDealTerms,
        scenario,
      },
      assumptions: {}, // keep explicit even if empty
      outputs: canonicalOutputs,
    };

    // 4) Persist in deal_snapshots (append-only)
    const fullSnapshot = {
      contract_version: compute.result.compute_version,
      schema_version: "1",
      inputs: {
        deal_terms: baseDealTerms,
        scenario,
      },
      outputs: canonicalOutputs,
      computed_at: computedAt,
      computed_by: ownerUserId,
      canonicalSnapshot,
      snapshot_source: "script",
    };

    const snap = await insertDealSnapshot(
      supabase as any,
      dealId,
      ownerUserId,
      fullSnapshot,
    );

    if (!snap.ok) {
      failed++;
      console.error(
        `[FAIL snapshot insert] deal=${dealId} code=${snap.code} err=${snap.error} detail=${snap.detail ?? ""}`,
      );
      continue;
    }

    // Optional audit event (non-blocking)
    const { error: eventErr } = await (
      supabase.from("deal_events") as any
    ).insert({
      deal_id: dealId,
      event_type: "DEAL_SNAPSHOT_COMPUTED",
      payload: {
        snapshot_id: snap.id,
        compute_version: compute.result.compute_version,
        computed_at: computedAt,
        source: "script_generate_canonical_snapshots",
      },
      created_by: ownerUserId,
    });

    if (eventErr) {
      console.warn(
        `[WARN event insert] deal=${dealId} err=${eventErr.message}`,
      );
    }

    ok++;
    console.log(
      `[OK] deal=${dealId} snapshot=${snap.id} compute_version=${compute.result.compute_version}`,
    );
  }

  console.log("\n--- DONE ---");
  console.log("ok =", ok, "failed =", failed);
  console.log("created_deal_ids =", createdDealIds);
}

main().catch((e) => {
  console.error("Script error:", e?.message ?? e);
  process.exit(1);
});
