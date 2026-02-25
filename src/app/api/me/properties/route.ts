import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const REQUIRED_DOC_TYPES = ["selfie", "drivers_license", "utility_bill"] as const;
const BUCKET = "property-verification";

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

function formatAddress(row: Record<string, any>): string {
  return [row.address_line1, row.address_line2, row.city, row.state, row.postal_code]
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
    .select("id, owner_user_id, address_line1, address_line2, city, state, postal_code, status, is_private, created_at, updated_at")
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

  const docRows: Array<{ property_id: string; doc_type: string; storage_path: string; content_type: string }> = [];

  for (const docType of REQUIRED_DOC_TYPES) {
    const file = files[docType];
    const ext = file.name.split(".").pop() || "bin";
    const storagePath = `${user.id}/${propertyId}/${docType}.${ext}`;

    const buf = Buffer.from(await file.arrayBuffer());

    const { error: uploadErr } = await svc.storage
      .from(BUCKET)
      .upload(storagePath, buf, {
        contentType: file.type || "application/octet-stream",
        upsert: true,
      });

    if (uploadErr) {
      await (svc.from("properties") as any).delete().eq("id", propertyId);
      return jsonError(`Upload failed for ${docType}: ${uploadErr.message}`, 500);
    }

    docRows.push({
      property_id: propertyId,
      doc_type: docType,
      storage_path: storagePath,
      content_type: file.type || "application/octet-stream",
    });
  }

  const { error: docInsertErr } = await (svc.from("property_documents") as any)
    .insert(docRows);

  if (docInsertErr) {
    return jsonError(`Document records failed: ${docInsertErr.message}`, 500);
  }

  return NextResponse.json({ ok: true, property: { id: propertyId, status: "unverified" } }, { status: 201 });
}
