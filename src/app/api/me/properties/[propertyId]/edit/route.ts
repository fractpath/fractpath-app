import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const BUCKET = "property-verification";
const ALLOWED_DOC_TYPES = ["selfie", "drivers_license", "utility_bill"] as const;

function isHeicBuffer(buf: Buffer): boolean {
  // HEIF/HEIC brand is typically at bytes 4..11: "ftyp" + brand
  if (!buf || buf.length < 12) return false;
  const box = buf.subarray(4, 12).toString("ascii"); // e.g. "ftypheic"
  return (
    box === "ftypheic" ||
    box === "ftypheix" ||
    box === "ftyphevc" ||
    box === "ftyphevx" ||
    box === "ftypmif1" || // generic HEIF
    box === "ftypmsf1"
  );
}

function inferContentType(file: File, buf: Buffer): string {
  const t = (file.type || "").toLowerCase();
  if (t) return t;

  // Fallback: sniff a couple common cases
  if (buf.length >= 4) {
    // JPEG magic: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
    // PNG magic: 89 50 4E 47
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
    // PDF: %PDF
    if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return "application/pdf";
  }

  return "application/octet-stream";
}

function extForContentType(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct === "image/jpeg") return "jpg";
  if (ct === "image/png") return "png";
  if (ct === "application/pdf") return "pdf";
  return "bin";
}

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

  const buf = Buffer.from(await file.arrayBuffer());

  if (isHeicBuffer(buf)) {
    return jsonError(
      `${docType.replace("_", " ")} is an HEIC/HEIF image. Please upload JPG/PNG (the app will convert HEIC automatically when working correctly).`,
      415,
    );
  }

  const contentType = inferContentType(file, buf);
  const ext = extForContentType(contentType);
  const storagePath = `${user.id}/${propertyId}/${docType}.${ext}`;

  const { error: uploadErr } = await svc.storage
    .from(BUCKET)
    .upload(storagePath, buf, {
      contentType,
      upsert: true,
    });

  if (uploadErr) {
    return jsonError(`Upload failed for ${docType}: ${uploadErr.message}`, 500);
  }

  const { error: upsertErr } = await (svc.from("property_documents") as any).upsert(
    {
      property_id: propertyId,
      doc_type: docType,
      storage_path: storagePath,
      content_type: contentType,
    },
    { onConflict: "property_id,doc_type" },
  );

  if (upsertErr) {
    return jsonError(`Document record failed for ${docType}: ${upsertErr.message}`, 500);
  }

  return NextResponse.json({ ok: true });
}
