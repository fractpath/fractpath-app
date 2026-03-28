import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";
import { notifyMilestoneForDeal } from "@/lib/workflow/notifyMilestone";

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

type Ctx = { params: Promise<{ dealId: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin();
  if (!admin.ok) return jsonError(admin.error, admin.status);

  const { dealId } = await ctx.params;
  if (!dealId) return jsonError("Missing dealId", 400);

  let body: { note?: string | null } = {};
  try {
    body = await req.json();
  } catch {
    // note is optional
  }
  const note = body.note?.trim() || null;

  const svc = createServiceClient();

  const { data: thread } = await (svc.from("deal_threads") as any)
    .select("id, status")
    .eq("deal_id", dealId)
    .in("status", ["accepted", "negotiating"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!thread) {
    return jsonError("No accepted or negotiating thread found for this deal", 422);
  }

  const { error: updateErr } = await (svc.from("deal_threads") as any)
    .update({ status: "closed" })
    .eq("id", thread.id);

  if (updateErr) {
    console.error("ADMIN_CLOSE_DEAL_THREAD_FAILED", { dealId, error: updateErr });
    return jsonError("Failed to close deal thread", 500);
  }

  await (svc.from("deal_events") as any).insert({
    deal_id: dealId,
    event_type: "DEAL_WORKFLOW_STAGE_CHANGED",
    payload: {
      stage: "deal_closed",
      stage_label: "Deal closed",
      note,
      thread_id: thread.id,
    },
    created_by: admin.user.id,
  });

  notifyMilestoneForDeal({
    svc,
    dealId,
    milestoneLabel: "Deal closed",
    note,
    adminId: admin.user.id,
  }).catch((err) => {
    console.error("CLOSE_DEAL_NOTIFY_FAILED", { dealId, err });
  });

  return NextResponse.json({ ok: true, thread_status: "closed" }, { status: 200 });
}
