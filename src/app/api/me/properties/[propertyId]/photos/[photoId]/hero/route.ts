import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

/** PATCH /api/me/properties/[propertyId]/photos/[photoId]/hero — set as hero */
export async function PATCH(
  _req: Request,
  ctx: { params: Promise<{ propertyId: string; photoId: string }> },
) {
  const { propertyId, photoId } = await ctx.params;

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

  const { data: photo } = await (svc.from("property_photos") as any)
    .select("id, public_url")
    .eq("id", photoId)
    .eq("property_id", propertyId)
    .is("removed_at", null)
    .maybeSingle();

  if (!photo) return jsonError("Photo not found", 404);

  const now = new Date().toISOString();

  await (svc.from("property_photos") as any)
    .update({ is_hero: false, updated_at: now })
    .eq("property_id", propertyId)
    .neq("id", photoId);

  const { error } = await (svc.from("property_photos") as any)
    .update({ is_hero: true, updated_at: now })
    .eq("id", photoId);

  if (error) return jsonError("Failed to set hero photo", 500);

  await (svc.from("property_edit_audit") as any).insert({
    property_id: propertyId,
    actor: user.id,
    action_type: "photo_hero_set",
    photo_id: photoId,
    after_value: photo.public_url,
  });

  return NextResponse.json({ ok: true });
}
