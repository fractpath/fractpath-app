import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";

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
  const notes =
    typeof (body as any)?.notes === "string"
      ? (body as any).notes.trim() || null
      : null;

  const svc = createServiceClient();

  const now = new Date().toISOString();

  const { data, error } = await (svc.from("properties") as any)
    .update({
      status: "verified",
      verified_at: now,
      verified_by: admin.user.id,
      reviewed_at: now,
      reviewed_by: admin.user.id,
      review_notes: notes,
    })
    .eq("id", propertyId)
    .eq("status", "under_review")
    .select("id, status")
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  if (!data) {
    return jsonError(
      "Property not found or invalid transition (must be under_review)",
      409,
    );
  }

  // Best-effort audit insert (do not fail transition if audit insert fails)
  await (svc.from("property_status_audit") as any).insert({
    property_id: propertyId,
    from_status: "under_review",
    to_status: "verified",
    changed_by: admin.user.id,
    notes,
    actor_type: "human",
  });

  return NextResponse.json({
    ok: true,
    propertyId: data.id,
    status: data.status,
  });
}
