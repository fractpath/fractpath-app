import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";

// TODO(attom): Replace this simulation route with a real ATTOM order + result ingestion flow.
// The `action` field maps to future ATTOM lifecycle events:
//   "order"    → POST to ATTOM API, store order-id on property; await webhook
//   "complete" → driven by ATTOM webhook (valuation result received)
//   "reset"    → cancel in-flight order and clear local state

type AvmAction = "order" | "complete" | "reset";

const VALID_ACTIONS = new Set<AvmAction>(["order", "complete", "reset"]);

// Simulated AVM result lives for 12 months.
const SIM_EXPIRY_MS = 365 * 24 * 60 * 60 * 1000;
const SIM_PROVIDER = "escalated_sim";

type Ctx = { params: Promise<{ propertyId: string }> };

function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ ok: false, error: message, details: details ?? null }, { status });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return jsonError(admin.error, admin.status, { email: admin.email });
  }

  const { propertyId } = await ctx.params;

  let body: { action?: string; fmv_amount?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return jsonError("Request body must be valid JSON", 400);
  }

  const action = body?.action as AvmAction | undefined;
  if (!action || !VALID_ACTIONS.has(action)) {
    return jsonError("Invalid action", 422, {
      received: action,
      allowed: [...VALID_ACTIONS],
    });
  }

  const svc = createServiceClient();

  const { data: prop, error: fetchErr } = await (svc.from("properties") as any)
    .select("id, escalation_deposit_status, escalation_avm_status")
    .eq("id", propertyId)
    .maybeSingle();

  if (fetchErr || !prop) {
    return jsonError("Property not found", 404, fetchErr ?? null);
  }

  const depositStatus: string | null = prop.escalation_deposit_status ?? null;
  const current: string | null = prop.escalation_avm_status ?? null;

  if (action !== "reset" && depositStatus !== "paid") {
    return jsonError("Deposit must be paid before ordering a stronger valuation", 422, {
      escalation_deposit_status: depositStatus,
    });
  }

  let newAvmStatus: string | null;
  switch (action) {
    case "order":
      if (current !== null) {
        return jsonError(`Cannot order from state '${current}'`, 422);
      }
      newAvmStatus = "ordered";
      break;
    case "complete": {
      if (current !== "ordered") {
        return jsonError(`Cannot complete from state '${current ?? "null"}'`, 422);
      }
      const rawFmv = body.fmv_amount;
      const fmvAmount = typeof rawFmv === "number" && isFinite(rawFmv) && rawFmv > 0 ? rawFmv : null;
      if (!fmvAmount) {
        return jsonError("fmv_amount must be a positive finite number", 422, { received: rawFmv });
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + SIM_EXPIRY_MS);

      // ── Update property_review_summary (drives AVM eligibility on property + deal pages) ──
      // Ensure base row exists first.
      const { error: upsertBaseErr } = await (svc.from("property_review_summary") as any)
        .upsert({ property_id: propertyId }, { onConflict: "property_id" });

      if (upsertBaseErr) {
        console.error("ESCALATION_AVM_SUMMARY_BASE_FAILED", { propertyId, upsertBaseErr });
        return jsonError("Failed to initialise property review summary", 500, upsertBaseErr);
      }

      // TODO(attom): Replace SIM_PROVIDER and the synthetic payload with real ATTOM fields.
      const { error: summaryErr } = await (svc.from("property_review_summary") as any)
        .update({
          fmv_provider: SIM_PROVIDER,
          fmv_amount: fmvAmount,
          fmv_low: null,
          fmv_high: null,
          fmv_confidence: "high",
          fmv_fetched_at: now.toISOString(),
          fmv_expires_at: expiresAt.toISOString(),
          review_status: "property_review_complete",
          review_status_updated_at: now.toISOString(),
        })
        .eq("property_id", propertyId);

      if (summaryErr) {
        console.error("ESCALATION_AVM_SUMMARY_UPDATE_FAILED", { propertyId, summaryErr });
        return jsonError("Failed to update property review summary", 500, summaryErr);
      }

      // ── Also mirror onto properties.latest_verified_fmv so that the
      //    "Verified FMV" field in the property overview reflects the new basis. ──
      const { error: propFmvErr } = await (svc.from("properties") as any)
        .update({
          latest_verified_fmv: fmvAmount,
          fmv_verified_at: now.toISOString(),
          fmv_verification_source: SIM_PROVIDER,
          escalation_avm_status: "completed",
        })
        .eq("id", propertyId);

      if (propFmvErr) {
        console.error("ESCALATION_AVM_PROP_UPDATE_FAILED", { propertyId, propFmvErr });
        return jsonError("Failed to update property FMV fields", 500, propFmvErr);
      }

      return NextResponse.json(
        {
          ok: true,
          propertyId,
          escalation_avm_status: "completed",
          applied_fmv: fmvAmount,
          fmv_provider: SIM_PROVIDER,
          fmv_expires_at: expiresAt.toISOString(),
        },
        { status: 200 },
      );
    }
    case "reset":
      newAvmStatus = null;
      break;
  }

  const { error: updateErr } = await (svc.from("properties") as any)
    .update({ escalation_avm_status: newAvmStatus })
    .eq("id", propertyId);

  if (updateErr) {
    console.error("ESCALATION_AVM_UPDATE_FAILED", { propertyId, action, updateErr });
    return jsonError("Failed to update AVM status", 500, updateErr);
  }

  return NextResponse.json(
    { ok: true, propertyId, escalation_avm_status: newAvmStatus },
    { status: 200 },
  );
}
