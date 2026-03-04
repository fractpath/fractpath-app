import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

type Decision = "accept" | "reject";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ proposalId: string }> },
) {
  const { proposalId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json(401, { error: "Unauthorized" });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const decision: Decision | undefined = body?.decision;
  if (decision !== "accept" && decision !== "reject") {
    return json(400, {
      error: 'Body must be { decision: "accept" | "reject" }',
    });
  }

  const svc = createServiceClient();

  const { data: proposal, error: propErr } = await (svc.from("deal_proposals") as any)
    .select("id, thread_id, deal_id")
    .eq("id", proposalId)
    .maybeSingle();

  if (propErr) return json(500, { error: propErr.message });
  if (!proposal) return json(404, { error: "Proposal not found" });

  const { data: thread, error: tErr } = await (svc.from("deal_threads") as any)
    .select("id, property_id, status")
    .eq("id", proposal.thread_id)
    .maybeSingle();

  if (tErr) return json(500, { error: tErr.message });
  if (!thread) return json(404, { error: "Thread not found" });

  if (thread.status !== "pending_owner") {
    return json(409, {
      ok: false,
      error: `Thread is not pending owner decision (current: ${thread.status})`,
    });
  }

  const { data: property, error: pErr } = await (svc.from("properties") as any)
    .select("owner_user_id, status")
    .eq("id", thread.property_id)
    .maybeSingle();

  if (pErr) return json(500, { error: pErr.message });
  if (!property) return json(404, { error: "Property not found" });

  if (property.owner_user_id !== user.id) {
    return json(403, { error: "Forbidden — you are not the property owner" });
  }

  if (property.status !== "verified") {
    return json(403, {
      error: "Property must be verified before you can accept or reject offers",
    });
  }

  if (decision === "accept") {
    const { error: threadUpd } = await (svc.from("deal_threads") as any)
      .update({ status: "accepted" })
      .eq("id", thread.id);

    if (threadUpd) return json(500, { error: threadUpd.message });

    if (proposal.deal_id) {
      const { error: dealUpd } = await (svc.from("deals") as any)
        .update({ status: "ACTIVE" })
        .eq("id", proposal.deal_id);

      if (dealUpd) {
        console.error("DEAL_STATUS_UPDATE_FAILED", dealUpd);
      }
    }

    await (svc.from("deal_events") as any).insert({
      deal_id: proposal.deal_id,
      event_type: "OFFER_ACCEPTED",
      payload: { proposal_id: proposalId },
      created_by: user.id,
    });

    return json(200, { ok: true, status: "accepted" });
  }

  const { error: threadUpd } = await (svc.from("deal_threads") as any)
    .update({ status: "declined" })
    .eq("id", thread.id);

  if (threadUpd) return json(500, { error: threadUpd.message });

  await (svc.from("deal_events") as any).insert({
    deal_id: proposal.deal_id,
    event_type: "OFFER_REJECTED",
    payload: { proposal_id: proposalId },
    created_by: user.id,
  });

  return json(200, { ok: true, status: "declined" });
}
