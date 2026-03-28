import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";
import { notifyMilestoneForDeal } from "@/lib/workflow/notifyMilestone";

const ALLOWED_ACTIONS = new Set(["active", "issue", "reset"]);

const ACTION_TO_STATUS: Record<string, string | null> = {
  active: "active",
  issue: "issue",
  reset: null,
};

const ACTION_TO_NOTIFICATION: Record<string, string | null> = {
  active: "Payments active",
  issue: "Servicing issue",
  reset: null,
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

  let body: { action?: string; note?: string | null } = {};
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const { action, note } = body;
  if (!action || !ALLOWED_ACTIONS.has(action)) {
    return jsonError(
      `Invalid action. Allowed: ${[...ALLOWED_ACTIONS].join(", ")}`,
      422,
    );
  }

  const newStatus = ACTION_TO_STATUS[action];
  const svc = createServiceClient();

  const { error: updateErr } = await (svc.from("deals") as any)
    .update({
      servicing_status: newStatus,
      servicing_note: note?.trim() || null,
    })
    .eq("id", dealId);

  if (updateErr) {
    console.error("ADMIN_SERVICING_UPDATE_FAILED", { dealId, action, error: updateErr });
    return jsonError("Failed to update servicing status", 500);
  }

  await (svc.from("deal_events") as any).insert({
    deal_id: dealId,
    event_type: "DEAL_WORKFLOW_STAGE_CHANGED",
    payload: {
      stage: newStatus ? `servicing_${newStatus}` : "servicing_reset",
      stage_label: ACTION_TO_NOTIFICATION[action] ?? "Servicing updated",
      note: note?.trim() || null,
    },
    created_by: admin.user.id,
  });

  const notificationLabel = ACTION_TO_NOTIFICATION[action];
  if (notificationLabel) {
    notifyMilestoneForDeal({
      svc,
      dealId,
      milestoneLabel: notificationLabel,
      note: note?.trim() || null,
      adminId: admin.user.id,
    }).catch((err) => {
      console.error("SERVICING_NOTIFY_FAILED", { dealId, err });
    });
  }

  return NextResponse.json(
    { ok: true, servicing_status: newStatus },
    { status: 200 },
  );
}
