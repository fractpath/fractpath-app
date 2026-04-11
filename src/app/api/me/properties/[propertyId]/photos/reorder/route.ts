import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

/**
 * PATCH /api/me/properties/[propertyId]/photos/reorder
 * Body: { orderedIds: string[] } — array of photo IDs in the desired order
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ propertyId: string }> },
) {
  const { propertyId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);

  const svc = createServiceClient();

  const { data: property } = await (svc.from("properties") as any)
    .select("id, status, owner_user_id, created_by_user_id")
    .eq("id", propertyId)
    .maybeSingle();

  if (!property) return jsonError("Not found", 404);

  const isOwner =
    property.owner_user_id === user.id ||
    property.created_by_user_id === user.id;
  if (!isOwner) return jsonError("Forbidden", 403);

  if (property.status === "archived") {
    return jsonError("Archived properties cannot be modified.", 403);
  }

  const body = await req.json().catch(() => null);
  const orderedIds: string[] = body?.orderedIds;
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return jsonError("orderedIds array is required", 400);
  }

  const now = new Date().toISOString();
  const updates = orderedIds.map((id, idx) =>
    (svc.from("property_photos") as any)
      .update({ sort_order: idx, updated_at: now })
      .eq("id", id)
      .eq("property_id", propertyId),
  );

  await Promise.all(updates);

  await (svc.from("property_edit_audit") as any).insert({
    property_id: propertyId,
    actor: user.id,
    action_type: "photo_reordered",
    metadata: { ordered_ids: orderedIds },
  });

  return NextResponse.json({ ok: true });
}
