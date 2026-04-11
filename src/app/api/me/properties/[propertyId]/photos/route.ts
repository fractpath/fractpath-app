import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { enforceLimitsAndProcess } from "@/lib/uploads/documentProcessing";
import { PHOTO_BUCKET, photoPublicUrl } from "@/lib/property/photos";

export const runtime = "nodejs";

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

async function ensurePhotosBucket(svc: ReturnType<typeof createServiceClient>) {
  const { data: buckets } = await svc.storage.listBuckets();
  if (!buckets?.find((b) => b.name === PHOTO_BUCKET)) {
    await svc.storage.createBucket(PHOTO_BUCKET, {
      public: true,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
      fileSizeLimit: 10 * 1024 * 1024,
    });
  }
}

/** GET /api/me/properties/[propertyId]/photos — list active owner photos */
export async function GET(
  _req: Request,
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

  const { data: photos, error } = await (svc.from("property_photos") as any)
    .select("*")
    .eq("property_id", propertyId)
    .is("removed_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return jsonError("Failed to load photos", 500);

  return NextResponse.json({ ok: true, photos: photos ?? [] });
}

/** POST /api/me/properties/[propertyId]/photos — upload a new photo */
export async function POST(
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

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return jsonError("No file provided", 400);

  const rawBuf = Buffer.from(await file.arrayBuffer());
  const result = await enforceLimitsAndProcess(rawBuf, file.type);
  if (!result.ok) return jsonError(result.error, result.status);

  await ensurePhotosBucket(svc);

  const photoId = crypto.randomUUID();
  const storagePath = `${propertyId}/${photoId}.${result.ext}`;

  const { error: uploadErr } = await svc.storage
    .from(PHOTO_BUCKET)
    .upload(storagePath, result.outBuf, {
      contentType: result.storedContentType,
      upsert: false,
    });

  if (uploadErr) {
    return jsonError(`Upload failed: ${uploadErr.message}`, 500);
  }

  const publicUrl = photoPublicUrl(storagePath);

  const { data: existingPhotos } = await (svc.from("property_photos") as any)
    .select("sort_order")
    .eq("property_id", propertyId)
    .is("removed_at", null)
    .order("sort_order", { ascending: false })
    .limit(1);

  const maxOrder =
    existingPhotos && existingPhotos.length > 0
      ? (existingPhotos[0].sort_order ?? 0)
      : -1;

  const { data: inserted, error: insertErr } = await (
    svc.from("property_photos") as any
  )
    .insert({
      id: photoId,
      property_id: propertyId,
      uploaded_by: user.id,
      storage_path: storagePath,
      storage_bucket: PHOTO_BUCKET,
      public_url: publicUrl,
      sort_order: maxOrder + 1,
      is_hero: false,
    })
    .select()
    .single();

  if (insertErr) {
    await svc.storage.from(PHOTO_BUCKET).remove([storagePath]);
    return jsonError("Failed to save photo record", 500);
  }

  await (svc.from("property_edit_audit") as any).insert({
    property_id: propertyId,
    actor: user.id,
    action_type: "photo_uploaded",
    photo_id: photoId,
    after_value: publicUrl,
    metadata: {
      storage_path: storagePath,
      byte_size: result.meta.byte_size,
    },
  });

  return NextResponse.json({ ok: true, photo: inserted }, { status: 201 });
}
