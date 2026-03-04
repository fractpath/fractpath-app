// src/app/api/proposals/[proposalId]/owner-decision/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ proposalId: string }> },
) {
  const { proposalId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return json(401, { ok: false, error: "Unauthorized" });

  const body = await req.json().catch(() => ({}));
  const decision =
    body?.decision === "accept" || body?.decision === "reject"
      ? (body.decision as "accept" | "reject")
      : null;

  if (!decision) {
    return json(400, { ok: false, error: "Invalid decision" });
  }

  const svc = createServiceClient();

  // 1) Load proposal (NO deal_id column assumed)
  const { data: proposal, error: propErr } = await (
    svc.from("deal_proposals") as any
  )
    .select("id, thread_id, status")
    .eq("id", proposalId)
    .single();

  if (propErr || !proposal) {
    return json(404, { ok: false, error: "Proposal not found" });
  }

  // 2) Load thread + property
  const { data: thread, error: threadErr } = await (
    svc.from("deal_threads") as any
  )
    .select("id, status, property_id")
    .eq("id", proposal.thread_id)
    .single();

  if (threadErr || !thread) {
    return json(404, { ok: false, error: "Thread not found" });
  }

  const { data: property, error: propertyErr } = await (
    svc.from("properties") as any
  )
    .select("id, status, owner_user_id")
    .eq("id", thread.property_id)
    .single();

  if (propertyErr || !property) {
    return json(404, { ok: false, error: "Property not found" });
  }

  // 3) Enforce owner + verified + pending_owner
  if (property.owner_user_id !== user.id) {
    return json(403, { ok: false, error: "Access denied" });
  }

  if (property.status !== "verified") {
    return json(409, {
      ok: false,
      error: "Property verification required to accept",
    });
  }

  if (thread.status !== "pending_owner") {
    return json(409, {
      ok: false,
      error: `Invalid thread status: ${thread.status}`,
    });
  }

  // 4) Resolve deal_id from offer_submitted event for this proposal
  const { data: offerEv, error: offerErr } = await (
    svc.from("deal_events") as any
  )
    .select("id, deal_id, payload, created_at")
    .eq("event_type", "offer_submitted")
    .eq("payload->>proposal_id", proposalId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (offerErr || !offerEv?.deal_id) {
    return json(409, {
      ok: false,
      error: "Cannot resolve deal for this proposal (missing offer_submitted)",
    });
  }

  const dealId = offerEv.deal_id as string;
  const nowIso = new Date().toISOString();

  if (decision === "accept") {
    // 1) Insert acceptance event first (idempotent: avoid duplicates)
    const { data: existing } = await (svc.from("deal_events") as any)
      .select("id")
      .eq("deal_id", dealId)
      .eq("event_type", "OFFER_ACCEPTED")
      .eq("payload->>proposal_id", proposalId)
      .limit(1)
      .maybeSingle();

    if (!existing) {
      const { error: evInsErr } = await (svc.from("deal_events") as any).insert(
        {
          deal_id: dealId,
          event_type: "OFFER_ACCEPTED",
          payload: { thread_id: thread.id, proposal_id: proposalId },
          created_by: user.id,
        },
      );

      if (evInsErr) {
        return json(500, { ok: false, error: evInsErr.message });
      }
    }

    // 2) Then update thread status (guard against repeated accepts)
    const { error: tUpdErr } = await (svc.from("deal_threads") as any)
      .update({ status: "accepted" })
      .eq("id", thread.id)
      .eq("status", "pending_owner");

    if (tUpdErr) {
      return json(500, { ok: false, error: tUpdErr.message });
    }

    return json(200, {
      ok: true,
      deal_id: dealId,
      thread_id: thread.id,
      status: "accepted",
    });
  }

  // decision === "reject" (mirrors accept: event first, guarded thread update)
  const { data: existingReject } = await (svc.from("deal_events") as any)
    .select("id")
    .eq("deal_id", dealId)
    .eq("event_type", "OFFER_REJECTED")
    .eq("payload->>proposal_id", proposalId)
    .limit(1)
    .maybeSingle();

  if (!existingReject) {
    const { error: evInsErr } = await (svc.from("deal_events") as any).insert({
      deal_id: dealId,
      event_type: "OFFER_REJECTED",
      payload: { thread_id: thread.id, proposal_id: proposalId },
      created_by: user.id,
    });

    if (evInsErr) {
      return json(500, { ok: false, error: evInsErr.message });
    }
  }

  const { error: tUpdErr } = await (svc.from("deal_threads") as any)
    .update({ status: "declined" })
    .eq("id", thread.id)
    .eq("status", "pending_owner");

  if (tUpdErr) {
    return json(500, { ok: false, error: tUpdErr.message });
  }

  return json(200, {
    ok: true,
    deal_id: dealId,
    thread_id: thread.id,
    status: "declined",
  });
}
