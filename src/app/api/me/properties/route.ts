import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const REQUIRED_DOC_TYPES = [
  "selfie",
  "drivers_license",
  "utility_bill",
] as const;
const BUCKET = "property-verification";

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
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
      return "image/jpeg";
    // PNG magic: 89 50 4E 47
    if (
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    )
      return "image/png";
    // PDF: %PDF
    if (
      buf[0] === 0x25 &&
      buf[1] === 0x50 &&
      buf[2] === 0x44 &&
      buf[3] === 0x46
    )
      return "application/pdf";
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

function formatAddress(row: Record<string, any>): string {
  return [
    row.address_line1,
    row.address_line2,
    row.city,
    row.state,
    row.postal_code,
  ]
    .filter(Boolean)
    .join(", ");
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);

  const { data, error } = await (supabase.from("properties") as any)
    .select(
      "id, owner_user_id, address_line1, address_line2, city, state, postal_code, status, is_private, created_at, updated_at",
    )
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return jsonError(error.message, 500);

  const rows = (data ?? []).map((r: any) => ({
    ...r,
    address_display: formatAddress(r),
  }));

  return NextResponse.json({ ok: true, properties: rows });
}

async function ensureBucket(svc: ReturnType<typeof createServiceClient>) {
  const { data } = await svc.storage.getBucket(BUCKET);
  if (!data) {
    await svc.storage.createBucket(BUCKET, { public: false });
  }
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);

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

  const files: Record<string, File> = {};
  for (const docType of REQUIRED_DOC_TYPES) {
    const file = formData.get(docType);
    if (!file || !(file instanceof File) || file.size === 0) {
      return jsonError(`${docType.replace("_", " ")} photo is required`, 422);
    }
    files[docType] = file;
  }

  const svc = createServiceClient();

  const { data: prop, error: insertErr } = await (svc.from("properties") as any)
    .insert({
      owner_user_id: user.id,
      address_line1,
      address_line2: address_line2 || null,
      city: city || null,
      state,
      postal_code,
      status: "unverified",
      is_private: true,
    })
    .select("id")
    .single();

  if (insertErr) return jsonError(insertErr.message, 500);

  const propertyId = prop.id;

  await ensureBucket(svc);

  const docRows: Array<{
    property_id: string;
    doc_type: string;
    storage_path: string;
    content_type: string;
  }> = [];

  for (const docType of REQUIRED_DOC_TYPES) {
    const file = files[docType];
    const buf = Buffer.from(await file.arrayBuffer());

    if (isHeicBuffer(buf)) {
      await (svc.from("properties") as any).delete().eq("id", propertyId);
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
      await (svc.from("properties") as any).delete().eq("id", propertyId);
      return jsonError(
        `Upload failed for ${docType}: ${uploadErr.message}`,
        500,
      );
    }

    docRows.push({
      property_id: propertyId,
      doc_type: docType,
      storage_path: storagePath,
      content_type: contentType,
    });
  }

  const { error: docInsertErr } = await (
    svc.from("property_documents") as any
  ).insert(docRows);

  if (docInsertErr) {
    return jsonError(`Document records failed: ${docInsertErr.message}`, 500);
  }

  return NextResponse.json(
    { ok: true, property: { id: propertyId, status: "unverified" } },
    { status: 201 },
  );
}
