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

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON" });
  }

  const termsSnapshot = body?.terms_snapshot;
  if (!termsSnapshot || typeof termsSnapshot !== "object") {
    return json(422, { ok: false, error: "terms_snapshot required" });
  }

  const svc = createServiceClient();

  const { data: proposal, error: propErr } = await (
    svc.from("deal_proposals") as any
  )
    .select("id, thread_id, status, created_by_user_id")
    .eq("id", proposalId)
    .single();

  if (propErr || !proposal) {
    return json(404, { ok: false, error: "Proposal not found" });
  }

  if (proposal.status !== "submitted") {
    return json(409, {
      ok: false,
      error: `Cannot counter a proposal with status: ${proposal.status}`,
    });
  }

  if (proposal.created_by_user_id === user.id) {
    return json(403, {
      ok: false,
      error: "Cannot counter your own proposal. Wait for the other party to respond.",
    });
  }

  const { data: thread, error: threadErr } = await (
    svc.from("deal_threads") as any
  )
    .select("id, status, property_id, buyer_user_id, owner_user_id, deal_id")
    .eq("id", proposal.thread_id)
    .single();

  if (threadErr || !thread) {
    return json(404, { ok: false, error: "Thread not found" });
  }

  if (!["pending_owner", "negotiating"].includes(thread.status)) {
    return json(409, {
      ok: false,
      error: `Cannot counter in thread status: ${thread.status}`,
    });
  }

  const isBuyer = thread.buyer_user_id === user.id;
  const isThreadOwner = thread.owner_user_id === user.id;

  let isPropertyOwner = false;
  if (thread.property_id) {
    const { data: property } = await (svc.from("properties") as any)
      .select("owner_user_id")
      .eq("id", thread.property_id)
      .maybeSingle();
    isPropertyOwner = !!property && property.owner_user_id === user.id;
  }

  let isInvitedOwner = false;
  if (!isBuyer && !isThreadOwner && !isPropertyOwner && user.email) {
    const { data: invite } = await (svc.from("thread_invites") as any)
      .select("id, intended_role, expires_at")
      .eq("thread_id", thread.id)
      .eq("invitee_email", user.email.toLowerCase())
      .eq("intended_role", "owner")
      .limit(1)
      .maybeSingle();

    if (invite) {
      const notExpired =
        !invite.expires_at || new Date(invite.expires_at) > new Date();
      isInvitedOwner = notExpired;
    }
  }

  const hasAccess = isBuyer || isThreadOwner || isPropertyOwner || isInvitedOwner;
  if (!hasAccess) {
    return json(403, { ok: false, error: "Access denied" });
  }

  const dealId = thread.deal_id as string;

  const { data: newProposal, error: newPropErr } = await (
    svc.from("deal_proposals") as any
  )
    .insert({
      thread_id: thread.id,
      created_by_user_id: user.id,
      status: "submitted",
      terms_snapshot: termsSnapshot,
    })
    .select("id")
    .single();

  if (newPropErr) {
    return json(500, { ok: false, error: newPropErr.message });
  }

  const { error: oldUpdErr } = await (svc.from("deal_proposals") as any)
    .update({ status: "withdrawn" })
    .eq("id", proposalId)
    .eq("status", "submitted");

  if (oldUpdErr) {
    console.error("counter_old_proposal_update_error", oldUpdErr);
  }

  await (svc.from("deal_threads") as any)
    .update({
      current_proposal_id: newProposal.id,
      status: "negotiating",
    })
    .eq("id", thread.id);

  if (!thread.owner_user_id && (isPropertyOwner || isInvitedOwner)) {
    await (svc.from("deal_threads") as any)
      .update({ owner_user_id: user.id })
      .eq("id", thread.id)
      .is("owner_user_id", null);
  }

  await (svc.from("deal_events") as any).insert({
    deal_id: dealId,
    event_type: "COUNTER_OFFER_SENT",
    payload: {
      thread_id: thread.id,
      old_proposal_id: proposalId,
      new_proposal_id: newProposal.id,
      counter_by: user.id,
    },
    created_by: user.id,
  });

  return json(200, {
    ok: true,
    proposal_id: newProposal.id,
    old_proposal_id: proposalId,
    thread_id: thread.id,
    deal_id: dealId,
  });
}
