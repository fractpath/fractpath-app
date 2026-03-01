import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

export async function POST(
  req: NextRequest,
  ctx: { params: { threadId: string } },
) {
  try {
    const threadId = ctx?.params?.threadId;

    if (!threadId) {
      return json(400, { ok: false, error: "threadId is required" });
    }

    const supabase = createRouteHandlerClient({ cookies });

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return json(401, { ok: false, error: authErr.message });
    if (!auth?.user) return json(401, { ok: false, error: "Unauthorized" });

    let body: any = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }

    console.log("[DEBUG /api/threads/set-owner] user.id =", auth.user.id);
    console.log("[DEBUG /api/threads/set-owner] threadId =", threadId);
    console.log("[DEBUG /api/threads/set-owner] body =", JSON.stringify(body));

    const { createServiceClient } = await import("@/lib/supabase/service");
    const svc = createServiceClient();
    const { data: svcThread } = await (svc.from("deal_threads") as any)
      .select("id, created_by_user_id, buyer_user_id, owner_user_id, status")
      .eq("id", threadId)
      .maybeSingle();
    console.log("[DEBUG /api/threads/set-owner] thread row (svc):", JSON.stringify(svcThread));

    if (svcThread) {
      const uid = auth.user.id;
      console.log("[DEBUG /api/threads/set-owner] match check:", {
        isCreator: svcThread.created_by_user_id === uid,
        isBuyer: svcThread.buyer_user_id === uid,
        isOwner: svcThread.owner_user_id === uid,
      });
    }

    const owner_user_id = (body?.owner_user_id ?? "").toString().trim();
    if (!owner_user_id) {
      return json(400, { ok: false, error: "owner_user_id is required" });
    }
    if (owner_user_id === auth.user.id) {
      return json(400, {
        ok: false,
        error: "owner_user_id cannot equal caller",
      });
    }

    // Load thread (Phase 2 RLS should allow buyer/creator to read)
    const { data: thread, error: threadErr } = await supabase
      .from("deal_threads")
      .select("id, created_by_user_id, buyer_user_id, owner_user_id, status")
      .eq("id", threadId)
      .maybeSingle();

    if (threadErr) return json(400, { ok: false, error: threadErr.message });
    if (!thread) return json(404, { ok: false, error: "Thread not found" });

    const callerId = auth.user.id;
    const isBuyerOrCreator =
      thread.buyer_user_id === callerId ||
      thread.created_by_user_id === callerId;

    if (!isBuyerOrCreator) return json(403, { ok: false, error: "Forbidden" });

    // Prevent overwriting an existing different owner
    if (thread.owner_user_id && thread.owner_user_id !== owner_user_id) {
      return json(409, {
        ok: false,
        error: "owner_user_id already set to a different user",
        current_owner_user_id: thread.owner_user_id,
      });
    }

    // Set owner_user_id if unset (idempotent)
    if (!thread.owner_user_id) {
      const { error: updErr } = await supabase
        .from("deal_threads")
        .update({ owner_user_id })
        .eq("id", threadId);

      if (updErr) return json(400, { ok: false, error: updErr.message });
    }

    // Ensure participant row exists for owner (idempotent)
    const { data: existingPart, error: partSelErr } = await supabase
      .from("deal_thread_participants")
      .select("id")
      .eq("thread_id", threadId)
      .eq("user_id", owner_user_id)
      .maybeSingle();

    if (partSelErr) return json(400, { ok: false, error: partSelErr.message });

    let participant_created = false;

    if (!existingPart) {
      const { error: insErr } = await supabase
        .from("deal_thread_participants")
        .insert({
          thread_id: threadId,
          user_id: owner_user_id,
          role: "owner",
          permission: "decide",
          status: "active",
        });

      if (insErr) return json(400, { ok: false, error: insErr.message });
      participant_created = true;
    }

    return json(200, {
      ok: true,
      thread_id: threadId,
      owner_user_id,
      participant_created,
    });
  } catch (e: any) {
    // Never throw — return the actual runtime error so we can fix the real cause.
    return json(500, {
      ok: false,
      error: "Internal Server Error",
      detail: e?.message ?? String(e),
      // keep stack in dev; if you don't want it, delete these 2 lines
      stack: e?.stack ?? null,
    });
  }
}
