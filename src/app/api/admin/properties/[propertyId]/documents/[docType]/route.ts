import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";

const BUCKET = "property-verification";
const SIGNED_URL_TTL = 600;

function jsonError(msg: string, status: number) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Streams the doc bytes through our app so the browser renders inline (no forced download)
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ propertyId: string; docType: string }> },
) {
  const admin = await requireAdmin();
  if (!admin.ok) return jsonError(admin.error, admin.status);

  const { propertyId, docType } = await ctx.params;
  if (!propertyId) return jsonError("Missing propertyId", 400);
  if (!docType) return jsonError("Missing docType", 400);

  const svc = createServiceClient();

  const { data: doc, error } = await (svc.from("property_documents") as any)
    .select("storage_path, content_type")
    .eq("property_id", propertyId)
    .eq("doc_type", docType)
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  if (!doc?.storage_path) return jsonError("Document not found", 404);

  const { data: signed, error: signErr } = await svc.storage
    .from(BUCKET)
    .createSignedUrl(doc.storage_path, SIGNED_URL_TTL);

  if (signErr) return jsonError(signErr.message, 500);
  if (!signed?.signedUrl) return jsonError("Signed URL unavailable", 500);

  const upstream = await fetch(signed.signedUrl);
  if (!upstream.ok) {
    return jsonError(`Upstream fetch failed (${upstream.status})`, 502);
  }

  const bytes = await upstream.arrayBuffer();
  const contentType =
    (doc.content_type as string | null) ||
    upstream.headers.get("content-type") ||
    "application/octet-stream";

  // Ensure inline rendering
  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Content-Disposition", "inline");
  headers.set("Cache-Control", "no-store");

  return new Response(bytes, { status: 200, headers });
}