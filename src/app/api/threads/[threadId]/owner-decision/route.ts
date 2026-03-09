import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { threadId: string };

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

export async function POST(req: Request, ctx: { params: Promise<Params> }) {
  const { threadId } = await ctx.params;

  // 1) Auth (user-context, RLS enforced)
  const sb = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await sb.auth.getUser();

  if (userErr) return json(401, { ok: false, error: userErr.message });
  if (!user) return json(401, { ok: false, error: "Unauthorized" });

  // 2) Parse decision
  let decision: "accept" | "decline";
  try {
    const body = await req.json();
    decision = body?.decision;
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  if (decision !== "accept" && decision !== "decline") {
    return json(400, {
      ok: false,
      error: "decision must be 'accept' or 'decline'",
    });
  }

  // 3) Thread must be visible to caller (RLS gate)
  const { data: thread, error: threadErr } = await sb
    .from("deal_threads")
    .select("id, status, property_id")
    .eq("id", threadId)
    .maybeSingle();

  if (threadErr) return json(500, { ok: false, error: threadErr.message });
  if (!thread) return json(404, { ok: false, error: "Thread not found" });

  const currentStatus = String((thread as any).status ?? "");
  const propertyId = (thread as any).property_id as string | null;

  // 4) Owner check (RLS enforced)
  const { data: participant, error: pErr } = await sb
    .from("deal_thread_participants")
    .select("role")
    .eq("thread_id", threadId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (pErr) return json(500, { ok: false, error: pErr.message });

  const role = String((participant as any)?.role ?? "");
  if (role !== "owner") {
    return json(403, { ok: false, error: "Forbidden" });
  }

  // 5) Idempotent handling
  if (
    decision === "accept" &&
    (currentStatus === "accepted" || currentStatus === "active")
  ) {
    return json(200, { ok: true, thread_id: threadId, status: currentStatus });
  }
  if (decision === "decline" && currentStatus === "closed") {
    return json(200, { ok: true, thread_id: threadId, status: currentStatus });
  }

  // 6) Finalized handling (block non-idempotent transitions)
  const finalized = new Set(["active", "accepted", "closed"]);
  if (finalized.has(currentStatus)) {
    return json(409, {
      ok: false,
      error: "Thread already finalized",
      status: currentStatus,
    });
  }

  // 7) Verification gate: block accept if property is not verified
  if (decision === "accept") {
    if (!propertyId) {
      return json(409, {
        ok: false,
        error: "Property verification required to accept",
      });
    }

    const svc = createServiceClient();
    const { data: prop, error: propErr } = await svc
      .from("properties")
      .select("id, status")
      .eq("id", propertyId)
      .maybeSingle();

    if (propErr) return json(500, { ok: false, error: propErr.message });

    if (!prop || (prop as any).status !== "verified") {
      return json(409, {
        ok: false,
        error: "Property verification required to accept",
      });
    }
  }

  // 8) Apply transition (RLS enforced via user client)
  const nextStatus = decision === "accept" ? "accepted" : "closed";

  const { data: updated, error: updErr } = await sb
    .from("deal_threads")
    .update({ status: nextStatus, owner_user_id: user.id })
    .eq("id", threadId)
    .select("id, status")
    .maybeSingle();

  if (updErr) {
    // Could be RLS or invalid transition if you enforce via DB constraints
    return json(403, { ok: false, error: updErr.message });
  }
  if (!updated) {
    return json(403, { ok: false, error: "Forbidden or update failed" });
  }

  return json(200, {
    ok: true,
    thread_id: threadId,
    status: (updated as any).status,
  });
}
