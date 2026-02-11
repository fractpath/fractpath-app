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

const VALID_DECISIONS = ["ACCEPT", "REJECT"] as const;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ dealId: string; versionId: string }> },
) {
  const { dealId, versionId } = await context.params;

  if (!isUuid(dealId)) {
    return jsonError("Invalid deal ID", 400);
  }

  if (!isUuid(versionId)) {
    return jsonError("Invalid version ID", 400);
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

  const decision = typeof body?.decision === "string"
    ? body.decision.trim().toUpperCase()
    : "";
  if (!decision || !(VALID_DECISIONS as readonly string[]).includes(decision)) {
    return jsonError("decision is required and must be ACCEPT or REJECT", 400);
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

  const { data: targetVersion, error: versionError } = await (
    service.from("deal_versions") as any
  )
    .select("id, deal_id, version_type")
    .eq("id", versionId)
    .maybeSingle();

  if (versionError || !targetVersion) {
    return jsonError("Version not found", 404);
  }

  if (targetVersion.deal_id !== dealId) {
    return jsonError("Version does not belong to this deal", 422);
  }

  const { data: existingDecisions, error: existingError } = await (
    service.from("deal_versions") as any
  )
    .select("id, version_type, meta")
    .eq("deal_id", dealId)
    .in("version_type", ["ACCEPT", "REJECT"])
    .limit(200);

  if (existingError) {
    console.error("Failed to check existing decisions:", existingError.message);
    return jsonError("Failed to check existing decisions", 500);
  }

  if (existingDecisions && existingDecisions.length > 0) {
    const alreadyDecided = existingDecisions.some(
      (d: any) => d.meta?.target_version_id === versionId,
    );
    if (alreadyDecided) {
      return jsonError("This version has already been decided", 409);
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
      version_type: decision,
      base_snapshot_id: null,
      proposed_snapshot_id: null,
      note,
      meta: { target_version_id: versionId },
    })
    .select("id, version_number")
    .single();

  if (insertError || !versionRow) {
    console.error("deal_versions insert error:", insertError?.message);
    return jsonError("Failed to create decision version", 500);
  }

  const { error: eventError } = await (service.from("deal_events") as any).insert({
    deal_id: dealId,
    event_type: "DEAL_VERSION_DECIDED",
    payload: {
      deal_version_id: versionRow.id,
      version_number: versionRow.version_number,
      decision,
      target_version_id: versionId,
    },
    created_by: user.id,
  });

  if (eventError) {
    console.error("deal_events insert error:", eventError.message);
  }

  return NextResponse.json(
    {
      ok: true,
      decision_version_id: versionRow.id,
      version_number: versionRow.version_number,
    },
    { status: 201 },
  );
}
