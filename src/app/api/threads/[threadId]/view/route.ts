import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

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

  const svc = createServiceClient();

  const { data: thread, error: threadErr } = await (svc.from("deal_threads") as any)
    .select(
      "id, property_id, status, created_at, updated_at, created_by_user_id, buyer_user_id, owner_user_id",
    )
    .eq("id", threadId)
    .maybeSingle();

  if (threadErr) return json(500, { error: threadErr.message });
  if (!thread) return json(404, { error: "Thread not found" });

  const isThreadOwner = (thread as any).owner_user_id === userId;
  const isBuyer = (thread as any).buyer_user_id === userId;

  let isPropertyOwner = false;
  if (!isThreadOwner && !isBuyer && (thread as any).property_id) {
    const { data: prop } = await (svc.from("properties") as any)
      .select("owner_user_id")
      .eq("id", (thread as any).property_id)
      .maybeSingle();
    isPropertyOwner = !!prop?.owner_user_id && prop.owner_user_id === userId;
  }

  let isParticipant = false;
  if (!isThreadOwner && !isPropertyOwner && !isBuyer) {
    const { data: p, error: pErr } = await (svc.from("deal_thread_participants") as any)
      .select("thread_id")
      .eq("thread_id", threadId)
      .eq("user_id", userId)
      .maybeSingle();

    if (pErr) return json(500, { error: pErr.message });
    isParticipant = !!p;
  }

  if (!isThreadOwner && !isPropertyOwner && !isBuyer && !isParticipant) {
    return json(403, { error: "Forbidden" });
  }

  const { data: participants, error: partsErr } = await (svc.from("deal_thread_participants") as any)
    .select("user_id, role, permission, status, created_at")
    .eq("thread_id", threadId);

  if (partsErr) {
    const msg = String(partsErr.message || "");
    if (msg.includes("created_at")) {
      const { data: participants2, error: partsErr2 } = await (svc.from("deal_thread_participants") as any)
        .select("user_id, role, permission, status")
        .eq("thread_id", threadId);

      if (partsErr2) return json(500, { error: partsErr2.message });

      return json(200, {
        ok: true,
        thread,
        participants: participants2 ?? [],
        is_property_owner: isPropertyOwner,
      });
    }

    return json(500, { error: partsErr.message });
  }

  return json(200, {
    ok: true,
    thread,
    participants: participants ?? [],
    is_property_owner: isPropertyOwner,
  });
}
