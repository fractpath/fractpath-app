import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";

const STATE_TO_TRIAGE: Record<string, string> = {
  triage_in_progress: "triage_in_progress",
  ready_for_deposit: "ready_for_deposit",
  ineligible: "ineligible",
};

const STATE_TO_EVENT: Record<string, string> = {
  triage_in_progress: "DEAL_TRIAGE_RETURNED_TO_REVIEW",
  ready_for_deposit: "DEAL_TRIAGE_READY_FOR_DEPOSIT",
  ineligible: "DEAL_TRIAGE_INELIGIBLE",
};

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

type Ctx = { params: Promise<{ dealId: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin();
  if (!admin.ok) return jsonError(admin.error, admin.status);

  const { dealId } = await ctx.params;
  if (!dealId) return jsonError("Missing dealId", 400);

  let body: { state?: string; note?: string | null } = {};
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const { state, note } = body;

  if (!state || !STATE_TO_TRIAGE[state]) {
    return jsonError(
      `Invalid state. Allowed: ${Object.keys(STATE_TO_TRIAGE).join(", ")}`,
      422,
    );
  }

  const svc = createServiceClient();
  const now = new Date().toISOString();

  const { error: updateErr } = await (svc.from("deals") as any)
    .update({ triage_status: STATE_TO_TRIAGE[state] })
    .eq("id", dealId);

  if (updateErr) {
    console.error("ADMIN_SET_DEAL_REVIEW_STATE_FAILED", { dealId, state, error: updateErr });
    return jsonError("Failed to update deal review state", 500);
  }

  const eventType = STATE_TO_EVENT[state];
  await (svc.from("deal_events") as any).insert({
    deal_id: dealId,
    event_type: eventType,
    payload: {
      set_by_admin: admin.user.id,
      note: note?.trim() || null,
      source: "admin_deal_review",
    },
    created_by: admin.user.id,
    created_at: now,
  });

  return NextResponse.json({ ok: true, triage_status: STATE_TO_TRIAGE[state] });
}
