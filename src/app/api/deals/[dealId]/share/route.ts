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

function fallback(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "\u2014";
  const s = String(value).trim();
  return s.length ? s : "\u2014";
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "\u2014";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
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

  if (
    recipientEmail &&
    recipientEmail.includes("@") &&
    recipientEmail.length <= 254
  ) {
    const fromEmail =
      process.env.RESEND_FROM_EMAIL ??
      process.env.SHARE_FROM_EMAIL ??
      "notifications@notify.fractpath.com";

    const templateId =
      process.env.RESEND_TEMPLATE_DEAL_SHARE_ID || "fractpath-deal-share-link";

    let templateVariables: Record<string, string> = {
      PREVIEW_TEXT: "Someone shared a FractPath deal with you",
      DEAL_TITLE: "Shared FractPath Deal",
      PROPERTY_LOCATION: "\u2014",
      HOME_VALUE: "\u2014",
      UPFRONT_CASH: "\u2014",
      MONTHLY_PAYMENT: "\u2014",
      MONTHS: "\u2014",
      EXIT_YEAR: "\u2014",
      SHARE_URL: shareUrl,
    };

    try {
      const { data: latestSnap } = await supabase
        .from("deal_snapshots")
        .select("snapshot_json")
        .eq("deal_id", dealId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const snap = (latestSnap as any)?.snapshot_json;
      if (snap && typeof snap === "object") {
        const header = snap?.meta?.header;
        const dealTerms = snap?.inputs?.deal_terms;
        const scenario = snap?.inputs?.scenario;

        templateVariables = {
          PREVIEW_TEXT: "Someone shared a FractPath deal with you",
          DEAL_TITLE: fallback(header?.title ?? "Shared FractPath Deal"),
          PROPERTY_LOCATION: fallback(header?.display_address),
          HOME_VALUE: formatCurrency(
            typeof dealTerms?.property_value === "number"
              ? dealTerms.property_value
              : null,
          ),
          UPFRONT_CASH: formatCurrency(
            typeof dealTerms?.upfront_payment === "number"
              ? dealTerms.upfront_payment
              : null,
          ),
          MONTHLY_PAYMENT: formatCurrency(
            typeof dealTerms?.monthly_payment === "number"
              ? dealTerms.monthly_payment
              : null,
          ),
          MONTHS:
            typeof dealTerms?.number_of_payments === "number"
              ? `${Math.round(dealTerms.number_of_payments)} months`
              : "\u2014",
          EXIT_YEAR:
            scenario?.exit_year != null
              ? String(scenario.exit_year)
              : "\u2014",
          SHARE_URL: shareUrl,
        };
      }
    } catch (snapErr: any) {
      console.error("share_email_snapshot_fetch_failed", {
        dealId,
        error: snapErr?.message,
      });
    }

    try {
      await sendShareLinkEmail({
        to: recipientEmail,
        from: fromEmail,
        subject: `FractPath deal share: ${templateVariables.DEAL_TITLE}`,
        template: {
          id: templateId,
          variables: templateVariables,
        },
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

  return NextResponse.json({
    ok: true,
    token,
    shareUrl,
    recipientEmail: recipientEmail || null,
    emailed,
    ...(warning ? { warning } : {}),
  });
}
