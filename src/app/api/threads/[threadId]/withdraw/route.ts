import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

// NOTE: DB constraint only allows deal_threads.status = pending_owner|accepted.
// So "withdraw" is implemented as DELETE of the pending_owner thread + children.
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ threadId: string }> },
) {
  const supabase = await createClient();
  const { threadId } = await ctx.params;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json(401, { error: "Unauthorized" });

  const svc = createServiceClient();

  const { data: thread, error: tErr } = await (svc.from("deal_threads") as any)
    .select("id, buyer_user_id, status, deal_id")
    .eq("id", threadId)
    .maybeSingle();

  if (tErr || !thread) return json(404, { error: "Thread not found" });

  // Determine who is the sender for this thread direction:
  // - buyer→owner (pending_owner): the buyer withdraws
  // - owner→buyer (pending_buyer): the owner withdraws
  const isPendingOwner = thread.status === "pending_owner";
  const isPendingBuyer = thread.status === "pending_buyer";

  if (!isPendingOwner && !isPendingBuyer) {
    return json(400, {
      error: "Can only withdraw threads in pending_owner or pending_buyer status",
    });
  }

  if (isPendingOwner && thread.buyer_user_id !== user.id) {
    return json(403, { error: "Only the buyer can withdraw a pending_owner thread" });
  }

  if (isPendingBuyer && thread.owner_user_id !== user.id) {
    return json(403, { error: "Only the owner can withdraw a pending_buyer thread" });
  }

  // Best-effort cascade cleanup (ignore errors; final delete is the key)
  await (svc.from("deal_thread_participants") as any)
    .delete()
    .eq("thread_id", threadId);

  await (svc.from("thread_invites") as any).delete().eq("thread_id", threadId);

  await (svc.from("deal_proposals") as any).delete().eq("thread_id", threadId);

  const { error: delErr } = await (svc.from("deal_threads") as any)
    .delete()
    .eq("id", threadId);

  if (delErr) return json(500, { error: delErr.message });

  if (thread.deal_id) {
    await (svc.from("deal_events") as any).insert({
      deal_id: thread.deal_id,
      event_type: "offer_withdrawn",
      payload: { thread_id: threadId },
      created_by: user.id,
    });
  }

  // Logical status "withdrawn" even though the row is deleted.
  return json(200, { ok: true, status: "withdrawn", deleted: true });
}
