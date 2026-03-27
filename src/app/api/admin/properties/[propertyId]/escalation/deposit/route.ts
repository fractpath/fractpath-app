import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";

// TODO(stripe): Replace this simulation route with a real Stripe payment-intent
// creation and webhook handler. The `action` field maps to future Stripe events:
//   "request"   → create Stripe payment-intent, store PI id on property
//   "mark_paid" → driven by Stripe webhook (payment_intent.succeeded)
//   "fail"      → driven by Stripe webhook (payment_intent.payment_failed)
//   "reset"     → void / cancel PI and clear state

type DepositAction = "request" | "mark_paid" | "fail" | "reset";

const VALID_ACTIONS = new Set<DepositAction>(["request", "mark_paid", "fail", "reset"]);

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

  let body: { action?: string } = {};
  try {
    body = await req.json();
  } catch {
    return jsonError("Request body must be valid JSON", 400);
  }

  const action = body?.action as DepositAction | undefined;
  if (!action || !VALID_ACTIONS.has(action)) {
    return jsonError("Invalid action", 422, {
      received: action,
      allowed: [...VALID_ACTIONS],
    });
  }

  const svc = createServiceClient();

  // Fetch current deposit status so we can validate the transition.
  const { data: prop, error: fetchErr } = await (svc.from("properties") as any)
    .select("id, escalation_deposit_status")
    .eq("id", propertyId)
    .maybeSingle();

  if (fetchErr || !prop) {
    return jsonError("Property not found", 404, fetchErr ?? null);
  }

  const current: string | null = prop.escalation_deposit_status ?? null;

  let newStatus: string | null;
  switch (action) {
    case "request":
      if (current !== null) {
        return jsonError(`Cannot request deposit from state '${current}'`, 422);
      }
      newStatus = "requested";
      break;
    case "mark_paid":
      if (current !== "requested") {
        return jsonError(`Cannot mark paid from state '${current ?? "null"}'`, 422);
      }
      newStatus = "paid";
      break;
    case "fail":
      if (current !== "requested") {
        return jsonError(`Cannot mark failed from state '${current ?? "null"}'`, 422);
      }
      newStatus = "failed";
      break;
    case "reset":
      newStatus = null;
      break;
  }

  const { error: updateErr } = await (svc.from("properties") as any)
    .update({ escalation_deposit_status: newStatus })
    .eq("id", propertyId);

  if (updateErr) {
    console.error("ESCALATION_DEPOSIT_UPDATE_FAILED", { propertyId, action, updateErr });
    return jsonError("Failed to update deposit status", 500, updateErr);
  }

  return NextResponse.json(
    { ok: true, propertyId, escalation_deposit_status: newStatus },
    { status: 200 },
  );
}
