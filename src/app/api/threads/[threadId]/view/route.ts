import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ threadId: string }> },
) {
  const supabase = await createClient();
  const { threadId } = await ctx.params;

  // Auth
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) return json(401, { error: "Unauthorized" });
  const userId = auth?.user?.id;
  if (!userId) return json(401, { error: "Unauthorized" });

  // Thread header (select only columns we KNOW exist from your Phase 2 create route)
  const { data: thread, error: threadErr } = await supabase
    .from("deal_threads")
    .select(
      "id, property_id, status, created_at, updated_at, created_by_user_id, buyer_user_id, owner_user_id",
    )
    .eq("id", threadId)
    .maybeSingle();

  if (threadErr) return json(500, { error: threadErr.message });
  if (!thread) return json(404, { error: "Thread not found" });

  // Authorization: owner_user_id OR buyer_user_id OR participant row
  const isOwner = (thread as any).owner_user_id === userId;
  const isBuyer = (thread as any).buyer_user_id === userId;

  let isParticipant = false;
  if (!isOwner && !isBuyer) {
    const { data: p, error: pErr } = await supabase
      .from("deal_thread_participants")
      .select("thread_id")
      .eq("thread_id", threadId)
      .eq("user_id", userId)
      .maybeSingle();

    if (pErr) return json(500, { error: pErr.message });
    isParticipant = !!p;
  }

  if (!isOwner && !isBuyer && !isParticipant) {
    return json(403, { error: "Forbidden" });
  }

  // Participants roster (only fields you are definitely inserting today)
  // You insert: thread_id, user_id, role, permission, status
  const { data: participants, error: partsErr } = await supabase
    .from("deal_thread_participants")
    .select("user_id, role, permission, status, created_at")
    .eq("thread_id", threadId);

  // If created_at doesn't exist on participants, fall back.
  if (partsErr) {
    const msg = String(partsErr.message || "");
    if (msg.includes("created_at")) {
      const { data: participants2, error: partsErr2 } = await supabase
        .from("deal_thread_participants")
        .select("user_id, role, permission, status")
        .eq("thread_id", threadId);

      if (partsErr2) return json(500, { error: partsErr2.message });

      return json(200, {
        ok: true,
        thread,
        participants: participants2 ?? [],
      });
    }

    return json(500, { error: partsErr.message });
  }

  return json(200, {
    ok: true,
    thread,
    participants: participants ?? [],
  });
}
