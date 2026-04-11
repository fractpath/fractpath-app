import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

const ALLOWED_VISIBILITY = ["private", "public"] as const;
const ALLOWED_PROPOSAL_STATUS = [
  "not_interested",
  "interested",
  "open",
] as const;

/**
 * PATCH /api/me/properties/[propertyId]/settings
 * Body: { visibility_preference?, proposal_interest_status? }
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ propertyId: string }> },
) {
  const { propertyId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);

  const svc = createServiceClient();

  const { data: property } = await (svc.from("properties") as any)
    .select(
      "id, status, owner_user_id, created_by_user_id, visibility_preference, proposal_interest_status",
    )
    .eq("id", propertyId)
    .maybeSingle();

  if (!property) return jsonError("Not found", 404);

  const isOwner =
    property.owner_user_id === user.id ||
    property.created_by_user_id === user.id;
  if (!isOwner) return jsonError("Forbidden", 403);

  if (property.status === "archived") {
    return jsonError("Archived properties cannot be modified.", 403);
  }

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  const auditFields: string[] = [];

  if (
    body.visibility_preference !== undefined &&
    ALLOWED_VISIBILITY.includes(body.visibility_preference)
  ) {
    updates.visibility_preference = body.visibility_preference;
    auditFields.push("visibility_preference");
  }

  if (
    body.proposal_interest_status !== undefined &&
    ALLOWED_PROPOSAL_STATUS.includes(body.proposal_interest_status)
  ) {
    updates.proposal_interest_status = body.proposal_interest_status;
    if (!updates.proposal_preferences_acknowledged_at) {
      updates.proposal_preferences_acknowledged_at = new Date().toISOString();
    }
    auditFields.push("proposal_interest_status");
  }

  if (auditFields.length === 0) {
    return jsonError("No valid fields provided", 400);
  }

  const { error } = await (svc.from("properties") as any)
    .update(updates)
    .eq("id", propertyId);

  if (error) return jsonError("Failed to update settings", 500);

  await (svc.from("property_edit_audit") as any).insert({
    property_id: propertyId,
    actor: user.id,
    action_type: "settings_updated",
    metadata: {
      fields: auditFields,
      before: {
        visibility_preference: property.visibility_preference,
        proposal_interest_status: property.proposal_interest_status,
      },
      after: updates,
    },
  });

  return NextResponse.json({ ok: true, updates });
}
