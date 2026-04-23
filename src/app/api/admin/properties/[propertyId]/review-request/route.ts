/**
 * POST   /api/admin/properties/[propertyId]/review-request
 *   Create or update a property-scoped additional-information request.
 *   Uses deal_id = NULL — no linked deal is required.
 *   Notifies the property owner (owner_user_id) by email, or the ops inbox
 *   if no owner is attached yet.
 *
 * PATCH  /api/admin/properties/[propertyId]/review-request
 *   Resolve a property-scoped review request. No triage status change —
 *   admin uses AdminPropertyReviewControls to advance property_review_status.
 *
 * Response on success:
 *   { ok: true, request: <row> }
 *
 * Response on error:
 *   { ok: false, error: "<message>" }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";
import { sendInlineEmail } from "@/lib/email/sendInlineEmail";
import { getAppBaseUrlServer } from "@/lib/appBaseUrl";

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

type Ctx = { params: Promise<{ propertyId: string }> };

// ── POST — create / update property review request ────────────────────────

export async function POST(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin();
  if (!admin.ok) return jsonError(admin.error, admin.status);

  const { propertyId } = await ctx.params;
  if (!propertyId) return jsonError("Missing propertyId", 400);

  let body: {
    requested_items?: Array<{ type: string; label: string }>;
    admin_note?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  if (!Array.isArray(body.requested_items) || body.requested_items.length === 0) {
    return jsonError("At least one requested item is required", 400);
  }

  const svc = createServiceClient();

  // Verify property exists
  const { data: prop, error: propErr } = await (svc.from("properties") as any)
    .select("id, owner_user_id, address_line1, city, state")
    .eq("id", propertyId)
    .maybeSingle();
  if (propErr || !prop) {
    return jsonError("Property not found", 404);
  }

  // Find existing open/submitted property-native request (deal_id IS NULL)
  const { data: existing } = await (svc.from("deal_review_requests") as any)
    .select("id, status")
    .eq("property_id", propertyId)
    .is("deal_id", null)
    .in("status", ["open", "submitted"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const now = new Date().toISOString();
  let request: any;
  const wasNew = !existing;

  if (existing) {
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
    if (upErr) return jsonError(upErr.message, 500);
    request = updated;
  } else {
    const { data: created, error: insErr } = await (svc.from("deal_review_requests") as any)
      .insert({
        deal_id: null,
        property_id: propertyId,
        status: "open",
        requested_items: body.requested_items,
        admin_note: body.admin_note ?? null,
        created_by: admin.user.id,
      })
      .select()
      .single();
    if (insErr) return jsonError(insErr.message, 500);
    request = created;
  }

  console.log("property_review_request_saved", {
    propertyId,
    requestId: request.id,
    wasNew,
    itemCount: body.requested_items.length,
  });

  // ── Property audit entry ───────────────────────────────────────────────────
  try {
    await (svc.from("property_status_audit") as any).insert({
      property_id: propertyId,
      from_status: wasNew ? "none" : "information_requested",
      to_status: "information_requested",
      changed_by: admin.user.id,
      actor_type: "admin",
      notes: wasNew
        ? `Admin created property information request (${body.requested_items.length} item${body.requested_items.length === 1 ? "" : "s"})`
        : `Admin updated property information request (${body.requested_items.length} item${body.requested_items.length === 1 ? "" : "s"})`,
    });
  } catch {
    // best-effort — do not fail if audit write fails
  }

  // ── Notify property owner / fallback to ops inbox ─────────────────────────
  void notifyOwner({
    svc,
    prop,
    requestedItems: body.requested_items,
    adminNote: body.admin_note ?? null,
    adminId: admin.user.id,
  }).catch((err) =>
    console.error("property_review_request_notify_error", {
      propertyId,
      error: err?.message,
    }),
  );

  return NextResponse.json({ ok: true, request }, { status: 200 });
}

// ── PATCH — resolve property review request ───────────────────────────────

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin();
  if (!admin.ok) return jsonError(admin.error, admin.status);

  const { propertyId } = await ctx.params;
  if (!propertyId) return jsonError("Missing propertyId", 400);

  let body: { request_id?: string; resolved_note?: string | null };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  if (!body.request_id) return jsonError("request_id is required", 400);

  const svc = createServiceClient();
  const now = new Date().toISOString();

  const { data: updated, error: upErr } = await (svc.from("deal_review_requests") as any)
    .update({
      status: "resolved",
      resolved_at: now,
      resolved_note: body.resolved_note?.trim() || null,
      updated_at: now,
    })
    .eq("id", body.request_id)
    .eq("property_id", propertyId)
    .is("deal_id", null)
    .select()
    .single();

  if (upErr) return jsonError(upErr.message, 500);

  console.log("property_review_request_resolved", {
    propertyId,
    requestId: body.request_id,
    adminId: admin.user.id,
  });

  // ── Property audit entry for resolve ──────────────────────────────────────
  try {
    await (svc.from("property_status_audit") as any).insert({
      property_id: propertyId,
      from_status: "information_requested",
      to_status: "resolved",
      changed_by: admin.user.id,
      actor_type: "admin",
      notes: body.resolved_note?.trim()
        ? `Admin resolved information request: ${body.resolved_note.trim()}`
        : "Admin resolved property information request",
    });
  } catch {
    // best-effort — do not fail if audit write fails
  }

  return NextResponse.json({ ok: true, request: updated }, { status: 200 });
}

// ── Notification helper ───────────────────────────────────────────────────

async function notifyOwner(opts: {
  svc: ReturnType<typeof createServiceClient>;
  prop: { id: string; owner_user_id: string | null; address_line1: string | null; city: string | null; state: string | null };
  requestedItems: Array<{ type: string; label: string }>;
  adminNote: string | null;
  adminId: string;
}): Promise<void> {
  const { svc, prop, requestedItems, adminNote } = opts;

  const from = process.env.RESEND_FROM_EMAIL ?? "notifications@notify.fractpath.com";
  const appBase = getAppBaseUrlServer();
  const actionUrl = `${appBase}/properties/${prop.id}`;

  const addressParts = [prop.address_line1, prop.city, prop.state].filter(Boolean);
  const addressDisplay = addressParts.join(", ") || "your property";

  const itemsHtml = requestedItems
    .map((i) => `<li style="margin-bottom:4px;">${i.label}</li>`)
    .join("");
  const adminNoteHtml = adminNote
    ? `<p style="margin-top:12px;padding:10px 12px;background:#fefce8;border-left:3px solid #ca8a04;font-size:14px;white-space:pre-wrap;">${adminNote}</p>`
    : "";

  const subject = "Additional information needed for your property review";
  const html = `
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
        You can update your property details, upload documents, and leave a note for our team.
      </p>
    </div>
  `;

  // Priority 1: attached registered owner
  const ownerUserId: string | null = prop.owner_user_id ?? null;
  if (ownerUserId) {
    const { data: ownerAuth } = await svc.auth.admin.getUserById(ownerUserId);
    const ownerEmail = ownerAuth?.user?.email?.toLowerCase() ?? null;
    if (ownerEmail) {
      await sendInlineEmail({ to: ownerEmail, from, subject, html });
      console.log("property_review_request_owner_notified", {
        propertyId: prop.id,
        ownerEmail: "[redacted]",
      });
      return;
    }
  }

  // Priority 2: ops inbox fallback (owner not registered yet)
  const opsEmail = process.env.RESEND_OPS_EMAIL ?? null;
  if (opsEmail) {
    await sendInlineEmail({
      to: opsEmail,
      from,
      subject: `[Action needed — no owner yet] ${subject} — ${addressDisplay}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111;">
          <div style="background:#fef3c7;border:1px solid #d97706;border-radius:6px;padding:10px 14px;margin-bottom:16px;font-size:13px;color:#92400e;">
            <strong>No registered owner on this property yet.</strong>
            Forward this to the intended homeowner once they are identified.
          </div>
          ${html}
          <p style="font-size:12px;color:#888;margin-top:16px;">Property ID: ${prop.id}</p>
        </div>
      `,
    });
    console.log("property_review_request_ops_notified_no_owner", { propertyId: prop.id });
    return;
  }

  // No recipient — log and continue; request is saved
  console.log("property_review_request_notify_deferred_no_recipient", {
    propertyId: prop.id,
    hint: "No owner_user_id and no RESEND_OPS_EMAIL — notification deferred until owner registers",
  });
}
