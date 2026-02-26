import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";

type Status = "unverified" | "under_review" | "verified" | "archived";

function isStatus(v: unknown): v is Status {
  return v === "unverified" || v === "under_review" || v === "verified" || v === "archived";
}

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ propertyId: string }> },
) {
  const admin = await requireAdmin();
  if (!admin.ok) return jsonError(admin.error, admin.status);

  const { propertyId } = await ctx.params;
  if (!propertyId) return jsonError("Missing propertyId", 400);

  const body = await req.json().catch(() => ({}));
  const next = (body as any)?.status;
  const notes =
    typeof (body as any)?.notes === "string"
      ? (body as any).notes.trim() || null
      : null;

  if (!isStatus(next)) return jsonError("Invalid status", 400);

  const svc = createServiceClient();

  const { data: current, error: curErr } = await (svc.from("properties") as any)
    .select("id, status")
    .eq("id", propertyId)
    .maybeSingle();

  if (curErr) return jsonError(curErr.message, 500);
  if (!current) return jsonError("Property not found", 404);

  const fromStatus = String(current.status) as Status;
  const toStatus = next as Status;

  if (fromStatus === toStatus) {
    return jsonError("Status is already " + toStatus, 409);
  }

  const now = new Date().toISOString();
  const patch: Record<string, any> = { status: toStatus };

  if (toStatus === "under_review") {
    patch.reviewed_at = now;
    patch.reviewed_by = admin.user.id;
  }
  if (toStatus === "verified") {
    patch.verified_at = now;
    patch.verified_by = admin.user.id;
    patch.reviewed_at = now;
    patch.reviewed_by = admin.user.id;
  }
  if (toStatus !== "verified") {
    patch.verified_at = null;
    patch.verified_by = null;
  }
  if (toStatus === "unverified") {
    patch.reviewed_at = null;
    patch.reviewed_by = null;
  }

  if (notes !== null) {
    patch.review_notes = notes;
  }

  const { data: updated, error: upErr } = await (svc.from("properties") as any)
    .update(patch)
    .eq("id", propertyId)
    .select("id, status")
    .maybeSingle();

  if (upErr) return jsonError(upErr.message, 500);
  if (!updated) return jsonError("Update failed", 500);

  await (svc.from("property_status_audit") as any).insert({
    property_id: propertyId,
    from_status: fromStatus,
    to_status: toStatus,
    changed_by: admin.user.id,
    notes,
    actor_type: "human",
  });

  return NextResponse.json({
    ok: true,
    propertyId,
    from: fromStatus,
    to: toStatus,
  });
}
