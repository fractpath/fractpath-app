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

async function requireActiveOwner(
  supabase: any,
  dealId: string,
  userId: string,
) {
  const { data: ownerGrant, error: ownerErr } = await (
    supabase.from("deal_access_grants") as any
  )
    .select("role, revoked_at, expires_at")
    .eq("deal_id", dealId)
    .eq("user_id", userId)
    .maybeSingle();

  if (ownerErr)
    return {
      ok: false as const,
      status: 500,
      payload: { detail: ownerErr.message },
    };

  const now = Date.now();
  const isActiveOwner =
    ownerGrant &&
    ownerGrant.role === "OWNER" &&
    ownerGrant.revoked_at == null &&
    (ownerGrant.expires_at == null ||
      new Date(ownerGrant.expires_at).getTime() > now);

  if (!isActiveOwner) {
    return {
      ok: false as const,
      status: 403,
      payload: { debug: { user_id: userId, ownerGrant } },
    };
  }

  return { ok: true as const };
}

export async function POST(
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

    const ownerCheck = await requireActiveOwner(supabase, dealId, user.id);
    if (!ownerCheck.ok)
      return jsonError(
        "Forbidden (OWNER only)",
        ownerCheck.status,
        ownerCheck.payload,
      );

    const service = createServiceClient();

    const { data: deal, error: fetchError } = await (
      service.from("deals") as any
    )
      .select("status")
      .eq("id", dealId)
      .maybeSingle();

    if (fetchError)
      return jsonError("Failed to fetch deal", 500, {
        detail: fetchError.message,
      });
    if (!deal) return jsonError("Deal not found", 404);

    // Idempotent success
    if (deal.status === "FUNDED") {
      return NextResponse.json({ ok: true, status: "FUNDED" });
    }

    // Strict forward check
    if (deal.status !== "EXECUTED") {
      return jsonError(
        `Invalid transition: ${deal.status} → FUNDED`,
        400,
      );
    }

    const { error: updateError } = await (service.from("deals") as any)
      .update({ status: "FUNDED" })
      .eq("id", dealId);

    if (updateError)
      return jsonError("Failed to fund deal", 500, {
        detail: updateError.message,
      });

    const { error: eventErr } = await (
      service.from("deal_events") as any
    ).insert({
      deal_id: dealId,
      event_type: "DEAL_FUNDED",
      payload: {},
      created_by: user.id,
    });

    if (eventErr) {
      console.error("deal_funded_event_insert_error", eventErr.message);
      return NextResponse.json({
        ok: true,
        warning: "Funded, but failed to write audit event",
        detail: eventErr.message,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("fund_route_fatal", e?.message || e);
    return jsonError("Internal error", 500, { detail: e?.message });
  }
}
