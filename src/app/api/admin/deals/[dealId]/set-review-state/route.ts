import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";
import {
  resolveWorkflowContacts,
  sendWorkflowEmail,
  dealActionUrl,
} from "@/lib/workflow/sendWorkflowEmail";
import {
  computeAvmEligibility,
  extractAvmDealTerms,
  HARD_BLOCKED_AVM_RESULTS,
  safeNum,
  DEFAULT_LTV_RATIO,
  type AvmEligibilityResult,
} from "@/lib/avmEligibility";

// Canonical deal review states owned by the deal surface.
// "ready_for_signatures" maps to "ready_for_deposit" in the DB because the
// CHECK constraint (chk_deal_triage_status) was written before the rename.
// The UI label and event type use "ready_for_signatures"; the persisted DB
// value stays "ready_for_deposit" to satisfy the constraint without a migration.
const STATE_TO_TRIAGE: Record<string, string> = {
  triage_in_progress: "triage_in_progress",
  ready_for_signatures: "ready_for_deposit",
  ineligible: "ineligible",
};

const STATE_TO_EVENT: Record<string, string> = {
  triage_in_progress: "DEAL_TRIAGE_RETURNED_TO_REVIEW",
  ready_for_signatures: "DEAL_TRIAGE_READY_FOR_SIGNATURES",
  ineligible: "DEAL_TRIAGE_INELIGIBLE",
};

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

function blockMessage(result: AvmEligibilityResult, deviationPct: number | null): string {
  switch (result) {
    case "blocked_pending_fmv":
      return "Transition blocked: no current verified AVM is on file for this property. Complete the AVM run first.";
    case "ineligible_ltv":
      return "Transition blocked: requested upfront cash exceeds maximum eligible cash under the LTV policy.";
    case "escalated_review_required":
      return `Transition blocked: AVM deviation (${deviationPct?.toFixed(1) ?? "?"}%) exceeds escalation threshold. Resolve via the stronger valuation pathway on the property review page.`;
    default:
      return "Transition blocked by AVM/LTV policy.";
  }
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

  // ── Server-side AVM/LTV gate for ready_for_signatures ────────────────────
  // Checks are independent of the client-supplied result so the route cannot be
  // bypassed by a crafted request. Uses the shared computeAvmEligibility helper.
  if (state === "ready_for_signatures") {
    // Layer 1: cheap early reject on client-reported hard-blocked result.
    if (
      avm_eligibility_result &&
      HARD_BLOCKED_AVM_RESULTS.has(avm_eligibility_result as AvmEligibilityResult)
    ) {
      return jsonError(
        `Transition blocked (client-reported AVM result: ${avm_eligibility_result}). Resolve AVM/LTV issues before advancing.`,
        422,
      );
    }

    // Layer 2: independent DB re-derivation using the shared policy helper.
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
        const proposalTerms = extractAvmDealTerms(proposalRes.data?.terms_snapshot);
        const ltvRatio = safeNum(property?.ltv_policy_ratio) ?? DEFAULT_LTV_RATIO;
        const securedDebt = property?.has_secured_property_debt
          ? (safeNum(property?.secured_property_debt_amount) ?? 0)
          : 0;

        const eligibility = computeAvmEligibility({
          verifiedFmv: safeNum(summary?.fmv_amount),
          fmvProvider: null,
          fmvFetchedAt: null,
          fmvExpiresAt: (summary?.fmv_expires_at as string | null) ?? null,
          proposedFmv: proposalTerms.property_value,
          securedDebt,
          ltvRatio,
          requestedCash: proposalTerms.upfront_payment,
        });

        if (HARD_BLOCKED_AVM_RESULTS.has(eligibility.result)) {
          return jsonError(blockMessage(eligibility.result, eligibility.deviationPct), 422);
        }

        // manual_review_required: allowed but only with a non-empty acknowledgment note.
        if (eligibility.result === "manual_review_required" && !note?.trim()) {
          return jsonError(
            "Acknowledgment note required: enter an admin note to proceed with manual AVM review.",
            422,
          );
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
    state === "ready_for_signatures" && avm_eligibility_result === "manual_review_required";

  const eventType = STATE_TO_EVENT[state];
  await (svc.from("deal_events") as any).insert({
    deal_id: dealId,
    event_type: eventType,
    payload: {
      set_by_admin: admin.user.id,
      note: note?.trim() || null,
      source: "admin_deal_review",
      ...(avm_eligibility_result ? { avm_eligibility_result } : {}),
      ...(isManualReviewAck
        ? { avm_acknowledgment: true, avm_acknowledgment_note: note?.trim() || null }
        : {}),
    },
    created_by: admin.user.id,
    created_at: now,
  });

  // ── Notify owner + buyer on ineligible transitions (non-blocking) ────────
  // Other state transitions (triage_in_progress, ready_for_signatures) are
  // admin-internal workflow changes; customers are not notified here.
  if (state === "ineligible") {
    void (async () => {
      try {
        const contacts = await resolveWorkflowContacts(svc, { dealId });

        if (contacts.owner) {
          const r = await sendWorkflowEmail({
            audience: "owner",
            eventKey: "DEAL_TERMS_INELIGIBLE_OWNER",
            to: contacts.owner.email,
            recipientName: contacts.owner.name,
            actionUrl: dealActionUrl(dealId),
            note: note?.trim() || null,
          });
          console.log("INELIGIBLE_OWNER_NOTIFICATION", {
            dealId,
            ok: r.ok,
            error: r.error ?? null,
          });
        }

        if (contacts.buyer) {
          const r = await sendWorkflowEmail({
            audience: "buyer",
            eventKey: "DEAL_TERMS_NO_LONGER_ELIGIBLE_BUYER",
            to: contacts.buyer.email,
            recipientName: contacts.buyer.name,
            actionUrl: dealActionUrl(dealId),
          });
          console.log("INELIGIBLE_BUYER_NOTIFICATION", {
            dealId,
            ok: r.ok,
            error: r.error ?? null,
          });
        }
      } catch (err) {
        console.error("INELIGIBLE_NOTIFICATION_ERROR", { dealId, err });
      }
    })();
  }

  return NextResponse.json({ ok: true, triage_status: STATE_TO_TRIAGE[state] });
}
