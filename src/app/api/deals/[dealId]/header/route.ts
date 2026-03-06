import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ dealId: string }> },
) {
  const { dealId } = await ctx.params;

  if (!dealId) return jsonError("Missing dealId", 400);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return jsonError("Unauthorized", 401);

  const { data: deal } = await supabase
    .from("deals")
    .select("id, owner_user_id")
    .eq("id", dealId)
    .maybeSingle();

  if (!deal) return jsonError("Deal not found", 404);

  const isOwnerByField = (deal as any).owner_user_id === user.id;

  const { data: grant } = await supabase
    .from("deal_access_grants")
    .select("role")
    .eq("deal_id", dealId)
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .eq("role", "OWNER")
    .maybeSingle();

  if (!grant && !isOwnerByField) return jsonError("Forbidden", 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  const title = typeof body?.title === "string" ? body.title.trim() : null;
  const property_id =
    typeof body?.property_id === "string" ? body.property_id.trim() : null;
  const display_address =
    typeof body?.display_address === "string"
      ? body.display_address.trim()
      : null;
  const property_status =
    typeof body?.property_status === "string" ? body.property_status : null;
  const ownership_status =
    typeof body?.ownership_status === "string" ? body.ownership_status : null;

  // Use service client for event insert to avoid RLS blocking inserts into deal_events.
  // Authorization is still enforced above via user + owner/grant checks.
  const svc = createServiceClient();
  const { error } = await (svc.from("deal_events") as any).insert({
    deal_id: dealId,
    event_type: "DEAL_HEADER_UPDATED",
    payload: {
      title,
      property_id,
      display_address,
      property_status,
      ownership_status,
    },
    created_by: user.id,
  });

  if (error) {
    console.error("deal_header_persist_error", {
      dealId,
      userId: user.id,
      code: error.code,
      message: error.message,
      details: (error as any).details,
      hint: (error as any).hint,
    });
    return jsonError("Failed to persist header", 500);
  }

  return NextResponse.json({ ok: true });
}

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ dealId: string }> },
) {
  const { dealId } = await ctx.params;

  if (!dealId) return jsonError("Missing dealId", 400);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return jsonError("Unauthorized", 401);

  const { data: event } = await (supabase.from("deal_events") as any)
    .select("payload")
    .eq("deal_id", dealId)
    .eq("event_type", "DEAL_HEADER_UPDATED")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const payload = event?.payload ?? {};

  return NextResponse.json({
    ok: true,
    title: payload.title ?? null,
    property_id: payload.property_id ?? null,
    display_address: payload.display_address ?? null,
    property_status: payload.property_status ?? null,
    ownership_status: payload.ownership_status ?? null,
  });
}
