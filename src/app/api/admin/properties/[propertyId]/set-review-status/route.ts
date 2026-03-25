import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";

const ALLOWED_REVIEW_STATUSES = new Set([
  "under_review",
  "information_requested",
  "ready_for_deposit",
  "amv_ordered",
  "amv_complete",
  "property_review_complete",
  "property_review_expired",
]);

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

type Ctx = { params: Promise<{ propertyId: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin();
  if (!admin.ok) return jsonError(admin.error, admin.status);

  const { propertyId } = await ctx.params;
  if (!propertyId) return jsonError("Missing propertyId", 400);

  let body: { status?: string; note?: string | null } = {};
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const { status, note } = body;
  if (!status || !ALLOWED_REVIEW_STATUSES.has(status)) {
    return jsonError(
      `Invalid review status. Allowed: ${[...ALLOWED_REVIEW_STATUSES].join(", ")}`,
      422,
    );
  }

  const svc = createServiceClient();
  const now = new Date().toISOString();

  // Fetch current review status for audit trail
  const { data: current } = await (svc.from("properties") as any)
    .select("property_review_status")
    .eq("id", propertyId)
    .maybeSingle();

  const previousStatus: string | null = current?.property_review_status ?? null;

  const updatePayload: Record<string, unknown> = {
    property_review_status: status,
    property_review_status_updated_at: now,
    property_review_note: note?.trim() || null,
  };

  if (status === "property_review_complete") {
    updatePayload.property_review_completed_at = now;
  }

  const { error: updateErr } = await (svc.from("properties") as any)
    .update(updatePayload)
    .eq("id", propertyId);

  if (updateErr) {
    console.error("ADMIN_SET_PROPERTY_REVIEW_STATUS_FAILED", { propertyId, status, error: updateErr });
    return jsonError("Failed to update property review status", 500);
  }

  // Append to property_status_audit as review transition entry
  await (svc.from("property_status_audit") as any).insert({
    property_id: propertyId,
    from_status: previousStatus ?? "none",
    to_status: status,
    changed_by: admin.user.id,
    notes: note?.trim() || null,
    actor_type: "human",
  });

  return NextResponse.json({ ok: true, property_review_status: status }, { status: 200 });
}
