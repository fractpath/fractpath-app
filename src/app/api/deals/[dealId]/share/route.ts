import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import crypto from "crypto";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function base64Url(bytes: Buffer) {
  return bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ dealId: string }> },
) {
  const { dealId } = await context.params;

  if (!isUuid(dealId)) {
    return jsonError("Invalid deal ID", 400);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const toEmail = String(body?.toEmail ?? "").trim();
  if (!toEmail || !toEmail.includes("@")) {
    return jsonError("Valid toEmail is required", 400);
  }

  const service = createServiceClient();

  const { data: deal, error: dealError } = await (service.from("deals") as any)
    .select("id, owner_user_id")
    .eq("id", dealId)
    .maybeSingle();

  if (dealError || !deal) {
    return jsonError("Deal not found", 404);
  }

  let isOwner = deal.owner_user_id === user.id;

  if (!isOwner) {
    const { data: grant } = await (service.from("deal_access_grants") as any)
      .select("role")
      .eq("deal_id", dealId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (grant?.role === "OWNER") {
      isOwner = true;
    }
  }

  if (!isOwner) {
    return jsonError("Forbidden (OWNER only)", 403);
  }

  const token = base64Url(crypto.randomBytes(32));

  const { error: insertError } = await (service.from("deal_share_tokens") as any).insert({
    token,
    deal_id: dealId,
    to_email: toEmail,
    created_by: user.id,
  });

  if (insertError) {
    console.error("deal_share_tokens insert error:", insertError.message);
    return jsonError("Failed to create share link", 500);
  }

  const origin = request.headers.get("x-forwarded-host")
    ? `https://${request.headers.get("x-forwarded-host")}`
    : request.headers.get("origin") || new URL(request.url).origin;

  const shareUrl = `${origin}/share?t=${encodeURIComponent(token)}`;

  return NextResponse.json({ ok: true, shareUrl });
}
