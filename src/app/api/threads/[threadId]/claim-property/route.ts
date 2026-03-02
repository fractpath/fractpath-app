import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

export async function POST(
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

  const svc = createServiceClient();

  // Load thread (service role avoids any RLS corner cases)
  const { data: thread, error: tErr } = await (svc.from("deal_threads") as any)
    .select("id, property_id, buyer_user_id, owner_user_id")
    .eq("id", threadId)
    .maybeSingle();

  if (tErr) return json(500, { error: tErr.message });
  if (!thread) return json(404, { error: "Thread not found" });

  // Only owner can claim; buyer cannot.
  if (thread.buyer_user_id === userId) {
    return json(403, { error: "Buyer cannot claim property" });
  }

  // Owner can claim if they are the thread owner_user_id OR they are an owner participant
  const isOwnerUserId = thread.owner_user_id === userId;

  let isOwnerParticipant = false;
  if (!isOwnerUserId) {
    const { data: p, error: pErr } = await (
      svc.from("deal_thread_participants") as any
    )
      .select("thread_id")
      .eq("thread_id", threadId)
      .eq("user_id", userId)
      .eq("role", "owner")
      .maybeSingle();

    if (pErr) return json(500, { error: pErr.message });
    isOwnerParticipant = !!p;
  }

  if (!isOwnerUserId && !isOwnerParticipant) {
    return json(403, { error: "Forbidden" });
  }

  const propertyId = thread.property_id as string;

  // Load property row; we will update whichever ownership column exists.
  // We DO NOT assume a specific schema; we update one of:
  // - claimed_by_user_id (preferred if present)
  // - user_id (common in verification pipelines)
  const { data: prop, error: pLoadErr } = await (svc.from("properties") as any)
    .select("*")
    .eq("id", propertyId)
    .maybeSingle();

  if (pLoadErr) return json(500, { error: pLoadErr.message });
  if (!prop) return json(404, { error: "Property not found" });

  const patch: Record<string, any> = {};

  // Set claimant on whichever column exists
  if ("claimed_by_user_id" in prop) patch.claimed_by_user_id = userId;
  else if ("user_id" in prop) patch.user_id = userId;

  // Optional: if you have an ownership_status column, set it to 'claimed'
  if ("ownership_status" in prop) patch.ownership_status = "claimed";

  // Do NOT change your verification status machine unless you explicitly want to.
  // If you *do* want a nudge into your existing pipeline, we can set status='unverified'
  // only when status is currently null — but we avoid inventing values.
  //
  // If you already have property verification statuses like 'unverified', keep them as-is.

  if (Object.keys(patch).length === 0) {
    return json(500, {
      error:
        "properties table missing both claimed_by_user_id and user_id; cannot claim without schema change",
    });
  }

  const { error: pUpdErr } = await (svc.from("properties") as any)
    .update(patch)
    .eq("id", propertyId);

  if (pUpdErr) return json(500, { error: pUpdErr.message });

  return json(200, {
    ok: true,
    thread_id: threadId,
    property_id: propertyId,
    claimed_by_user_id: userId,
  });
}
