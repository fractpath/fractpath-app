import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeDeal } from "@/lib/computeAdapter";
import { insertDealSnapshot } from "@/lib/dealSnapshotDb";
import { ensureScenario } from "@/lib/defaultScenario";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  // Homepage flow expects signed-in sessions (it shows "Signed in / Log out")
  if (userErr || !user) {
    return jsonError("Unauthorized", 401);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  // Keep lead-capture fields optional for now; canonical compute doesn't depend on them yet.
  // Later we can persist these onto deals/drafts.
  const { data: dealId, error: rpcErr } = await supabase.rpc(
    "create_deal_with_owner_grant",
    { p_user_id: user.id },
  );

  if (rpcErr || !dealId) {
    console.error("SUBMIT_CREATE_DEAL_FAILED", {
      message: rpcErr?.message,
      code: (rpcErr as any)?.code,
      details: (rpcErr as any)?.details,
      hint: (rpcErr as any)?.hint,
      body,
    });
    return jsonError(
      `Deal creation failed${(rpcErr as any)?.code ? ` (${(rpcErr as any).code})` : ""}`,
      500,
    );
  }

  const canonicalInputs = ensureScenario({
    deal_terms: {},
    scenario: {},
  });

  const computeResult = await computeDeal(canonicalInputs as any);
  if (!computeResult.ok) {
    console.error("SUBMIT_COMPUTE_FAILED", computeResult);
    // Return dealId anyway so user can land on deal page and use recompute button.
    return NextResponse.json({ ok: true, dealId }, { status: 201 });
  }

  const { compute_version, results } = computeResult.result;
  const computedAt = new Date().toISOString();

  const fullSnapshot = {
    contract_version: compute_version,
    schema_version: "1",
    inputs: canonicalInputs,
    outputs: { results },
    compute_version,
    computed_at: computedAt,
    computed_by: user.id,
  };

  const snapshotResult = await insertDealSnapshot(
    supabase as any,
    dealId as string,
    user.id,
    fullSnapshot,
  );

  if (!snapshotResult.ok) {
    console.error("SUBMIT_SNAPSHOT_INSERT_FAILED", snapshotResult);
    return NextResponse.json({ ok: true, dealId }, { status: 201 });
  }

  // Best-effort audit
  try {
    await (supabase.from("deal_events") as any).insert({
      deal_id: dealId,
      event_type: "DEAL_CREATED",
      payload: { source: "homepage_submit" },
      created_by: user.id,
    });

    await (supabase.from("deal_events") as any).insert({
      deal_id: dealId,
      event_type: "DEAL_SNAPSHOT_COMPUTED",
      payload: {
        snapshot_id: snapshotResult.id,
        compute_version,
        computed_at: computedAt,
      },
      created_by: user.id,
    });
  } catch (e: any) {
    console.error("SUBMIT_AUDIT_EVENT_FAILED", e?.message);
  }

  return NextResponse.json({ ok: true, dealId }, { status: 201 });
}
