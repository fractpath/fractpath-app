import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAppBaseUrlServer } from "@/lib/appBaseUrl";

function isOwnerOnlyError(err: any): boolean {
  const code = err?.code;
  const msg = String(err?.message || "");
  return (
    code === "42501" || /Only\s+OWNER/i.test(msg) || /owner\s+only/i.test(msg)
  );
}

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
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  const { dealId } = await context.params;

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

  const { data: token, error: rpcErr } = await supabase.rpc(
    "mint_deal_share_token",
    {
      p_deal_id: dealId,
      p_actor_user_id: user.id,
    },
  );

  if (rpcErr || !token) {
    if (isOwnerOnlyError(rpcErr)) {
      return NextResponse.json(
        { ok: false, error: "Forbidden (OWNER only)" },
        { status: 403 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: "share_failed",
        code: (rpcErr as any)?.code ?? null,
        message: rpcErr?.message ?? null,
      },
      { status: 400 },
    );
  }

  const APP = getAppBaseUrlServer();
  const shareUrl = `${APP}/share?t=${encodeURIComponent(token as string)}`;

  return NextResponse.json({ ok: true, token, shareUrl, recipientEmail });
}
