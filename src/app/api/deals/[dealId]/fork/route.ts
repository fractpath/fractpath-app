import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
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

  if (!isUuid(dealId)) return jsonError("Invalid deal ID", 400);

  // Auth is user-scoped
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return jsonError("Unauthorized", 401);

  // All DB operations for fork use service client (RLS-safe for create)
  const service = createServiceClient();

  const { data: originalDeal, error: dealError } = await (
    service.from("deals") as any
  )
    .select("id, owner_user_id, mode")
    .eq("id", dealId)
    .maybeSingle();

  if (dealError || !originalDeal) {
    return jsonError("Deal not found", 404);
  }

  // Access check: user must at least be able to view the source deal
  const { data: grant } = await (service.from("deal_access_grants") as any)
    .select("role")
    .eq("deal_id", dealId)
    .eq("user_id", user.id)
    .maybeSingle();

  const hasAccess =
    originalDeal.owner_user_id === user.id ||
    (grant?.role && ["OWNER", "VIEWER", "COUNTERPARTY"].includes(grant.role));

  if (!hasAccess) {
    return jsonError("Forbidden (no access to source deal)", 403);
  }

  // Owner self-fork is explicitly blocked
  if (originalDeal.owner_user_id === user.id || grant?.role === "OWNER") {
    return jsonError(
      "OWNER cannot fork their own deal; use compute instead",
      400,
    );
  }

  // Create new deal owned by requester
  const { data: newDeal, error: insertDealError } = await (
    service.from("deals") as any
  )
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

  // Ensure explicit OWNER grant on the new deal (idempotent).
  // If a trigger already created this row, ignore duplicates.
  const { error: grantError } = await (
    service.from("deal_access_grants") as any
  ).upsert(
    {
      deal_id: newDeal.id,
      user_id: user.id,
      role: "OWNER",
      created_by: user.id,
    },
    {
      onConflict: "deal_id,user_id",
      ignoreDuplicates: true,
    },
  );

  if (grantError) {
    console.error("grant upsert error:", grantError);
    return jsonError("Failed to assign ownership on forked deal", 500);
  }

  // Copy latest snapshot as a baseline if one exists
  let baselineSnapshotId: string | null = null;
  const latestResult = await getLatestDealSnapshot(service, dealId);

  if (latestResult.ok && latestResult.snapshot) {
    const src = latestResult.snapshot;

    const { data: copiedSnap, error: snapError } = await (
      service.from("deal_snapshots") as any
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

  // Audit event
  const { error: eventError } = await (
    service.from("deal_events") as any
  ).insert({
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
