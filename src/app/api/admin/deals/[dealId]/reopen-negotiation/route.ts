import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";
import {
  resolveWorkflowContacts,
  sendWorkflowEmail,
  dealActionUrl,
} from "@/lib/workflow/sendWorkflowEmail";

type Ctx = { params: Promise<{ dealId: string }> };

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { dealId } = await ctx.params;

  const admin = await requireAdmin();
  if (!admin.ok) return jsonError("Forbidden", 403);

  const svc = createServiceClient();

  // Verify deal exists and has renegotiation_status = 'requested'
  const { data: deal } = await (svc.from("deals") as any)
    .select("id, renegotiation_status, triage_status")
    .eq("id", dealId)
    .maybeSingle();

  if (!deal) return jsonError("Deal not found", 404);

  if (deal.renegotiation_status !== "requested") {
    return jsonError("Deal does not have a pending renegotiation request", 422);
  }

  // Clear renegotiation_status
  const { error: updateErr } = await (svc.from("deals") as any)
    .update({ renegotiation_status: null })
    .eq("id", dealId);

  if (updateErr) {
    console.error("REOPEN_NEGOTIATION_UPDATE_FAILED", { dealId, updateErr });
    return jsonError("Failed to reopen negotiation", 500);
  }

  // Log event
  const { error: evErr } = await (svc.from("deal_events") as any).insert({
    deal_id: dealId,
    event_type: "DEAL_RENEGOTIATION_REOPENED",
    created_by: admin.ok ? admin.user.id : null,
    payload: {
      note: "Admin reopened negotiation — renegotiation_status cleared. Revised terms flow may now proceed.",
      triage_status: deal.triage_status ?? null,
    },
  });

  if (evErr) {
    console.error("REOPEN_NEGOTIATION_EVENT_FAILED", { dealId, evErr });
    // Non-fatal
  }

  // ── Notify owner + buyer (non-blocking) ───────────────────────────────────
  void (async () => {
    try {
      const contacts = await resolveWorkflowContacts(svc, { dealId });

      if (contacts.owner) {
        const r = await sendWorkflowEmail({
          audience: "owner",
          eventKey: "NEGOTIATION_REENGAGEMENT_REQUIRED_OWNER",
          to: contacts.owner.email,
          recipientName: contacts.owner.name,
          actionUrl: dealActionUrl(dealId),
        });
        console.log("REOPEN_OWNER_NOTIFICATION", {
          dealId,
          ok: r.ok,
          error: r.error ?? null,
        });
      }

      if (contacts.buyer) {
        const r = await sendWorkflowEmail({
          audience: "buyer",
          eventKey: "NEGOTIATION_REENGAGEMENT_REQUIRED_BUYER",
          to: contacts.buyer.email,
          recipientName: contacts.buyer.name,
          actionUrl: dealActionUrl(dealId),
        });
        console.log("REOPEN_BUYER_NOTIFICATION", {
          dealId,
          ok: r.ok,
          error: r.error ?? null,
        });
      }
    } catch (err) {
      console.error("REOPEN_NOTIFICATION_ERROR", { dealId, err });
    }
  })();

  return NextResponse.json({ ok: true, dealId });
}
