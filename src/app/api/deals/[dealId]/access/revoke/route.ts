import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ dealId: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return jsonError("Unauthorized", 401);

  const { dealId } = await ctx.params;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  const grantId = typeof body?.grantId === "string" ? body.grantId.trim() : "";
  if (!grantId) {
    return jsonError("grantId is required");
  }

  const { data: ownerGrant } = await (
    supabase.from("deal_access_grants") as any
  )
    .select("id, role")
    .eq("deal_id", dealId)
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();

  if (ownerGrant?.role !== "OWNER") {
    return jsonError("Forbidden (OWNER only)", 403);
  }

  if (ownerGrant.id === grantId) {
    return jsonError("Cannot revoke your own OWNER grant", 400);
  }

  const service = createServiceClient();

  const { data: target } = await (
    service.from("deal_access_grants") as any
  )
    .select("id, user_id, role")
    .eq("id", grantId)
    .eq("deal_id", dealId)
    .is("revoked_at", null)
    .maybeSingle();

  if (!target) {
    return jsonError("Grant not found or already revoked", 404);
  }

  if (target.role === "OWNER") {
    return jsonError("Cannot revoke an OWNER grant", 400);
  }

  const { error: updateError } = await (
    service.from("deal_access_grants") as any
  )
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", grantId)
    .eq("deal_id", dealId)
    .is("revoked_at", null);

  if (updateError) {
    console.error("revoke_grant_error", updateError.message);
    return jsonError("Failed to revoke grant", 500);
  }

  try {
    await (service.from("deal_events") as any).insert({
      deal_id: dealId,
      event_type: "ACCESS_REVOKED",
      payload: {
        revoked_grant_id: grantId,
        revoked_user_id: target.user_id,
        revoked_role: target.role,
      },
      created_by: user.id,
    });
  } catch (eventErr: any) {
    console.error("deal_events audit insert error:", eventErr?.message);
  }

  return NextResponse.json({
    ok: true,
    revoked: {
      id: grantId,
      user_id: target.user_id,
      role: target.role,
    },
  });
}
