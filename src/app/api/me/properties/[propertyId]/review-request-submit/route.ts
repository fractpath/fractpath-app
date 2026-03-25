import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendInlineEmail } from "@/lib/email/sendInlineEmail";
import { getAppBaseUrlServer } from "@/lib/appBaseUrl";

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

  // Notify ops/admin — best-effort, non-blocking
  try {
    const opsEmail = process.env.RESEND_OPS_EMAIL ?? null;
    const from = process.env.RESEND_FROM_EMAIL ?? "notifications@notify.fractpath.com";

    if (opsEmail) {
      const appBase = getAppBaseUrlServer();
      const adminUrl = `${appBase}/admin/properties/${propertyId}`;

      const { data: propRow } = await (svc.from("properties") as any)
        .select("address_line1, city, state")
        .eq("id", propertyId)
        .maybeSingle();
      const addressParts = [propRow?.address_line1, propRow?.city, propRow?.state].filter(Boolean);
      const addressDisplay = addressParts.join(", ") || propertyId;
      const noteHtml = body.homeowner_note?.trim()
        ? `<p style="margin-top:12px;padding:10px 12px;background:#f8fafc;border-left:3px solid #64748b;font-size:14px;white-space:pre-wrap;">${body.homeowner_note.trim()}</p>`
        : "<p style='font-size:14px;color:#888;'>No note included.</p>";

      await sendInlineEmail({
        to: opsEmail,
        from,
        subject: "Homeowner submitted additional information for review",
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111;">
            <p style="font-size:15px;margin-bottom:12px;">
              A homeowner has submitted updates for property: <strong>${addressDisplay}</strong>
            </p>
            <p style="font-size:14px;font-weight:600;margin-bottom:4px;">Homeowner note:</p>
            ${noteHtml}
            <p style="margin-top:20px;">
              <a href="${adminUrl}" style="display:inline-block;padding:10px 20px;background:#111;color:#fff;text-decoration:none;border-radius:4px;font-size:14px;">
                View in admin
              </a>
            </p>
            <p style="font-size:12px;color:#888;margin-top:16px;">
              Deal ID: ${request.deal_id} · Property ID: ${propertyId}
            </p>
          </div>
        `,
      });

      console.log("review_request_ops_notified", {
        dealId: request.deal_id,
        propertyId,
      });
    } else {
      console.log("review_request_ops_notify_skipped_no_recipient", {
        dealId: request.deal_id,
        propertyId,
        hint: "Set RESEND_OPS_EMAIL env var to enable ops notifications",
      });
    }
  } catch (emailErr: any) {
    console.error("review_request_ops_notify_failed", {
      dealId: request.deal_id,
      propertyId,
      error: emailErr?.message,
    });
  }

  return NextResponse.json({ ok: true, request: updated }, { status: 200 });
}
