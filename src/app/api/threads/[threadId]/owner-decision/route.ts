import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

type Decision = "accept" | "decline";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function isEnumConstraintError(err: any) {
  const msg = String(err?.message || err || "");
  return (
    msg.includes("invalid input value for enum") ||
    msg.includes("violates check constraint") ||
    msg.includes("constraint") ||
    msg.includes("enum")
  );
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

  // Parse body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const decision: Decision | undefined = body?.decision;
  if (decision !== "accept" && decision !== "decline") {
    return json(400, {
      error: 'Body must be { decision: "accept" | "decline" }',
    });
  }

  // Load thread (need property_id for verification gate)
  const { data: thread, error: threadErr } = await supabase
    .from("deal_threads")
    .select("id, status, owner_user_id, property_id")
    .eq("id", threadId)
    .maybeSingle();

  if (threadErr) return json(500, { error: threadErr.message });
  if (!thread) return json(404, { error: "Thread not found" });

  // Authorization: owner_user_id match OR active participant role='owner'
  let isOwner = thread.owner_user_id === userId;

  if (!isOwner) {
    const { data: ownerParticipant, error: partErr } = await supabase
      .from("deal_thread_participants")
      .select("thread_id")
      .eq("thread_id", threadId)
      .eq("user_id", userId)
      .eq("role", "owner")
      .maybeSingle();

    if (partErr) return json(500, { error: partErr.message });
    isOwner = !!ownerParticipant;
  }

  if (!isOwner) {
    // Buyer/creator must not be able to call this
    return json(403, { error: "Forbidden" });
  }

  // Decide target status:
  // Prefer canonical "active"/"declined" if allowed by schema; if enum blocks it, fallback to "accepted"/"declined".
  const acceptCandidates = ["active", "accepted"] as const;
  const declineCandidates = ["declined"] as const;

  const desiredCandidates =
    decision === "accept" ? acceptCandidates : declineCandidates;

  // Idempotent handling:
  // If already in any of the target candidates, return 200.
  if (desiredCandidates.includes(thread.status as any)) {
    return json(200, { ok: true, thread_id: threadId, status: thread.status });
  }

  // If already finalized to the *other* outcome, return 200 with current status (do not flip).
  // (This keeps the endpoint idempotent and avoids status ping-pong.)
  const finalizedStatuses = new Set(["active", "accepted", "declined"]);
  if (finalizedStatuses.has(String(thread.status))) {
    return json(200, { ok: true, thread_id: threadId, status: thread.status });
  }

  // Verification gate: block accept if property is not verified
  if (decision === "accept") {
    const svc = createServiceClient();
    const { data: prop } = await (svc.from("properties") as any)
      .select("status")
      .eq("id", (thread as any).property_id)
      .maybeSingle();

    if (!prop || prop.status !== "verified") {
      return json(409, {
        ok: false,
        error: "Property verification required to accept",
      });
    }
  }

  // Try updates in order until one succeeds (handles enum/check constraints without schema changes)
  let lastErr: any = null;
  for (const targetStatus of desiredCandidates) {
    const { data: updated, error: updErr } = await supabase
      .from("deal_threads")
      .update({ status: targetStatus })
      .eq("id", threadId)
      .select("id, status")
      .maybeSingle();

    if (!updErr && updated) {
      return json(200, {
        ok: true,
        thread_id: threadId,
        status: updated.status,
      });
    }

    lastErr = updErr;

    // If it wasn't a constraint issue, don't keep trying candidates.
    if (!isEnumConstraintError(updErr)) break;
  }

  // If we got here, update failed.
  // Most likely: RLS policy doesn't allow owner to update status, or status value blocked by constraint.
  const msg =
    String(lastErr?.message || lastErr || "Update failed") || "Update failed";

  // If RLS blocks, Supabase often returns empty data w/ no explicit error in some cases;
  // but we still treat as forbidden if thread remains unchanged after attempted update.
  // (We can’t reliably re-read under RLS if SELECT is blocked; but you said owner can see thread via /api/me/threads.)
  return json(403, {
    error: "Forbidden or invalid status transition",
    detail: msg,
  });
}
