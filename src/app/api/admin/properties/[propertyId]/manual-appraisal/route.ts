import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";
import {
  resolveWorkflowContacts,
  sendWorkflowEmail,
  formatPropertyAddress,
  propertyActionUrl,
  dealActionUrl,
} from "@/lib/workflow/sendWorkflowEmail";

// TODO(manual-appraisal): Replace this simulation route with a real licensed appraiser
// order + result ingestion flow. The `action` field maps to future appraisal lifecycle events:
//   "initiate"           → homeowner confirms intent; admin schedules appraiser
//   "mark_payment_pending" → payment request sent to homeowner
//   "mark_in_progress"  → payment confirmed; appraiser working
//   "complete"          → appraisal result received; new FMV applied
//   "reset"             → cancel / clear simulation state

type AppraisalAction =
  | "initiate"
  | "mark_payment_pending"
  | "mark_in_progress"
  | "complete"
  | "reset";

const VALID_ACTIONS = new Set<AppraisalAction>([
  "initiate",
  "mark_payment_pending",
  "mark_in_progress",
  "complete",
  "reset",
]);

// Simulated manual appraisal result lives for 12 months.
const SIM_EXPIRY_MS = 365 * 24 * 60 * 60 * 1000;
const SIM_PROVIDER = "manual_appraisal_sim";

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

  const action = body?.action as AppraisalAction | undefined;
  if (!action || !VALID_ACTIONS.has(action)) {
    return jsonError("Invalid action", 422, {
      received: action,
      allowed: [...VALID_ACTIONS],
    });
  }

  const svc = createServiceClient();

  const { data: prop, error: fetchErr } = await (svc.from("properties") as any)
    .select("id, manual_appraisal_status, escalation_avm_status, address_line1, city, state, postal_code")
    .eq("id", propertyId)
    .maybeSingle();

  if (fetchErr || !prop) {
    return jsonError("Property not found", 404, fetchErr ?? null);
  }

  const current: string | null = prop.manual_appraisal_status ?? null;

  // State machine transitions
  switch (action) {
    case "initiate": {
      if (current !== null && current !== "complete") {
        return jsonError(`Cannot initiate from state '${current}'`, 422);
      }
      const { error: updateErr } = await (svc.from("properties") as any)
        .update({ manual_appraisal_status: "available" })
        .eq("id", propertyId);
      if (updateErr) {
        return jsonError("Failed to update manual appraisal status", 500, updateErr);
      }
      await logAudit(svc, propertyId, "Manual appraisal challenge initiated (sim)");
      return NextResponse.json({ ok: true, propertyId, manual_appraisal_status: "available" });
    }

    case "mark_payment_pending": {
      if (current !== "available") {
        return jsonError(`Cannot mark payment pending from state '${current ?? "null"}'`, 422);
      }
      const { error: updateErr } = await (svc.from("properties") as any)
        .update({ manual_appraisal_status: "payment_pending" })
        .eq("id", propertyId);
      if (updateErr) {
        return jsonError("Failed to update manual appraisal status", 500, updateErr);
      }
      await logAudit(svc, propertyId, "Manual appraisal payment pending (sim)");
      return NextResponse.json({ ok: true, propertyId, manual_appraisal_status: "payment_pending" });
    }

    case "mark_in_progress": {
      if (current !== "payment_pending") {
        return jsonError(`Cannot mark in-progress from state '${current ?? "null"}'`, 422);
      }
      const { error: updateErr } = await (svc.from("properties") as any)
        .update({ manual_appraisal_status: "in_progress" })
        .eq("id", propertyId);
      if (updateErr) {
        return jsonError("Failed to update manual appraisal status", 500, updateErr);
      }
      await logAudit(svc, propertyId, "Manual appraisal in progress (sim)");
      return NextResponse.json({ ok: true, propertyId, manual_appraisal_status: "in_progress" });
    }

    case "complete": {
      if (current !== "in_progress") {
        return jsonError(`Cannot complete from state '${current ?? "null"}'`, 422);
      }
      const rawFmv = body.fmv_amount;
      const fmvAmount =
        typeof rawFmv === "number" && isFinite(rawFmv) && rawFmv > 0 ? rawFmv : null;
      if (!fmvAmount) {
        return jsonError("fmv_amount must be a positive finite number", 422, { received: rawFmv });
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + SIM_EXPIRY_MS);

      // ── Upsert property_review_summary with new controlling FMV basis ──
      const { error: upsertBaseErr } = await (svc.from("property_review_summary") as any)
        .upsert({ property_id: propertyId }, { onConflict: "property_id" });
      if (upsertBaseErr) {
        console.error("MANUAL_APPRAISAL_SUMMARY_BASE_FAILED", { propertyId, upsertBaseErr });
        return jsonError("Failed to initialise property review summary", 500, upsertBaseErr);
      }

      // TODO(manual-appraisal): Replace SIM_PROVIDER with real licensed appraiser fields.
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
        console.error("MANUAL_APPRAISAL_SUMMARY_UPDATE_FAILED", { propertyId, summaryErr });
        return jsonError("Failed to update property review summary", 500, summaryErr);
      }

      // ── Mirror new controlling FMV basis onto properties ──
      const { error: propFmvErr } = await (svc.from("properties") as any)
        .update({
          latest_verified_fmv: fmvAmount,
          fmv_verified_at: now.toISOString(),
          fmv_verification_source: SIM_PROVIDER,
          manual_appraisal_status: "complete",
          manual_appraisal_fmv: fmvAmount,
        })
        .eq("id", propertyId);

      if (propFmvErr) {
        console.error("MANUAL_APPRAISAL_PROP_UPDATE_FAILED", { propertyId, propFmvErr });
        return jsonError("Failed to update property FMV fields", 500, propFmvErr);
      }

      // ── Preserve prior escalation AVM in audit trail ──
      await logAudit(
        svc,
        propertyId,
        `Manual appraisal challenge completed (sim). New controlling FMV basis: $${Math.round(fmvAmount).toLocaleString()}. Prior escalated AVM preserved in property_review_summary history. Admin should retriage linked deal.`,
      );

      // ── Notify owner + buyer (non-blocking) ──────────────────────────────
      void (async () => {
        try {
          const address = formatPropertyAddress(prop);
          const contacts = await resolveWorkflowContacts(svc, { propertyId });

          if (contacts.owner) {
            const r = await sendWorkflowEmail({
              audience: "owner",
              eventKey: "PROPERTY_MANUAL_REVIEW_COMPLETED",
              to: contacts.owner.email,
              recipientName: contacts.owner.name,
              propertyAddress: address,
              actionUrl: propertyActionUrl(propertyId),
            });
            console.log("MANUAL_APPRAISAL_OWNER_NOTIFICATION", {
              propertyId,
              ok: r.ok,
              error: r.error ?? null,
            });
          }

          if (contacts.buyer) {
            const r = await sendWorkflowEmail({
              audience: "buyer",
              eventKey: "DEAL_VERIFICATION_REVIEW_COMPLETED",
              to: contacts.buyer.email,
              recipientName: contacts.buyer.name,
              actionUrl: contacts.dealId ? dealActionUrl(contacts.dealId) : null,
            });
            console.log("MANUAL_APPRAISAL_BUYER_NOTIFICATION", {
              propertyId,
              ok: r.ok,
              error: r.error ?? null,
            });
          }
        } catch (err) {
          console.error("MANUAL_APPRAISAL_NOTIFICATION_ERROR", { propertyId, err });
        }
      })();

      return NextResponse.json(
        {
          ok: true,
          propertyId,
          manual_appraisal_status: "complete",
          applied_fmv: fmvAmount,
          fmv_provider: SIM_PROVIDER,
          fmv_expires_at: expiresAt.toISOString(),
          note: "Admin must retriage the linked deal to re-evaluate eligibility under the new FMV basis.",
        },
        { status: 200 },
      );
    }

    case "reset": {
      const { error: updateErr } = await (svc.from("properties") as any)
        .update({ manual_appraisal_status: null, manual_appraisal_fmv: null })
        .eq("id", propertyId);
      if (updateErr) {
        return jsonError("Failed to reset manual appraisal status", 500, updateErr);
      }
      await logAudit(svc, propertyId, "Manual appraisal challenge reset (sim)");
      return NextResponse.json({ ok: true, propertyId, manual_appraisal_status: null });
    }
  }
}

async function logAudit(svc: ReturnType<typeof createServiceClient>, propertyId: string, notes: string) {
  try {
    await (svc.from("property_status_audit") as any).insert({
      property_id: propertyId,
      from_status: null,
      to_status: null,
      actor_type: "admin",
      notes,
    });
  } catch (e) {
    console.error("MANUAL_APPRAISAL_AUDIT_LOG_FAILED", { propertyId, notes, e });
  }
}
