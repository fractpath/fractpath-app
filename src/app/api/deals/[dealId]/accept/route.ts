import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function jsonError(message: string, status = 400, extra?: any) {
  return NextResponse.json(
    { ok: false, error: message, ...(extra ?? {}) },
    { status },
  );
}

export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ dealId: string }> },
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

    const { dealId } = await ctx.params;

    // Verify active OWNER grant (belt-and-suspenders; DB/RLS also enforces)
    const { data: ownerGrant, error: ownerErr } = await (
      supabase.from("deal_access_grants") as any
    )
      .select("role, revoked_at, expires_at")
      .eq("deal_id", dealId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (ownerErr) {
      return jsonError("Owner grant check failed", 500, {
        detail: ownerErr.message,
      });
    }

    const now = Date.now();
    const isActiveOwner =
      ownerGrant &&
      ownerGrant.role === "OWNER" &&
      ownerGrant.revoked_at == null &&
      (ownerGrant.expires_at == null ||
        new Date(ownerGrant.expires_at).getTime() > now);

    if (!isActiveOwner) {
      return jsonError("Forbidden (OWNER only)", 403, {
        debug: { user_id: user.id, ownerGrant },
      });
    }

    const service = createServiceClient();

    // Fetch deal status (service-role for authoritative read)
    const { data: deal, error: fetchError } = await (
      service.from("deals") as any
    )
      .select("status")
      .eq("id", dealId)
      .maybeSingle();

    if (fetchError) {
      return jsonError("Failed to fetch deal", 500, {
        detail: fetchError.message,
      });
    }
    if (!deal) {
      return jsonError("Deal not found", 404);
    }

    if (deal.status !== "PROPOSED") {
      return jsonError("Deal must be PROPOSED to accept", 400, {
        debug: { current_status: deal.status },
      });
    }

    // Update status (DB trigger sets accepted_at)
    const { error: updateError } = await (service.from("deals") as any)
      .update({ status: "ACCEPTED" })
      .eq("id", dealId);

    if (updateError) {
      return jsonError("Failed to accept deal", 500, {
        detail: updateError.message,
      });
    }

    // Insert audit event (best-effort; do not fail accept if event insert fails)
    const { error: eventErr } = await (
      service.from("deal_events") as any
    ).insert({
      deal_id: dealId,
      event_type: "DEAL_ACCEPTED",
      payload: {},
      created_by: user.id,
    });

    if (eventErr) {
      // Still return ok, but include detail for debugging
      console.error("deal_accepted_event_insert_error", eventErr.message);
      return NextResponse.json({
        ok: true,
        warning: "Accepted, but failed to write audit event",
        detail: eventErr.message,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("accept_route_fatal", e?.message || e);
    return jsonError("Internal error", 500, { detail: e?.message });
  }
}
