import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { PHOTO_BUCKET } from "@/lib/property/photos";

export const runtime = "nodejs";

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

/** DELETE /api/me/properties/[propertyId]/photos/[photoId] — soft-remove a photo */
export async function DELETE(
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
    .select("id, property_id, storage_path, is_hero, public_url")
    .eq("id", photoId)
    .eq("property_id", propertyId)
    .is("removed_at", null)
    .maybeSingle();

  if (!photo) return jsonError("Photo not found", 404);

  const now = new Date().toISOString();
  const { error: updateErr } = await (svc.from("property_photos") as any)
    .update({ removed_at: now, removed_by: user.id, is_hero: false, updated_at: now })
    .eq("id", photoId);

  if (updateErr) return jsonError("Failed to remove photo", 500);

  await (svc.from("property_edit_audit") as any).insert({
    property_id: propertyId,
    actor: user.id,
    action_type: "photo_removed",
    photo_id: photoId,
    before_value: photo.public_url,
    metadata: { storage_path: photo.storage_path, was_hero: photo.is_hero },
  });

  return NextResponse.json({ ok: true });
}
