import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ propertyId: string }> },
) {
  const { propertyId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: { request_id?: string; homeowner_note?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.request_id) {
    return NextResponse.json({ ok: false, error: "request_id is required" }, { status: 400 });
  }

  const svc = createServiceClient();

  // Verify property access: owner, creator, or claimer
  const { data: prop } = await (svc.from("properties") as any)
    .select("id")
    .eq("id", propertyId)
    .or(
      `owner_user_id.eq.${user.id},created_by_user_id.eq.${user.id},claimed_by_user_id.eq.${user.id}`,
    )
    .maybeSingle();

  if (!prop) {
    return NextResponse.json({ ok: false, error: "Property not found" }, { status: 404 });
  }

  // Verify the request belongs to this property and is in an actionable state
  const { data: request } = await (svc.from("deal_review_requests") as any)
    .select("id, deal_id, status")
    .eq("id", body.request_id)
    .eq("property_id", propertyId)
    .in("status", ["open", "submitted"])
    .maybeSingle();

  if (!request) {
    return NextResponse.json(
      { ok: false, error: "Review request not found or not actionable" },
      { status: 404 },
    );
  }

  const now = new Date().toISOString();
  const { data: updated, error: upErr } = await (svc.from("deal_review_requests") as any)
    .update({
      status: "submitted",
      homeowner_note: body.homeowner_note?.trim() || null,
      submitted_at: now,
      updated_at: now,
    })
    .eq("id", request.id)
    .select()
    .single();

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  // Best-effort event log
  try {
    await (svc.from("deal_events") as any).insert({
      deal_id: request.deal_id,
      event_type: "DEAL_REVIEW_REQUEST_SUBMITTED",
      payload: {
        request_id: request.id,
        property_id: propertyId,
        has_homeowner_note: !!(body.homeowner_note?.trim()),
      },
      created_by: user.id,
    });
  } catch {
    // best-effort
  }

  return NextResponse.json({ ok: true, request: updated }, { status: 200 });
}
