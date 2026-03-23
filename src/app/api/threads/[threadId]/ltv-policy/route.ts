import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { computeLtvPolicy } from "@/lib/ltvPolicy";

export const runtime = "nodejs";

type Params = { threadId: string };

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

// GET /api/threads/[threadId]/ltv-policy
// Returns LTV policy status for a thread.
// OWNER-SIDE ONLY — buyers are explicitly rejected at the first auth check.
// Buyers must NEVER see debt/LTV/underwriting reasons.
export async function GET(_req: Request, ctx: { params: Promise<Params> }) {
  const { threadId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return jsonError("Unauthorized", 401);

  const svc = createServiceClient();

  // Fetch thread with buyer_user_id so we can reject buyers immediately
  const { data: thread, error: threadErr } = await (
    svc.from("deal_threads") as any
  )
    .select(
      "id, property_id, deal_id, owner_user_id, buyer_user_id",
    )
    .eq("id", threadId)
    .maybeSingle();

  if (threadErr) return jsonError(threadErr.message, 500);
  if (!thread) return jsonError("Thread not found", 404);

  // Reject buyers immediately — no debt/LTV data must reach buyer-facing paths
  if (thread.buyer_user_id === user.id) {
    return jsonError("Forbidden", 403);
  }

  // Check owner-side access using the same precedence as owner-decision route:
  // 1) thread.owner_user_id
  // 2) property owner_user_id
  // 3) active thread_invite (intended_role = owner)
  let isOwnerSide = thread.owner_user_id === user.id;

  if (!isOwnerSide && thread.property_id) {
    const { data: propRow } = await (svc.from("properties") as any)
      .select("owner_user_id")
      .eq("id", thread.property_id)
      .maybeSingle();
    if (propRow?.owner_user_id === user.id) {
      isOwnerSide = true;
    }
  }

  if (!isOwnerSide && user.email) {
    const { data: invite } = await (svc.from("thread_invites") as any)
      .select("id, expires_at")
      .eq("thread_id", threadId)
      .eq("invitee_email", user.email.toLowerCase())
      .eq("intended_role", "owner")
      .limit(1)
      .maybeSingle();

    if (invite) {
      const notExpired =
        !invite.expires_at || new Date(invite.expires_at) > new Date();
      isOwnerSide = notExpired;
    }
  }

  if (!isOwnerSide) {
    return jsonError("Forbidden", 403);
  }

  // Load property underwriting data
  let propUnderwriting: any = null;
  if (thread.property_id) {
    const { data: pu } = await (svc.from("properties") as any)
      .select(
        "id, has_secured_property_debt, secured_property_debt_amount, " +
          "secured_debt_certified_at, secured_debt_last_verified_at, secured_debt_fresh_until, " +
          "secured_debt_verification_status, latest_verified_fmv, fmv_verified_at, " +
          "ltv_policy_ratio, max_accessible_cash_current, status",
      )
      .eq("id", thread.property_id)
      .maybeSingle();
    propUnderwriting = pu ?? null;
  }

  // Load deal terms: prefer active submitted proposal, fall back to latest snapshot
  let dealTerms: Record<string, unknown> | null = null;
  const dealId = thread.deal_id as string | null;

  if (dealId) {
    const { data: proposals } = await (svc.from("deal_proposals") as any)
      .select("terms_snapshot")
      .eq("thread_id", threadId)
      .in("status", ["submitted"])
      .order("created_at", { ascending: false })
      .limit(1);

    const activeProposal = (proposals ?? [])[0] ?? null;
    if (activeProposal?.terms_snapshot) {
      const ts = activeProposal.terms_snapshot;
      dealTerms = ts?.inputs?.deal_terms ?? ts?.deal_terms ?? null;
    }

    if (!dealTerms) {
      const { data: snap } = await (svc.from("deal_snapshots") as any)
        .select("snapshot_json")
        .eq("deal_id", dealId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (snap?.snapshot_json?.inputs?.deal_terms) {
        dealTerms = snap.snapshot_json.inputs.deal_terms;
      }
    }
  }

  const debtAmount =
    propUnderwriting?.has_secured_property_debt === true
      ? (propUnderwriting?.secured_property_debt_amount ?? 0)
      : 0;

  const ltvRatio = propUnderwriting?.ltv_policy_ratio ?? 0.75;

  const policy = computeLtvPolicy({
    proposed_deal_fmv:
      (dealTerms?.property_value as number | null) ?? null,
    upfront_payment:
      (dealTerms?.upfront_payment as number | null) ?? null,
    monthly_payment:
      (dealTerms?.monthly_payment as number | null) ?? null,
    number_of_payments:
      (dealTerms?.number_of_payments as number | null) ?? null,
    latest_verified_fmv: propUnderwriting?.latest_verified_fmv ?? null,
    secured_debt_amount: debtAmount,
    ltv_policy_ratio: ltvRatio,
    secured_debt_certified_at:
      propUnderwriting?.secured_debt_certified_at ?? null,
    secured_debt_last_verified_at:
      propUnderwriting?.secured_debt_last_verified_at ?? null,
    secured_debt_fresh_until:
      propUnderwriting?.secured_debt_fresh_until ?? null,
  });

  return NextResponse.json({
    ok: true,
    ...policy,
    // Owner-only supplemental context (never returned to buyers — endpoint is owner-only)
    latest_verified_fmv: propUnderwriting?.latest_verified_fmv ?? null,
    fmv_verified_at: propUnderwriting?.fmv_verified_at ?? null,
    secured_debt_amount: debtAmount,
    ltv_policy_ratio: ltvRatio,
    verify_url: "/me",
  });
}
