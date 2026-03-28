import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";
import { notifyMilestoneForProperty } from "@/lib/workflow/notifyMilestone";

const ALLOWED_ACTIONS = new Set(["pending", "issue_found", "ready", "reset"]);

const ACTION_TO_STATUS: Record<string, string | null> = {
  pending: "pending",
  issue_found: "issue_found",
  ready: "ready",
  reset: null,
};

const ACTION_TO_NOTIFICATION: Record<string, string | null> = {
  pending: "Closing review in progress",
  issue_found: "Issue found during closing review",
  ready: "Ready for closing",
  reset: null,
};

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

type Ctx = { params: Promise<{ propertyId: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin();
  if (!admin.ok) return jsonError(admin.error, admin.status);

  const { propertyId } = await ctx.params;
  if (!propertyId) return jsonError("Missing propertyId", 400);

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

  const { data: current } = await (svc.from("properties") as any)
    .select("closing_review_status")
    .eq("id", propertyId)
    .maybeSingle();

  const previousStatus: string | null = current?.closing_review_status ?? null;

  const { error: updateErr } = await (svc.from("properties") as any)
    .update({
      closing_review_status: newStatus,
      closing_review_note: note?.trim() || null,
    })
    .eq("id", propertyId);

  if (updateErr) {
    console.error("ADMIN_CLOSING_REVIEW_UPDATE_FAILED", { propertyId, action, error: updateErr });
    return jsonError("Failed to update closing review status", 500);
  }

  await (svc.from("property_status_audit") as any).insert({
    property_id: propertyId,
    from_status: previousStatus ? `closing_review:${previousStatus}` : "closing_review:none",
    to_status: newStatus ? `closing_review:${newStatus}` : "closing_review:none",
    changed_by: admin.user.id,
    notes: note?.trim() || null,
    actor_type: "human",
  });

  const notificationLabel = ACTION_TO_NOTIFICATION[action];
  if (notificationLabel) {
    notifyMilestoneForProperty({
      svc,
      propertyId,
      milestoneLabel: notificationLabel,
      note: note?.trim() || null,
      adminId: admin.user.id,
    }).catch((err) => {
      console.error("CLOSING_REVIEW_NOTIFY_FAILED", { propertyId, err });
    });
  }

  return NextResponse.json(
    { ok: true, closing_review_status: newStatus },
    { status: 200 },
  );
}
