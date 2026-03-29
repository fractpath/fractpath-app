import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// TODO(renegotiation): Replace this simulation endpoint with a real renegotiation
// initiation flow — e.g. creating a new counter-offer proposal on the existing thread,
// or forking the deal with a revised term set. Currently only logs the intent to
// deal_events so the admin can see the request and work with both parties.

type Ctx = { params: Promise<{ dealId: string }> };

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { dealId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return jsonError("Unauthorized", 401);

  const svc = createServiceClient();

  // Confirm the user owns this deal via thread (owner_user_id) or direct
  const { data: deal } = await (svc.from("deals") as any)
    .select("id, owner_user_id, triage_status")
    .eq("id", dealId)
    .maybeSingle();

  const { data: thread } = await (svc.from("deal_threads") as any)
    .select("id, owner_user_id, deal_id")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const isOwner =
    deal?.owner_user_id === user.id || thread?.owner_user_id === user.id;

  if (!isOwner) {
    return jsonError("Only the property owner can request renegotiation", 403);
  }

  if (deal?.triage_status !== "ineligible") {
    return jsonError(
      "Renegotiation can only be requested when the deal is ineligible",
      422,
    );
  }

  // Idempotency — check if already logged within last 24 hours
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await (svc.from("deal_events") as any)
    .select("id, created_at")
    .eq("deal_id", dealId)
    .eq("event_type", "DEAL_RENEGOTIATION_REQUESTED")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      ok: true,
      dealId,
      alreadyLogged: true,
      loggedAt: existing.created_at,
    });
  }

  // Log to deal_events
  const { error: evErr } = await (svc.from("deal_events") as any).insert({
    deal_id: dealId,
    event_type: "DEAL_RENEGOTIATION_REQUESTED",
    created_by: user.id,
    payload: {
      reason: "owner_requested_renegotiation_after_ineligible",
      triage_status_at_request: deal?.triage_status ?? null,
      note: "[sim] Owner has requested renegotiation due to deal term ineligibility. Admin should work with both parties to revise terms within the eligible LTV band.",
    },
  });

  if (evErr) {
    console.error("LOG_RENEGOTIATION_EVENT_FAILED", { dealId, evErr });
    return jsonError("Failed to log renegotiation request", 500);
  }

  return NextResponse.json({
    ok: true,
    dealId,
    alreadyLogged: false,
    loggedAt: new Date().toISOString(),
  });
}
