import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: { dealId: string } },
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dealId = params.dealId;

  // Parse body: { recipientEmail: string }
  let body: any = null;
  try {
    body = await _req.json();
  } catch {
    body = null;
  }

  const recipientEmailRaw =
    typeof body?.recipientEmail === "string" ? body.recipientEmail : "";
  const recipientEmail = recipientEmailRaw.trim().toLowerCase();

  if (!recipientEmail || !recipientEmail.includes("@")) {
    return NextResponse.json({ error: "invalid recipientEmail" }, { status: 400 });
  }

  // Canonical: mint a share token row (DB should handle security via SECURITY DEFINER RPC)
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

  // Return share URL (client can display / copy)
  const shareUrl = `https://app.fractpath.com/share?t=${encodeURIComponent(
    token as string,
  )}`;

  return NextResponse.json({ ok: true, token, shareUrl });
}
