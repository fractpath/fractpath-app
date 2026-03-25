import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const BUCKET = "property-verification";
const SIGNED_URL_TTL = 600;

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

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

  const { data: prop } = await (svc.from("properties") as any)
    .select("id")
    .eq("id", propertyId)
    .or(
      `owner_user_id.eq.${user.id},created_by_user_id.eq.${user.id},claimed_by_user_id.eq.${user.id}`,
    )
    .maybeSingle();

  if (!prop) return jsonError("Not found", 404);

  const { data: docs, error } = await (svc.from("property_documents") as any)
    .select("id, doc_type, storage_path, content_type, created_at")
    .eq("property_id", propertyId);

  if (error) return jsonError(error.message, 500);

  const docsWithUrls = await Promise.all(
    (docs ?? []).map(async (d: any) => {
      const { data: signed } = await svc.storage
        .from(BUCKET)
        .createSignedUrl(d.storage_path, SIGNED_URL_TTL);
      return {
        ...d,
        signed_url: signed?.signedUrl ?? null,
      };
    }),
  );

  return NextResponse.json({ ok: true, documents: docsWithUrls });
}
