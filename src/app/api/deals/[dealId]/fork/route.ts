import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLatestDealSnapshot } from "@/lib/dealSnapshotDb";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ dealId: string }> },
) {
  const { dealId } = await context.params;

  if (!isUuid(dealId)) {
    return jsonError("Invalid deal ID", 400);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  // Enforce access via deal_access_grants (RLS-backed). Only OWNER/VIEWER exist.
  const { data: grant, error: grantError } = await (supabase
    .from("deal_access_grants") as any)
    .select("role")
    .eq("deal_id", dealId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (grantError) {
    return jsonError("Failed to verify access", 500);
  }

  if (!grant?.role || !["OWNER", "VIEWER"].includes(grant.role)) {
    return jsonError("Forbidden (no access to source deal)", 403);
  }

  // Viewer counter model: viewers fork; owners revise in-place via compute/save.
  if (grant.role === "OWNER") {
    return jsonError("OWNER cannot fork their own deal; use compute instead", 400);
  }

  // Load source deal (read should be permitted by RLS if viewer has access).
  const { data: originalDeal, error: dealError } = await (supabase.from("deals") as any)
    .select("id, mode")
    .eq("id", dealId)
    .maybeSingle();

  if (dealError || !originalDeal) {
    return jsonError("Deal not found", 404);
  }

  // Create new deal owned by the requester.
  const { data: newDeal, error: insertDealError } = await (supabase.from("deals") as any)
    .insert({
      owner_user_id: user.id,
      status: "IMPORTED",
      created_from: "fork",
      source_ref: `fork:${dealId}`,
      mode: originalDeal.mode ?? "app",
    })
    .select("id, created_at")
    .single();

  if (insertDealError || !newDeal) {
    console.error("deal insert error:", insertDealError?.message);
    return jsonError("Failed to create forked deal", 500);
  }

  // Grant OWNER on new deal to the requester.
  const { error: newGrantError } = await (supabase.from("deal_access_grants") as any).insert(
    {
      deal_id: newDeal.id,
      user_id: user.id,
      role: "OWNER",
      created_by: user.id,
    },
  );

  if (newGrantError) {
    console.error("grant insert error:", newGrantError.message);
    return jsonError("Failed to assign ownership on forked deal", 500);
  }

  // Best-effort copy of latest snapshot from source deal into new deal.
  let baselineSnapshotId: string | null = null;

  const latestResult = await getLatestDealSnapshot(supabase as any, dealId);
  if (latestResult.ok && latestResult.snapshot) {
    const src = latestResult.snapshot;

    const { data: copiedSnap, error: snapError } = await (
      supabase.from("deal_snapshots") as any
    )
      .insert({
        deal_id: newDeal.id,
        created_by: user.id,
        contract_version: src.contract_version,
        schema_version: src.schema_version,
        input_hash: src.input_hash,
        output_hash: src.output_hash,
        snapshot_json: src.snapshot_json,
      })
      .select("id")
      .single();

    if (snapError) {
      console.error("snapshot copy error:", snapError.message);
    } else {
      baselineSnapshotId = copiedSnap?.id ?? null;
    }
  }

  // Audit event (best-effort)
  const { error: eventError } = await (supabase.from("deal_events") as any).insert({
    deal_id: newDeal.id,
    event_type: "DEAL_CREATED",
    payload: {
      source: "fork",
      forked_from_deal_id: dealId,
      baseline_snapshot_id: baselineSnapshotId,
    },
    created_by: user.id,
  });

  if (eventError) {
    console.error("deal_events insert error:", eventError.message);
  }

  return NextResponse.json(
    {
      ok: true,
      deal_id: newDeal.id,
      forked_from: dealId,
      baseline_snapshot_id: baselineSnapshotId,
      redirect_url: `/deal/${newDeal.id}`,
    },
    { status: 201 },
  );
}
