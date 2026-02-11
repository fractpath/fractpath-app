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

  let body: any = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const recipientEmailRaw =
    typeof body?.recipientEmail === "string" ? body.recipientEmail : "";
  const recipientEmail = recipientEmailRaw.trim().toLowerCase();

  if (!recipientEmail || !recipientEmail.includes("@")) {
    return NextResponse.json(
      { error: "invalid recipientEmail" },
      { status: 400 },
    );
  }

  // NOTE: This assumes your DB function exists and returns a token string.
  // If it errors, we surface the DB error code/message safely.
  const { data: token, error: rpcErr } = await supabase.rpc(
    "prepare_proposal_for_outreach",
    {
      p_deal_id: dealId,
      p_actor_user_id: user.id,
      p_recipient_email: recipientEmail,
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

  return NextResponse.json({ ok: true, token, shareUrl });
}
