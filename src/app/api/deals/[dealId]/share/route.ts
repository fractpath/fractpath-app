import { NextResponse } from "next/server";
import { createClient } from "@#/lib/supabaseServer";
import crypto from "crypto";

function base64Url(bytes: Buffer) {
  return bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function getShareBaseUrl() {
  // Expected env:
  // SHARE_CONTINUE_URL=https://app.fractpath.com/share
  return process.env.SHARE_CONTINUE_URL ?? "https://app.fractpath.com/share";
}

export async function POST(
  request: Request,
  context: { params: { dealId: string } }
) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dealId = context.params.dealId;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const toEmail = String(body?.toEmail ?? "").trim();
  if (!toEmail || !toEmail.includes("@")) {
    return NextResponse.json({ error: "Valid toEmail is required" }, { status: 400 });
  }

  // OWNER gate
  const grant = await supabase
    .from("deal_access_grants")
    .select("role")
    .eq("deal_id", dealId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (grant.error) {
    return NextResponse.json({ error: grant.error.message }, { status: 400 });
  }

  if (grant.data?.role !== "OWNER") {
    return NextResponse.json( { error: "Forbidden (OWNER only)" }, { status: 403 });
  }

  const token = base64Url(crypto.randomBytes(32));
  const shareUrl = `${getShareBaseUrl()}?t=${encodeURIComponent(token)}`;

  const insert = await supabase.from("deal_share_tokens").insert({
    token,
    deal_id: dealId,
    created_by: user.id,
  });

  if (insert.error) {
    return NextResponse.json( { error: insert.error.message }, { status: 400 });
  }

  try {
    await fetch(new URL("/api/share", request.url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ toEmail, shareUrl, dealId }),
    });
  } catch {
    // ignore
  }

  return NextResponse.json( { ok: true, shareUrl });
}
