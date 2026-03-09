import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function errPayload(where: string, e: any) {
  return {
    ok: false,
    where,
    error: e?.message ?? String(e),
    code: e?.code ?? null,
    hint: e?.hint ?? null,
    details: e?.details ?? null,
  };
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ threadId: string }> },
) {
  try {
    const { threadId } = await ctx.params;
    if (!threadId) {
      return json(400, {
        ok: false,
        where: "input",
        error: "threadId is required",
      });
    }

    const supabase = await createClient();

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return json(401, errPayload("auth", authErr));
    if (!auth?.user)
      return json(401, { ok: false, where: "auth", error: "Unauthorized" });

    let body: any = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }

    const owner_user_id = (body?.owner_user_id ?? "").toString().trim();
    if (!owner_user_id) {
      return json(400, {
        ok: false,
        where: "input",
        error: "owner_user_id is required",
      });
    }
    if (owner_user_id === auth.user.id) {
      return json(400, {
        ok: false,
        where: "input",
        error: "owner_user_id cannot equal caller",
      });
    }

    const { data: thread, error: threadErr } = await supabase
      .from("deal_threads")
      .select("id, created_by_user_id, buyer_user_id, owner_user_id, status")
      .eq("id", threadId)
      .maybeSingle();

    if (threadErr) return json(400, errPayload("select_thread", threadErr));
    if (!thread) {
      return json(404, {
        ok: false,
        where: "select_thread",
        error: "Thread not found",
      });
    }

    const callerId = auth.user.id;
    const isBuyerOrCreator =
      thread.buyer_user_id === callerId ||
      thread.created_by_user_id === callerId;

    if (!isBuyerOrCreator) {
      return json(403, {
        ok: false,
        where: "authz",
        error: "Forbidden",
        caller_user_id: callerId,
        thread_created_by_user_id: thread.created_by_user_id,
        thread_buyer_user_id: thread.buyer_user_id,
      });
    }

    if (thread.owner_user_id && thread.owner_user_id !== owner_user_id) {
      return json(409, {
        ok: false,
        where: "update_thread_owner",
        error: "owner_user_id already set to a different user",
        current_owner_user_id: thread.owner_user_id,
      });
    }

    if (!thread.owner_user_id) {
      const { error: updErr } = await supabase
        .from("deal_threads")
        .update({ owner_user_id })
        .eq("id", threadId);

      if (updErr) return json(400, errPayload("update_thread_owner", updErr));
    }

    const { data: existingPart, error: partSelErr } = await supabase
      .from("deal_thread_participants")
      .select("thread_id")
      .eq("thread_id", threadId)
      .eq("user_id", owner_user_id)
      .maybeSingle();

    if (partSelErr)
      return json(400, errPayload("insert_owner_participant", partSelErr));

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

      if (insErr)
        return json(400, errPayload("insert_owner_participant", insErr));
      participant_created = true;
    }

    return json(200, {
      ok: true,
      thread_id: threadId,
      owner_user_id,
      participant_created,
    });
  } catch (e: any) {
    return json(500, {
      ok: false,
      where: "unexpected",
      error: e?.message ?? String(e),
    });
  }
}
