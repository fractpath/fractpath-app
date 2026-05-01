import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type Ctx = { params: Promise<{ dealId: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin();
  if (!admin.ok) return json(admin.status, { ok: false, error: admin.error });

  const { dealId } = await ctx.params;
  if (!dealId) return json(400, { ok: false, error: "Missing dealId" });

  let body: { reason?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Invalid request body" });
  }

  const reason = body.reason?.trim() ?? "";
  if (!reason) {
    return json(400, { ok: false, error: "A void reason is required" });
  }

  const svc = createServiceClient();

  // Fetch deal — verify it exists and isn't already voided
  const { data: deal, error: dealErr } = await (svc.from("deals") as any)
    .select("id, status, admin_voided_at")
    .eq("id", dealId)
    .maybeSingle();

  if (dealErr || !deal) {
    return json(404, { ok: false, error: "Deal not found" });
  }

  if (deal.admin_voided_at) {
    return json(409, { ok: false, error: "Deal is already voided" });
  }

  const now = new Date().toISOString();
  const priorDealStatus = deal.status as string;

  // ── 1. Stamp the deal as voided ─────────────────────────────────────────
  const { error: voidDealErr } = await (svc.from("deals") as any)
    .update({
      admin_voided_at: now,
      admin_voided_by: admin.user.id,
      admin_void_reason: reason,
    })
    .eq("id", dealId)
    .is("admin_voided_at", null);

  if (voidDealErr) {
    console.error("ADMIN_VOID_DEAL_UPDATE_FAILED", { dealId, error: voidDealErr });
    return json(500, { ok: false, error: `Failed to void deal: ${voidDealErr.message}` });
  }

  // ── 2. Collect all active threads for this deal ──────────────────────────
  const ACTIVE_THREAD_STATUSES = [
    "draft",
    "pending_owner",
    "pending_buyer",
    "negotiating",
    "decision_pending",
    "accepted",
  ];

  const { data: activeThreads } = await (svc.from("deal_threads") as any)
    .select("id, status")
    .eq("deal_id", dealId)
    .in("status", ACTIVE_THREAD_STATUSES);

  const threadIds: string[] = (activeThreads ?? []).map((t: any) => t.id as string);

  let priorThreadStatuses: Record<string, string> = {};
  for (const t of activeThreads ?? []) {
    priorThreadStatuses[t.id as string] = t.status as string;
  }

  // ── 3. Void all active threads ───────────────────────────────────────────
  if (threadIds.length > 0) {
    const { error: threadErr } = await (svc.from("deal_threads") as any)
      .update({ status: "voided_by_admin" })
      .in("id", threadIds)
      .in("status", ACTIVE_THREAD_STATUSES);

    if (threadErr) {
      console.error("ADMIN_VOID_THREAD_UPDATE_FAILED", { dealId, threadIds, error: threadErr });
      return json(500, {
        ok: false,
        error: `Voided deal but failed to update threads: ${threadErr.message}`,
      });
    }

    // ── 4. Withdraw open proposals on those threads ──────────────────────
    const { error: propErr } = await (svc.from("deal_proposals") as any)
      .update({ status: "withdrawn" })
      .in("thread_id", threadIds)
      .in("status", ["draft", "submitted"]);

    if (propErr) {
      console.error("ADMIN_VOID_PROPOSAL_UPDATE_FAILED", { dealId, threadIds, error: propErr });
    }

    // ── 5. Expire unused thread invites ──────────────────────────────────
    const { error: inviteErr } = await (svc.from("thread_invites") as any)
      .update({ declined_at: now })
      .in("thread_id", threadIds)
      .is("used_at", null)
      .is("declined_at", null);

    if (inviteErr) {
      console.error("ADMIN_VOID_INVITE_EXPIRE_FAILED", { dealId, threadIds, error: inviteErr });
    }
  }

  // ── 6. Insert audit event ────────────────────────────────────────────────
  const { error: evErr } = await (svc.from("deal_events") as any).insert({
    deal_id: dealId,
    event_type: "DEAL_VOIDED",
    payload: {
      reason,
      admin_user_id: admin.user.id,
      prior_deal_status: priorDealStatus,
      prior_thread_statuses: priorThreadStatuses,
      voided_thread_ids: threadIds,
    },
    created_by: admin.user.id,
  });

  if (evErr) {
    console.error("ADMIN_VOID_EVENT_INSERT_FAILED", { dealId, error: evErr });
  }

  return json(200, {
    ok: true,
    voided_at: now,
    voided_thread_count: threadIds.length,
  });
}
