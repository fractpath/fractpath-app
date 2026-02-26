import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { enforceLimitsAndProcess } from "@/lib/uploads/documentProcessing";

export const runtime = "nodejs";

const BUCKET = "property-verification";
const ALLOWED_DOC_TYPES = ["selfie", "drivers_license", "utility_bill"] as const;

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

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

  const { data: existing } = await (supabase.from("properties") as any)
    .select("id, status, owner_user_id")
    .eq("id", propertyId)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!existing) return jsonError("Not found", 404);
  if (existing.status !== "unverified") {
    return jsonError("Only unverified properties can be edited", 409);
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonError("Expected multipart form data", 400);
  }

  const address_line1 = String(formData.get("address_line1") ?? "").trim();
  const address_line2 = String(formData.get("address_line2") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim();
  const postal_code = String(formData.get("postal_code") ?? "").trim();

  if (!address_line1) return jsonError("Street address is required", 422);
  if (!state) return jsonError("State is required", 422);
  if (!postal_code) return jsonError("Zip code is required", 422);

  const svc = createServiceClient();

  const { error: updateErr } = await (svc.from("properties") as any)
    .update({
      address_line1,
      address_line2: address_line2 || null,
      city: city || null,
      state,
      postal_code,
    })
    .eq("id", propertyId)
    .eq("owner_user_id", user.id);

  if (updateErr) return jsonError(updateErr.message, 500);

  for (const docType of ALLOWED_DOC_TYPES) {
    const file = formData.get(docType);
    if (!file || !(file instanceof File) || file.size === 0) continue;

    const rawBuf = Buffer.from(await file.arrayBuffer());

    const result = await enforceLimitsAndProcess(rawBuf, file.type);
    if (!result.ok) {
      return jsonError(
        `${docType.replace("_", " ")}: ${result.error}`,
        result.status,
      );
    }

    const storagePath = `${user.id}/${propertyId}/${docType}.${result.ext}`;

    const { error: uploadErr } = await svc.storage
      .from(BUCKET)
      .upload(storagePath, result.outBuf, {
        contentType: result.storedContentType,
        upsert: true,
      });

    if (uploadErr) {
      return jsonError(`Upload failed for ${docType}: ${uploadErr.message}`, 500);
    }

    const upsertRow: Record<string, any> = {
      property_id: propertyId,
      doc_type: docType,
      storage_path: storagePath,
      content_type: result.storedContentType,
      byte_size: result.meta.byte_size,
      sha256: result.meta.sha256,
      width: result.meta.width,
      height: result.meta.height,
      original_content_type: result.meta.original_content_type,
    };

    console.info("PROPERTY_DOC_UPLOAD", {
      property_id: propertyId,
      doc_type: docType,
      ...result.meta,
    });

    const { error: upsertErr } = await (svc.from("property_documents") as any).upsert(
      upsertRow,
      { onConflict: "property_id,doc_type" },
    );

    if (upsertErr) {
      return jsonError(`Document record failed for ${docType}: ${upsertErr.message}`, 500);
    }
  }

  return NextResponse.json({ ok: true });
}
