import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return jsonError("Unauthorized", 401);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  const propertyId = typeof body?.property_id === "string" ? body.property_id.trim() : "";
  if (!UUID_RE.test(propertyId)) {
    return jsonError("property_id must be a valid UUID", 422);
  }

  const svc = createServiceClient();

  const { data: thread, error: threadErr } = await (svc.from("deal_threads") as any)
    .insert({
      property_id: propertyId,
      created_by_user_id: user.id,
      buyer_user_id: user.id,
      status: "pending_owner",
    })
    .select("id")
    .single();

  if (threadErr) {
    console.error("thread_create_error", threadErr);
    return jsonError(threadErr.message, 500);
  }

  const { error: partErr } = await (svc.from("deal_thread_participants") as any)
    .insert({
      thread_id: thread.id,
      user_id: user.id,
      role: "buyer",
      permission: "propose",
      status: "active",
    });

  if (partErr) {
    console.error("thread_participant_error", partErr);
    await (svc.from("deal_threads") as any).delete().eq("id", thread.id);
    return jsonError(partErr.message, 500);
  }

  return NextResponse.json({ ok: true, thread_id: thread.id });
}
