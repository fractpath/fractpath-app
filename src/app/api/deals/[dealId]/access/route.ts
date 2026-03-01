import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function jsonError(message: string, status = 400, extra?: any) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ dealId: string }> },
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr)
      return jsonError("Auth error", 401, { detail: userErr.message });
    if (!user) return jsonError("Unauthorized", 401);

    const { dealId } = await context.params;

    const { data: ownerGrant, error: ownerErr } = await (
      supabase.from("deal_access_grants") as any
    )
      .select("role, revoked_at, expires_at")
      .eq("deal_id", dealId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (ownerErr)
      return jsonError("Owner grant check failed", 500, {
        detail: ownerErr.message,
      });

    // enforce active OWNER (belt-and-suspenders)
    const now = Date.now();
    const isActive =
      ownerGrant &&
      ownerGrant.role === "OWNER" &&
      ownerGrant.revoked_at == null &&
      (ownerGrant.expires_at == null ||
        new Date(ownerGrant.expires_at).getTime() > now);

    if (!isActive) {
      return jsonError("Forbidden (OWNER only)", 403, {
        debug: { user_id: user.id, ownerGrant },
      });
    }

    const service = createServiceClient();
    const { data: grants, error: listErr } = await (
      service.from("deal_access_grants") as any
    )
      .select("id, user_id, role, created_at, expires_at, revoked_at")
      .eq("deal_id", dealId)
      .is("revoked_at", null)
      .order("created_at", { ascending: true });

    if (listErr)
      return jsonError("Failed to list grants", 500, {
        detail: listErr.message,
      });

    const active = (grants ?? []).filter((g: any) => {
      if (!g.expires_at) return true;
      return new Date(g.expires_at).getTime() > now;
    });

    return NextResponse.json({ ok: true, grants: active });
  } catch (e: any) {
    console.error("access_route_fatal", e?.message || e);
    return jsonError("Internal error", 500, { detail: e?.message });
  }
}
