import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAppBaseUrlServer } from "@/lib/appBaseUrl";
import { assertNotRealtor } from "@/lib/authz";
import { sendShareLinkEmail } from "@/lib/email/sendShareLinkEmail";

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
  ctx: { params: Promise<{ dealId: string }> },
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

  const realtorCheck = assertNotRealtor(user);
  if (!realtorCheck.ok) {
    return NextResponse.json(
      { ok: false, error: realtorCheck.error },
      { status: realtorCheck.status },
    );
  }

  const { dealId } = await ctx.params;

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
    "mint_deal_share_token_v2",
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

  let emailed = false;
  let warning: string | undefined;

  if (recipientEmail && recipientEmail.includes("@") && recipientEmail.length <= 254) {
    const fromEmail = process.env.SHARE_FROM_EMAIL;
    if (!fromEmail) {
      console.error("share_email_missing_from", { hint: "SHARE_FROM_EMAIL env var not set" });
      warning = "Email sending is not configured. Use the link to share.";
    } else {
      try {
        await sendShareLinkEmail({
          to: recipientEmail,
          from: fromEmail,
          subject: "FractPath deal link",
          text: `You've been sent a FractPath deal link.\n\nView the deal here:\n${shareUrl}\n\nThis link provides read-only access to the deal details.`,
          html: `<p>You've been sent a FractPath deal link.</p><p><a href="${shareUrl}">View the deal</a></p><p style="color:#666;font-size:13px;">This link provides read-only access to the deal details.</p>`,
        });
        emailed = true;
      } catch (err: any) {
        console.error("share_email_send_failed", {
          dealId,
          to: recipientEmail,
          error: err?.message,
        });
        warning = "Could not send email. Use the link below to share manually.";
      }
    }
  }

  return NextResponse.json({
    ok: true,
    token,
    shareUrl,
    recipientEmail: recipientEmail || null,
    emailed,
    ...(warning ? { warning } : {}),
  });
}
