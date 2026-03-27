import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";

const STATE_TO_TRIAGE: Record<string, string> = {
  triage_in_progress: "triage_in_progress",
  ready_for_deposit: "ready_for_deposit",
  ineligible: "ineligible",
};

const STATE_TO_EVENT: Record<string, string> = {
  triage_in_progress: "DEAL_TRIAGE_RETURNED_TO_REVIEW",
  ready_for_deposit: "DEAL_TRIAGE_READY_FOR_DEPOSIT",
  ineligible: "DEAL_TRIAGE_INELIGIBLE",
};

// Must stay in sync with page-level constants.
const DEVIATION_ESCALATION_THRESHOLD_PCT = 12.5;

// AVM/LTV result values that hard-block ready_for_deposit transitions.
const HARD_BLOCKED_AVM_RESULTS = new Set([
  "blocked_pending_fmv",
  "ineligible_ltv",
  "escalated_review_required",
]);

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

/** Safely extract a number from an unknown value. */
function safeNum(v: unknown): number | null {
  return typeof v === "number" && isFinite(v) ? v : null;
}

/** Extract deal_terms from a terms_snapshot. */
function extractDealTermsFromSnapshot(snapshot: unknown): {
  upfront_payment: number | null;
  property_value: number | null;
} {
  if (!snapshot || typeof snapshot !== "object") return { upfront_payment: null, property_value: null };
  const s = snapshot as Record<string, unknown>;
  const inputs = s.inputs as Record<string, unknown> | undefined;
  const dealTerms = (inputs?.deal_terms ?? s.deal_terms ?? {}) as Record<string, unknown>;
  return {
    upfront_payment: safeNum(dealTerms.upfront_payment),
    property_value: safeNum(dealTerms.property_value),
  };
}

type Ctx = { params: Promise<{ dealId: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin();
  if (!admin.ok) return jsonError(admin.error, admin.status);

  const { dealId } = await ctx.params;
  if (!dealId) return jsonError("Missing dealId", 400);

  let body: { state?: string; note?: string | null; avm_eligibility_result?: string | null } = {};
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const { state, note, avm_eligibility_result } = body;

  if (!state || !STATE_TO_TRIAGE[state]) {
    return jsonError(
      `Invalid state. Allowed: ${Object.keys(STATE_TO_TRIAGE).join(", ")}`,
      422,
    );
  }

  const svc = createServiceClient();

  // ── Server-side AVM/LTV gate for ready_for_deposit ───────────────────────
  // Hard blocks are enforced independently of the client-supplied result so the
  // route cannot be bypassed by a crafted request.
  if (state === "ready_for_deposit") {
    // First: reject if the client-supplied result is itself a hard-blocked value.
    // This gives an early, cheap rejection for known-bad payloads.
    if (avm_eligibility_result && HARD_BLOCKED_AVM_RESULTS.has(avm_eligibility_result)) {
      return jsonError(
        `Transition blocked (client-reported AVM result: ${avm_eligibility_result}). Resolve AVM/LTV issues before advancing.`,
        422,
      );
    }

    // Second: independently verify by re-deriving the critical inputs from the DB.
    try {
      const { data: thread } = await (svc.from("deal_threads") as any)
        .select(
          "id, property_id, properties(ltv_policy_ratio, has_secured_property_debt, secured_property_debt_amount)",
        )
        .eq("deal_id", dealId)
        .maybeSingle();

      const propertyId: string | null = thread?.property_id ?? null;
      const property: any = thread?.properties ?? null;

      if (propertyId) {
        const [summaryRes, proposalRes] = await Promise.all([
          (svc.from("property_review_summary") as any)
            .select("fmv_amount, fmv_expires_at")
            .eq("property_id", propertyId)
            .maybeSingle(),
          thread?.id
            ? (svc.from("deal_proposals") as any)
                .select("terms_snapshot")
                .eq("thread_id", thread.id)
                .in("status", ["submitted", "accepted"])
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        const summary: any = summaryRes.data ?? null;
        const verifiedFmv = safeNum(summary?.fmv_amount);
        const isFmvExpired = summary?.fmv_expires_at
          ? new Date(summary.fmv_expires_at) < new Date()
          : false;

        if (!verifiedFmv || isFmvExpired) {
          return jsonError(
            "Transition blocked: no current verified AVM is on file for this property. Complete the AVM run first.",
            422,
          );
        }

        const proposalTerms = extractDealTermsFromSnapshot(proposalRes.data?.terms_snapshot);
        const ltvRatio = safeNum(property?.ltv_policy_ratio) ?? 0.75;
        const securedDebt = property?.has_secured_property_debt
          ? (safeNum(property?.secured_property_debt_amount) ?? 0)
          : 0;
        const maxEligibleCash = Math.max(0, verifiedFmv * ltvRatio - securedDebt);

        if (
          proposalTerms.upfront_payment !== null &&
          proposalTerms.upfront_payment > maxEligibleCash
        ) {
          return jsonError(
            "Transition blocked: requested upfront cash exceeds maximum eligible cash under the LTV policy.",
            422,
          );
        }

        if (proposalTerms.property_value !== null) {
          const deviationPct =
            (Math.abs(proposalTerms.property_value - verifiedFmv) / verifiedFmv) * 100;
          if (deviationPct >= DEVIATION_ESCALATION_THRESHOLD_PCT) {
            return jsonError(
              `Transition blocked: AVM deviation (${deviationPct.toFixed(1)}%) exceeds escalation threshold. Escalated review required before advancing.`,
              422,
            );
          }
        }
      }
    } catch (gateErr) {
      console.error("ADMIN_AVM_GATE_CHECK_FAILED", { dealId, error: gateErr });
      return jsonError("AVM/LTV gate check failed. Cannot advance deal without verified AVM data.", 500);
    }
  }

  const now = new Date().toISOString();

  const { error: updateErr } = await (svc.from("deals") as any)
    .update({ triage_status: STATE_TO_TRIAGE[state] })
    .eq("id", dealId);

  if (updateErr) {
    console.error("ADMIN_SET_DEAL_REVIEW_STATE_FAILED", { dealId, state, error: updateErr });
    return jsonError("Failed to update deal review state", 500);
  }

  // Build event payload — include AVM/LTV audit context when present.
  const isManualReviewAck =
    state === "ready_for_deposit" && avm_eligibility_result === "manual_review_required";

  const eventType = STATE_TO_EVENT[state];
  await (svc.from("deal_events") as any).insert({
    deal_id: dealId,
    event_type: eventType,
    payload: {
      set_by_admin: admin.user.id,
      note: note?.trim() || null,
      source: "admin_deal_review",
      ...(avm_eligibility_result
        ? { avm_eligibility_result }
        : {}),
      ...(isManualReviewAck
        ? {
            avm_acknowledgment: true,
            avm_acknowledgment_note: note?.trim() || null,
          }
        : {}),
    },
    created_by: admin.user.id,
    created_at: now,
  });

  return NextResponse.json({ ok: true, triage_status: STATE_TO_TRIAGE[state] });
}
