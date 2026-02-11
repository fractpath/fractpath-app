import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ dealId: string }> },
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { dealId } = await context.params;

  // Parse body (we accept toEmail/recipientEmail/email but don't require it to mint token)
  let body: any = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const recipientEmailRaw =
    typeof body?.toEmail === "string"
      ? body.toEmail
      : typeof body?.recipientEmail === "string"
        ? body.recipientEmail
        : typeof body?.email === "string"
          ? body.email
          : "";

  const recipientEmail = recipientEmailRaw.trim().toLowerCase();

  // Mint token via SECURITY DEFINER RPC
  const { data: token, error: rpcErr } = await supabase.rpc(
    "mint_deal_share_token",
    {
      p_deal_id: dealId,
      p_actor_user_id: user.id,
    },
  );

  if (rpcErr || !token) {
    return NextResponse.json(
      {
        error: "share_failed",
        code: (rpcErr as any)?.code ?? null,
        message: rpcErr?.message ?? null,
      },
      { status: 400 },
    );
  }

  const shareUrl = `https://app.fractpath.com/share?t=${encodeURIComponent(
    token as string,
  )}`;

  // Recipient email is optional; we return it for UI confirmation/debug
  return NextResponse.json({ ok: true, token, shareUrl, recipientEmail });
}
