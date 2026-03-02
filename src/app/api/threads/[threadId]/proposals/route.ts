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

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) return json(401, { error: "Unauthorized" });
  const userId = auth?.user?.id;
  if (!userId) return json(401, { error: "Unauthorized" });

  // Authorization: buyer, owner, or participant may view proposals
  const { data: thread, error: tErr } = await supabase
    .from("deal_threads")
    .select("id, buyer_user_id, owner_user_id")
    .eq("id", threadId)
    .maybeSingle();

  if (tErr) return json(500, { error: tErr.message });
  if (!thread) return json(404, { error: "Thread not found" });

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

  const { data: proposals, error: pErr } = await supabase
    .from("deal_proposals")
    .select(
      "id, thread_id, status, created_by_user_id, terms_snapshot, created_at, updated_at",
    )
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false });

  if (pErr) return json(500, { error: pErr.message });

  return json(200, {
    ok: true,
    thread_id: threadId,
    proposals: proposals ?? [],
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ threadId: string }> },
) {
  const supabase = await createClient();
  const { threadId } = await ctx.params;

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) return json(401, { error: "Unauthorized" });
  const userId = auth?.user?.id;
  if (!userId) return json(401, { error: "Unauthorized" });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const snapshot = body?.terms_snapshot;
  if (!snapshot || typeof snapshot !== "object") {
    return json(422, { error: "terms_snapshot required" });
  }

  // Ensure caller is buyer
  const { data: thread, error: threadErr } = await supabase
    .from("deal_threads")
    .select("buyer_user_id")
    .eq("id", threadId)
    .maybeSingle();

  if (threadErr) return json(500, { error: threadErr.message });

  if (!thread || (thread as any).buyer_user_id !== userId) {
    return json(403, { error: "Only buyer may create proposals" });
  }

  const { data, error } = await supabase
    .from("deal_proposals")
    .insert({
      thread_id: threadId,
      status: "draft",
      created_by_user_id: userId,
      terms_snapshot: snapshot,
    })
    .select("*")
    .single();

  if (error) return json(500, { error: error.message });

  return json(200, { ok: true, proposal: data });
}
