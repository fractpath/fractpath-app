import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type DocType = "selfie" | "drivers_license" | "utility_bill";
const BUCKET = "property-verification";

function privateNoStoreHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
    "X-Content-Type-Options": "nosniff",
  };
}

function normalizeDocType(v: string): DocType | null {
  const s = String(v || "")
    .trim()
    .toLowerCase();
  if (s === "selfie") return "selfie";
  if (s === "drivers_license" || s === "drivers-license")
    return "drivers_license";
  if (s === "utility_bill" || s === "utility-bill") return "utility_bill";
  return null;
}

function filenameFor(docType: DocType, contentType: string) {
  const ext =
    contentType === "image/jpeg"
      ? "jpg"
      : contentType === "image/png"
        ? "png"
        : contentType === "application/pdf"
          ? "pdf"
          : "bin";
  return `${docType}.${ext}`;
}

function b64urlEncode(buf: Buffer) {
  return buf
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function timingSafeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function requireSecret(): string {
  const v = process.env.ADMIN_DOC_PREVIEW_SECRET;
  if (!v) throw new Error("Missing env: ADMIN_DOC_PREVIEW_SECRET");
  return v;
}

// token format: "<exp>.<sigB64url>"
// sig = HMAC_SHA256(secret, `${exp}.${propertyId}.${docType}.${storagePath}`)
function verifyToken(args: {
  token: string;
  propertyId: string;
  docType: DocType;
  storagePath: string;
}): { ok: true } | { ok: false; error: string; status: 401 | 403 } {
  const { token, propertyId, docType, storagePath } = args;
  const parts = token.split(".");
  if (parts.length !== 2)
    return { ok: false, status: 401, error: "Invalid token" };

  const [expStr, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp))
    return { ok: false, status: 401, error: "Invalid token" };

  const now = Math.floor(Date.now() / 1000);
  if (exp < now) return { ok: false, status: 403, error: "Token expired" };

  const secret = requireSecret();
  const msg = `${expStr}.${propertyId}.${docType}.${storagePath}`;
  const expected = b64urlEncode(
    crypto.createHmac("sha256", secret).update(msg).digest(),
  );

  if (!timingSafeEqual(expected, sig)) {
    return { ok: false, status: 403, error: "Bad token" };
  }

  return { ok: true };
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ propertyId: string; docType: string }> },
) {
  // ✅ Next 16: params is a Promise in route handlers
  const { propertyId: rawPropertyId, docType: rawDocType } = await ctx.params;

  const propertyId = String(rawPropertyId || "").trim();
  const docType = normalizeDocType(rawDocType);

  if (!propertyId) {
    return NextResponse.json(
      { ok: false, error: "Bad Request", detail: "Missing propertyId" },
      { status: 400, headers: privateNoStoreHeaders() },
    );
  }
  if (!docType) {
    return NextResponse.json(
      {
        ok: false,
        error: "Bad Request",
        detail: `Invalid docType: ${rawDocType}`,
      },
      { status: 400, headers: privateNoStoreHeaders() },
    );
  }

  const token = req.nextUrl.searchParams.get("t");
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized", detail: "Missing token" },
      { status: 401, headers: privateNoStoreHeaders() },
    );
  }

  const supabase = createServiceClient();

  const { data: doc, error: docErr } = await (
    supabase.from("property_documents") as any
  )
    .select("storage_path, content_type")
    .eq("property_id", propertyId)
    .eq("doc_type", docType)
    .maybeSingle();

  if (docErr) {
    return NextResponse.json(
      { ok: false, error: "DB query failed", detail: docErr.message },
      { status: 500, headers: privateNoStoreHeaders() },
    );
  }
  if (!doc?.storage_path) {
    return NextResponse.json(
      { ok: false, error: "Not Found", detail: "Document not found" },
      { status: 404, headers: privateNoStoreHeaders() },
    );
  }

  const v = verifyToken({
    token,
    propertyId,
    docType,
    storagePath: String(doc.storage_path),
  });
  if (!v.ok) {
    return NextResponse.json(
      { ok: false, error: v.error },
      { status: v.status, headers: privateNoStoreHeaders() },
    );
  }

  const { data: blob, error: dlErr } = await supabase.storage
    .from(BUCKET)
    .download(String(doc.storage_path));

  if (dlErr || !blob) {
    return NextResponse.json(
      {
        ok: false,
        error: "Storage download failed",
        detail: dlErr?.message ?? "no_blob",
      },
      { status: 502, headers: privateNoStoreHeaders() },
    );
  }

  const arrayBuffer = await blob.arrayBuffer();
  const contentType =
    (doc.content_type as string) || blob.type || "application/octet-stream";

  const headers = new Headers(privateNoStoreHeaders());
  headers.set("Content-Type", contentType);
  headers.set(
    "Content-Disposition",
    `inline; filename="${filenameFor(docType, contentType)}"`,
  );
  headers.set("Content-Length", String(arrayBuffer.byteLength));

  return new NextResponse(arrayBuffer, { status: 200, headers });
}
