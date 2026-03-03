import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

export async function POST(
  req: NextRequest,
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

  if (thread.buyer_user_id !== user.id) {
    return json(403, { error: "Only the buyer can withdraw" });
  }

  if (thread.status !== "pending_owner") {
    return json(400, {
      error: "Can only withdraw threads in pending_owner status",
    });
  }

  const { error: updErr } = await (svc.from("deal_threads") as any)
    .update({ status: "withdrawn" })
    .eq("id", threadId);

  if (updErr) return json(500, { error: updErr.message });

  if (thread.deal_id) {
    await (svc.from("deal_events") as any).insert({
      deal_id: thread.deal_id,
      event_type: "offer_withdrawn",
      payload: { thread_id: threadId },
      created_by: user.id,
    });
  }

  return json(200, { ok: true, status: "withdrawn" });
}
