import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";

const ALLOWED_STATUS = new Set(["open", "submitted", "resolved"]);

async function insertEvent(
  svc: ReturnType<typeof createServiceClient>,
  dealId: string,
  actorId: string,
  eventType: string,
  payload: Record<string, unknown>,
) {
  try {
    await (svc.from("deal_events") as any).insert({
      deal_id: dealId,
      event_type: eventType,
      payload,
      created_by: actorId,
    });
  } catch {
    // best-effort
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ dealId: string }> },
) {
  const { dealId } = await ctx.params;

  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let body: {
    property_id?: string;
    requested_items?: Array<{ type: string; label: string }>;
    admin_note?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.property_id) {
    return NextResponse.json(
      { ok: false, error: "property_id is required" },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.requested_items) || body.requested_items.length === 0) {
    return NextResponse.json(
      { ok: false, error: "At least one requested item is required" },
      { status: 400 },
    );
  }

  const svc = createServiceClient();

  // Verify deal exists
  const { data: deal, error: dealErr } = await (svc.from("deals") as any)
    .select("id, triage_status")
    .eq("id", dealId)
    .maybeSingle();
  if (dealErr || !deal) {
    return NextResponse.json({ ok: false, error: "Deal not found" }, { status: 404 });
  }

  // Find existing open request for this deal/property
  const { data: existing } = await (svc.from("deal_review_requests") as any)
    .select("id, status")
    .eq("deal_id", dealId)
    .eq("property_id", body.property_id)
    .in("status", ["open", "submitted"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const now = new Date().toISOString();
  let request: any;

  if (existing) {
    // Update existing open/submitted request
    const { data: updated, error: upErr } = await (svc.from("deal_review_requests") as any)
      .update({
        requested_items: body.requested_items,
        admin_note: body.admin_note ?? null,
        status: "open",
        updated_at: now,
      })
      .eq("id", existing.id)
      .select()
      .single();
    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }
    request = updated;
  } else {
    // Create new request
    const { data: created, error: insErr } = await (svc.from("deal_review_requests") as any)
      .insert({
        deal_id: dealId,
        property_id: body.property_id,
        status: "open",
        requested_items: body.requested_items,
        admin_note: body.admin_note ?? null,
        created_by: admin.user.id,
      })
      .select()
      .single();
    if (insErr) {
      return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
    }
    request = created;
  }

  // Set triage_status = more_info_needed if not already
  if (deal.triage_status !== "more_info_needed") {
    await (svc.from("deals") as any)
      .update({ triage_status: "more_info_needed" })
      .eq("id", dealId);
  }

  await insertEvent(svc, dealId, admin.user.id, "DEAL_REVIEW_REQUEST_OPENED", {
    request_id: request.id,
    property_id: body.property_id,
    requested_items: body.requested_items,
    was_update: !!existing,
  });

  return NextResponse.json({ ok: true, request }, { status: 200 });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ dealId: string }> },
) {
  const { dealId } = await ctx.params;

  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let body: { request_id?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.request_id) {
    return NextResponse.json({ ok: false, error: "request_id is required" }, { status: 400 });
  }

  if (body.action !== "resolve") {
    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  }

  const svc = createServiceClient();

  const now = new Date().toISOString();
  const { data: updated, error: upErr } = await (svc.from("deal_review_requests") as any)
    .update({ status: "resolved", resolved_at: now, updated_at: now })
    .eq("id", body.request_id)
    .eq("deal_id", dealId)
    .select()
    .single();

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  await insertEvent(svc, dealId, admin.user.id, "DEAL_REVIEW_REQUEST_RESOLVED", {
    request_id: body.request_id,
  });

  return NextResponse.json({ ok: true, request: updated }, { status: 200 });
}
