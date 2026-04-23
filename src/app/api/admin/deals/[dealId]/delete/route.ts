import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

/**
 * POST /api/admin/deals/[dealId]/delete
 *
 * Hard-deletes a safe orphan draft deal. Eligibility requires ALL:
 * - status = DRAFT (not ACCEPTED or any other terminal status)
 * - no threads with status = negotiating or accepted
 * - no proposals on any thread
 * - no signature packets
 *
 * Stale owner-created pending_buyer threads with no real buyer are not blocking
 * (they are legacy artifacts; the migration removes them before this route is used).
 *
 * On success, returns { ok: true, deleted: dealId }.
 */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ dealId: string }> },
) {
  const admin = await requireAdmin();
  if (!admin.ok) return json(403, { error: "Forbidden" });

  const { dealId } = await ctx.params;
  const svc = createServiceClient();

  const { data: deal, error: dealErr } = await (svc.from("deals") as any)
    .select("id, status, archived_at")
    .eq("id", dealId)
    .maybeSingle();

  if (dealErr || !deal) return json(404, { error: "Deal not found" });

  if ((deal as any).status !== "DRAFT") {
    return json(400, {
      error: `Only DRAFT deals can be admin-deleted. This deal has status '${(deal as any).status}'.`,
    });
  }

  if ((deal as any).archived_at) {
    return json(400, { error: "Archived deals cannot be deleted this way." });
  }

  // Block if any real active thread exists (stale visibility threads excluded by criteria)
  const { data: blockingThreads } = await (svc.from("deal_threads") as any)
    .select("id, status, buyer_user_id")
    .eq("deal_id", dealId)
    .in("status", ["negotiating", "accepted"]);

  if (blockingThreads && (blockingThreads as any[]).length > 0) {
    return json(400, {
      error:
        "Deal has active negotiating or accepted threads and cannot be hard-deleted. Use void/archive instead.",
    });
  }

  // Block if any thread carries real proposals (submitted or accepted)
  const { data: allThreads } = await (svc.from("deal_threads") as any)
    .select("id")
    .eq("deal_id", dealId);

  const threadIds: string[] = ((allThreads as any[]) ?? []).map((t: any) => t.id);

  if (threadIds.length > 0) {
    const { count: proposalCount } = await (svc.from("deal_proposals") as any)
      .select("id", { count: "exact", head: true })
      .in("thread_id", threadIds)
      .in("status", ["submitted", "accepted"]);

    if (proposalCount && proposalCount > 0) {
      return json(400, {
        error:
          "Deal has submitted or accepted proposals and cannot be hard-deleted. Use void/archive instead.",
      });
    }
  }

  // Block if any signature packet exists
  const { count: sigCount } = await (svc.from("deal_signature_packets") as any)
    .select("id", { count: "exact", head: true })
    .eq("deal_id", dealId);

  if (sigCount && sigCount > 0) {
    return json(400, {
      error: "Deal has signature packets and cannot be hard-deleted.",
    });
  }

  // Block if any append-only deal_events exist for this deal.
  // deal_events has an append-only trigger that unconditionally rejects deletes.
  // A draft with events is not a true orphan — block hard delete and direct admin to void instead.
  const { count: eventCount } = await (svc.from("deal_events") as any)
    .select("id", { count: "exact", head: true })
    .eq("deal_id", dealId);

  if (eventCount && eventCount > 0) {
    return json(409, {
      error:
        "This draft has audit history and cannot be permanently deleted. Void it instead.",
    });
  }

  // ── Safe to delete — cascade through dependents ──────────────────────────
  // deal_events is intentionally NOT deleted: either it has 0 rows (skip is safe)
  // or we already returned 409 above. Never attempt to delete from append-only tables.

  if (threadIds.length > 0) {
    await (svc.from("deal_proposals") as any).delete().in("thread_id", threadIds);
    await (svc.from("deal_thread_participants") as any).delete().in("thread_id", threadIds);
    await (svc.from("thread_invites") as any).delete().in("thread_id", threadIds);
    await (svc.from("thread_claim_dismissals") as any).delete().in("thread_id", threadIds);
    await (svc.from("deal_threads") as any).delete().eq("deal_id", dealId);
  }

  await (svc.from("deal_access_grants") as any).delete().eq("deal_id", dealId);
  await (svc.from("deal_snapshots") as any).delete().eq("deal_id", dealId);

  const { error: delErr } = await (svc.from("deals") as any).delete().eq("id", dealId);
  if (delErr) return json(500, { error: delErr.message });

  return json(200, { ok: true, deleted: dealId });
}
