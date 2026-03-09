import { NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/app/lib/supabaseRoute";

function jsonError(message: string, status = 400, extra?: Record<string, any>) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

export async function POST(req: Request) {
  const requestId =
    (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(16).slice(2)) +
    "";

  try {
    const body = await req.json().catch(() => null);
    const token = body?.token;
    if (!token || typeof token !== "string") {
      return jsonError("Missing token", 400, { requestId });
    }

    // Create a response we can attach cookies to (if needed)
    const routeRes = NextResponse.next();
    const supabase = await createSupabaseRouteClient(req, routeRes);

    // Require auth
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) return jsonError(userErr.message, 401, { requestId });
    if (!userData?.user) return jsonError("Unauthorized", 401, { requestId });

    // ✅ Correct argument name: p_token
    const { data, error } = await supabase.rpc("redeem_deal_share_token_v2", {
      p_token: token,
    });

    if (error) {
      return jsonError(error.message, 422, {
        requestId,
        details: error.details,
        code: error.code,
      });
    }

    const dealId =
      (data && (data.deal_id ?? data.dealId ?? data)) as string | undefined;

    if (!dealId || typeof dealId !== "string") {
      return jsonError("Redeem succeeded but no dealId returned", 500, {
        requestId,
        data,
      });
    }

    return NextResponse.json({ ok: true, dealId, requestId });
  } catch (e: any) {
    return jsonError(e?.message ?? "Unexpected error", 500, { requestId });
  }
}