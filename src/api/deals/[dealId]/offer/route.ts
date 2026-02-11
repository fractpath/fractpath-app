import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getLatestDealVersion } from "@/lib/dealVersionDb";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

export async function POST(
  request: NextRequest,
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

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const proposedSnapshotId = typeof body?.proposed_snapshot_id === "string"
    ? body.proposed_snapshot_id.trim()
    : "";
  if (!proposedSnapshotId || !isUuid(proposedSnapshotId)) {
    return jsonError("proposed_snapshot_id is required and must be a valid UUID", 400);
  }

  const baseSnapshotId = typeof body?.base_snapshot_id === "string"
    ? body.base_snapshot_id.trim()
    : null;
  if (baseSnapshotId !== null && !isUuid(baseSnapshotId)) {
    return jsonError("base_snapshot_id must be a valid UUID if provided", 400);
  }

  const note = typeof body?.note === "string" ? body.note.trim() || null : null;

  const service = createServiceClient();

  const { data: deal, error: dealError } = await (service.from("deals") as any)
    .select("id, owner_user_id")
    .eq("id", dealId)
    .maybeSingle();

  if (dealError || !deal) {
    return jsonError("Deal not found", 404);
  }

  let isOwner = deal.owner_user_id === user.id;

  if (!isOwner) {
    const { data: grant } = await (service.from("deal_access_grants") as any)
      .select("role")
      .eq("deal_id", dealId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (grant?.role === "OWNER") isOwner = true;
  }

  if (!isOwner) {
    return jsonError("Forbidden (OWNER only)", 403);
  }

  const { data: proposedSnapshot, error: proposedError } = await (
    service.from("deal_snapshots") as any
  )
    .select("id, deal_id")
    .eq("id", proposedSnapshotId)
    .maybeSingle();

  if (proposedError || !proposedSnapshot) {
    return jsonError("proposed_snapshot_id not found", 404);
  }

  if (proposedSnapshot.deal_id !== dealId) {
    return jsonError("proposed_snapshot_id does not belong to this deal", 422);
  }

  if (baseSnapshotId) {
    const { data: baseSnapshot, error: baseError } = await (
      service.from("deal_snapshots") as any
    )
      .select("id, deal_id")
      .eq("id", baseSnapshotId)
      .maybeSingle();

    if (baseError || !baseSnapshot) {
      return jsonError("base_snapshot_id not found", 404);
    }

    if (baseSnapshot.deal_id !== dealId) {
      return jsonError("base_snapshot_id does not belong to this deal", 422);
    }
  }

  const latestVersion = await getLatestDealVersion(service, dealId);
  if (!latestVersion.ok) {
    console.error("Failed to fetch latest deal version:", latestVersion.error);
    return jsonError("Failed to determine version number", 500);
  }
  const nextVersionNumber =
    latestVersion.version !== null
      ? latestVersion.version.version_number + 1
      : 1;

  const { data: versionRow, error: insertError } = await (
    service.from("deal_versions") as any
  )
    .insert({
      deal_id: dealId,
      created_by: user.id,
      version_number: nextVersionNumber,
      version_type: "OFFER",
      base_snapshot_id: baseSnapshotId,
      proposed_snapshot_id: proposedSnapshotId,
      note,
      meta: {},
    })
    .select("id, version_number")
    .single();

  if (insertError || !versionRow) {
    console.error("deal_versions insert error:", insertError?.message);
    return jsonError("Failed to create offer version", 500);
  }

  const { error: eventError } = await (service.from("deal_events") as any).insert({
    deal_id: dealId,
    event_type: "DEAL_OFFER_CREATED",
    payload: {
      deal_version_id: versionRow.id,
      version_number: versionRow.version_number,
      proposed_snapshot_id: proposedSnapshotId,
      base_snapshot_id: baseSnapshotId,
    },
    created_by: user.id,
  });

  if (eventError) {
    console.error("deal_events insert error:", eventError.message);
  }

  return NextResponse.json(
    {
      ok: true,
      deal_version_id: versionRow.id,
      version_number: versionRow.version_number,
    },
    { status: 201 },
  );
}
