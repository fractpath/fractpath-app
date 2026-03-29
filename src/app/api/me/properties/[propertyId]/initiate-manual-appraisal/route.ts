import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

type Ctx = { params: Promise<{ propertyId: string }> };

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { propertyId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return jsonError("Unauthorized", 401);

  const svc = createServiceClient();

  // Verify user owns this property
  const { data: property } = await (svc.from("properties") as any)
    .select("id, owner_user_id, escalation_avm_status, manual_appraisal_status")
    .eq("id", propertyId)
    .maybeSingle();

  if (!property) return jsonError("Property not found", 404);
  if (property.owner_user_id !== user.id) {
    return jsonError("You do not own this property", 403);
  }

  // Only allow initiation when ATTOM AVM is complete
  if (property.escalation_avm_status !== "completed") {
    return jsonError(
      "Manual appraisal can only be initiated after the enhanced valuation (ATTOM) is complete",
      422,
    );
  }

  // Idempotency — already initiated
  if (property.manual_appraisal_status !== null) {
    return NextResponse.json({
      ok: true,
      propertyId,
      alreadyInitiated: true,
      status: property.manual_appraisal_status,
    });
  }

  // Set manual_appraisal_status to 'available' (signals owner intent to admin)
  const { error: updateErr } = await (svc.from("properties") as any)
    .update({ manual_appraisal_status: "available" })
    .eq("id", propertyId);

  if (updateErr) {
    console.error("INITIATE_MANUAL_APPRAISAL_UPDATE_FAILED", { propertyId, updateErr });
    return jsonError("Failed to initiate manual appraisal", 500);
  }

  // Log to property_status_audit
  const { error: auditErr } = await (svc.from("property_status_audit") as any).insert({
    property_id: propertyId,
    from_status: property.manual_appraisal_status,
    to_status: "manual_appraisal_available",
    changed_by: user.id,
    actor_type: "owner",
    notes: "Owner initiated manual appraisal challenge via property page.",
  });

  if (auditErr) {
    console.error("INITIATE_MANUAL_APPRAISAL_AUDIT_FAILED", { propertyId, auditErr });
    // Non-fatal
  }

  return NextResponse.json({
    ok: true,
    propertyId,
    alreadyInitiated: false,
    status: "available",
  });
}
