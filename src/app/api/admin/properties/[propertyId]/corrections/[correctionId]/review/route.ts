import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

async function requireAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const role = user.user_metadata?.role ?? null;
  if (role !== "admin") return null;
  return user;
}

/**
 * POST /api/admin/properties/[propertyId]/corrections/[correctionId]/review
 * Body: { action: "approve" | "reject", reviewer_note?: string }
 */
export async function POST(
  req: Request,
  ctx: {
    params: Promise<{ propertyId: string; correctionId: string }>;
  },
) {
  const { propertyId, correctionId } = await ctx.params;

  const supabase = await createClient();
  const user = await requireAdmin(supabase);
  if (!user) return jsonError("Unauthorized", 401);

  const svc = createServiceClient();

  const { data: correction } = await (
    svc.from("property_fact_corrections") as any
  )
    .select("*")
    .eq("id", correctionId)
    .eq("property_id", propertyId)
    .maybeSingle();

  if (!correction) return jsonError("Correction not found", 404);
  if (correction.review_status !== "pending") {
    return jsonError(
      `Correction is already ${correction.review_status}`,
      409,
    );
  }

  const body = await req.json().catch(() => ({}));
  const { action, reviewer_note } = body;

  if (action !== "approve" && action !== "reject") {
    return jsonError("action must be 'approve' or 'reject'", 400);
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateErr } = await (
    svc.from("property_fact_corrections") as any
  )
    .update({
      review_status: action === "approve" ? "approved" : "rejected",
      reviewed_by: user.id,
      reviewed_at: now,
      reviewer_note: reviewer_note ?? null,
      updated_at: now,
    })
    .eq("id", correctionId)
    .select()
    .single();

  if (updateErr) return jsonError("Failed to update correction", 500);

  await (svc.from("property_edit_audit") as any).insert({
    property_id: propertyId,
    actor: user.id,
    action_type:
      action === "approve" ? "correction_approved" : "correction_rejected",
    field_key: correction.field_key,
    before_value: correction.canonical_value,
    after_value: correction.owner_submitted_value,
    correction_id: correctionId,
    metadata: { reviewer_note: reviewer_note ?? null },
  });

  return NextResponse.json({ ok: true, correction: updated });
}
