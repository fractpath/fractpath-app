import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

type Decision = "accept" | "reject";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ proposalId: string }> },
) {
  const supabase = await createClient();
  const { proposalId } = await ctx.params;

  // Auth
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) return json(401, { error: "Unauthorized" });
  const userId = auth?.user?.id;
  if (!userId) return json(401, { error: "Unauthorized" });

  // Parse body
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

  // Load proposal (need thread_id + status)
  const { data: proposal, error: propErr } = await supabase
    .from("deal_proposals")
    .select("id, thread_id, status")
    .eq("id", proposalId)
    .maybeSingle();

  if (propErr) return json(500, { error: propErr.message });
  if (!proposal) return json(404, { error: "Proposal not found" });

  const threadId = (proposal as any).thread_id as string;
  const currentStatus = String((proposal as any).status);

  // Load thread owner + property_id for verification gate
  const { data: thread, error: tErr } = await supabase
    .from("deal_threads")
    .select("id, owner_user_id, status, property_id")
    .eq("id", threadId)
    .maybeSingle();

  if (tErr) return json(500, { error: tErr.message });
  if (!thread) return json(404, { error: "Thread not found" });

  const isOwner = (thread as any).owner_user_id === userId;
  if (!isOwner) return json(403, { error: "Forbidden" });

  // Idempotency: if already finalized, return 200 with current status
  if (currentStatus === "accepted" || currentStatus === "rejected") {
    return json(200, {
      ok: true,
      proposal_id: proposalId,
      status: currentStatus,
    });
  }

  // Only submitted proposals are decidable
  if (currentStatus !== "submitted") {
    return json(400, {
      error: "Only submitted proposals may be accepted/rejected",
    });
  }

  // Verification gate: block accept if property is not verified
  if (decision === "accept") {
    const svc = createServiceClient();
    const { data: prop } = await (svc.from("properties") as any)
      .select("status")
      .eq("id", (thread as any).property_id)
      .maybeSingle();

    if (!prop || prop.status !== "verified") {
      return json(409, {
        ok: false,
        error: "Property verification required to accept",
      });
    }
  }

  const targetStatus = decision === "accept" ? "accepted" : "rejected";

  // Update proposal status
  const { data: updated, error: updErr } = await supabase
    .from("deal_proposals")
    .update({ status: targetStatus })
    .eq("id", proposalId)
    .select("id, thread_id, status")
    .single();

  if (updErr) return json(500, { error: updErr.message });

  // Minimal: if accepted, mark thread accepted as well (canonical status already used)
  if (targetStatus === "accepted") {
    const { error: threadUpdErr } = await supabase
      .from("deal_threads")
      .update({ status: "accepted" })
      .eq("id", threadId);

    if (threadUpdErr) return json(500, { error: threadUpdErr.message });
  }

  return json(200, {
    ok: true,
    proposal_id: proposalId,
    status: (updated as any).status,
  });
}
