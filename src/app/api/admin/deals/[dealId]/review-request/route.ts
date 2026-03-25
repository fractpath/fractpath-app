import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";
import { sendInlineEmail } from "@/lib/email/sendInlineEmail";
import { getAppBaseUrlServer } from "@/lib/appBaseUrl";

const ALLOWED_STATUS = new Set(["open", "submitted", "resolved"]);

const ALLOWED_NEXT_TRIAGE = new Set([
  "triage_in_progress",
  "ready_for_deposit",
  "ineligible",
]);

const NEXT_TRIAGE_EVENT: Record<string, string> = {
  triage_in_progress: "DEAL_TRIAGE_RETURNED_TO_REVIEW",
  ready_for_deposit: "DEAL_TRIAGE_READY_FOR_DEPOSIT",
  ineligible: "DEAL_TRIAGE_INELIGIBLE",
};

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

  // Notify homeowner — best-effort, non-blocking
  try {
    const { data: propRow } = await (svc.from("properties") as any)
      .select("owner_user_id, address_line1, city, state")
      .eq("id", body.property_id)
      .maybeSingle();

    const ownerUserId: string | null = propRow?.owner_user_id ?? null;
    if (ownerUserId) {
      const { data: ownerAuth } = await svc.auth.admin.getUserById(ownerUserId);
      const ownerEmail = ownerAuth?.user?.email?.toLowerCase() ?? null;

      if (ownerEmail) {
        const from = process.env.RESEND_FROM_EMAIL ?? "notifications@notify.fractpath.com";
        const addressParts = [propRow?.address_line1, propRow?.city, propRow?.state].filter(Boolean);
        const addressDisplay = addressParts.join(", ") || "your property";
        const appBase = getAppBaseUrlServer();
        const actionUrl = `${appBase}/properties/${body.property_id}`;
        const itemsHtml = (body.requested_items as Array<{ label: string }>)
          .map((i) => `<li style="margin-bottom:4px;">${i.label}</li>`)
          .join("");
        const adminNoteHtml = body.admin_note
          ? `<p style="margin-top:12px;padding:10px 12px;background:#fefce8;border-left:3px solid #ca8a04;font-size:14px;">${body.admin_note}</p>`
          : "";

        await sendInlineEmail({
          to: ownerEmail,
          from,
          subject: "Additional information needed for your property review",
          html: `
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111;">
              <p style="font-size:15px;margin-bottom:12px;">Hi,</p>
              <p style="font-size:15px;margin-bottom:16px;">
                FractPath needs a few more details before the review for
                <strong>${addressDisplay}</strong> can continue.
              </p>
              <p style="font-size:14px;font-weight:600;margin-bottom:6px;">Requested items:</p>
              <ul style="font-size:14px;margin:0 0 16px;padding-left:20px;">${itemsHtml}</ul>
              ${adminNoteHtml}
              <p style="margin-top:20px;">
                <a href="${actionUrl}" style="display:inline-block;padding:10px 20px;background:#111;color:#fff;text-decoration:none;border-radius:4px;font-size:14px;">
                  View property details
                </a>
              </p>
              <p style="font-size:12px;color:#888;margin-top:20px;">
                You can edit your property details, upload or replace documents, and add a note for our team.
              </p>
            </div>
          `,
        });

        console.log("review_request_homeowner_notified", {
          dealId,
          propertyId: body.property_id,
          ownerEmail: "[redacted]",
        });
      }
    }
  } catch (emailErr: any) {
    console.error("review_request_homeowner_notify_failed", {
      dealId,
      propertyId: body.property_id,
      error: emailErr?.message,
    });
  }

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

  let body: {
    request_id?: string;
    action?: string;
    next_triage_status?: string;
    resolved_note?: string | null;
  };
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

  if (!body.next_triage_status || !ALLOWED_NEXT_TRIAGE.has(body.next_triage_status)) {
    return NextResponse.json(
      {
        ok: false,
        error: "next_triage_status must be one of: triage_in_progress, ready_for_deposit, ineligible",
      },
      { status: 400 },
    );
  }

  const nextTriageStatus = body.next_triage_status;
  const resolvedNote = body.resolved_note?.trim() || null;

  const svc = createServiceClient();
  const now = new Date().toISOString();

  // Resolve the review request
  const { data: updated, error: upErr } = await (svc.from("deal_review_requests") as any)
    .update({
      status: "resolved",
      resolved_at: now,
      resolved_note: resolvedNote,
      updated_at: now,
    })
    .eq("id", body.request_id)
    .eq("deal_id", dealId)
    .select()
    .single();

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  // Advance the linked deal's triage_status to the chosen next step
  const { error: triageErr } = await (svc.from("deals") as any)
    .update({ triage_status: nextTriageStatus })
    .eq("id", dealId);

  if (triageErr) {
    console.error("deal_triage_update_failed", { dealId, nextTriageStatus, error: triageErr.message });
    // Continue — the review request is already resolved; triage update is critical but we log and surface
    return NextResponse.json({ ok: false, error: `Triage update failed: ${triageErr.message}` }, { status: 500 });
  }

  // Log property-side event: request resolved + chosen next step
  await insertEvent(svc, dealId, admin.user.id, "DEAL_REVIEW_REQUEST_RESOLVED", {
    request_id: body.request_id,
    next_triage_status: nextTriageStatus,
    resolved_note: resolvedNote,
  });

  // Log deal-side event specific to the chosen next step
  const dealSideEvent = NEXT_TRIAGE_EVENT[nextTriageStatus];
  if (dealSideEvent) {
    await insertEvent(svc, dealId, admin.user.id, dealSideEvent, {
      request_id: body.request_id,
      previous_triage_status: "more_info_needed",
    });
  }

  return NextResponse.json({ ok: true, request: updated }, { status: 200 });
}
