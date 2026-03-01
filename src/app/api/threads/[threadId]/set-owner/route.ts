import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function diagErr(err: any) {
  return {
    error: err?.message ?? String(err),
    code: err?.code ?? null,
    hint: err?.hint ?? null,
    details: err?.details ?? null,
  };
}

export async function POST(
  req: NextRequest,
  ctx: { params: { threadId: string } },
) {
  try {
    const threadId = ctx?.params?.threadId;
    if (!threadId)
      return json(400, { ok: false, error: "threadId is required" });

    const supabase = await createClient();

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return json(401, { ok: false, error: authErr.message });
    if (!auth?.user) return json(401, { ok: false, error: "Unauthorized" });

    let body: any = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }

    const owner_user_id = (body?.owner_user_id ?? "").toString().trim();
    if (!owner_user_id)
      return json(400, { ok: false, error: "owner_user_id is required" });
    if (owner_user_id === auth.user.id) {
      return json(400, {
        ok: false,
        error: "owner_user_id cannot equal caller",
      });
    }

    const svc = createServiceClient();
    const { data: thread, error: threadErr } = await (svc.from("deal_threads") as any)
      .select("id, created_by_user_id, buyer_user_id, owner_user_id, status")
      .eq("id", threadId)
      .maybeSingle();

    if (threadErr)
      return json(400, { ok: false, where: "select_thread", ...diagErr(threadErr) });
    if (!thread)
      return json(404, { ok: false, where: "select_thread", error: "Thread not found" });

    const callerId = auth.user.id;
    const isBuyerOrCreator =
      thread.buyer_user_id === callerId ||
      thread.created_by_user_id === callerId;

    if (!isBuyerOrCreator)
      return json(403, {
        ok: false,
        where: "authz",
        error: "Forbidden",
        caller_user_id: callerId,
        thread_created_by_user_id: thread.created_by_user_id,
        thread_buyer_user_id: thread.buyer_user_id,
      });

    if (thread.owner_user_id && thread.owner_user_id !== owner_user_id) {
      return json(409, {
        ok: false,
        error: "owner_user_id already set to a different user",
        current_owner_user_id: thread.owner_user_id,
      });
    }

    if (!thread.owner_user_id) {
      const { error: updErr } = await (svc.from("deal_threads") as any)
        .update({ owner_user_id })
        .eq("id", threadId);

      if (updErr)
        return json(400, { ok: false, where: "update_thread_owner", ...diagErr(updErr) });
    }

    const { data: existingPart } = await (svc.from("deal_thread_participants") as any)
      .select("thread_id, user_id")
      .eq("thread_id", threadId)
      .eq("user_id", owner_user_id)
      .maybeSingle();

    let participant_created = false;

    if (!existingPart) {
      const { error: insErr } = await (svc.from("deal_thread_participants") as any)
        .insert({
          thread_id: threadId,
          user_id: owner_user_id,
          role: "owner",
          permission: "decide",
          status: "active",
        });

      if (insErr)
        return json(400, { ok: false, where: "insert_owner_participant", ...diagErr(insErr) });
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
      error: "Internal Server Error",
      detail: e?.message ?? String(e),
    });
  }
}
