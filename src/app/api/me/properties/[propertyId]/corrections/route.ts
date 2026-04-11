import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { CORRECTABLE_FIELDS } from "@/lib/property/photos";

export const runtime = "nodejs";

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

/** GET /api/me/properties/[propertyId]/corrections — list corrections for owner */
export async function GET(
  _req: Request,
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
    .select("id, owner_user_id, created_by_user_id")
    .eq("id", propertyId)
    .maybeSingle();

  if (!property) return jsonError("Not found", 404);

  const isOwner =
    property.owner_user_id === user.id ||
    property.created_by_user_id === user.id;
  if (!isOwner) return jsonError("Forbidden", 403);

  const { data: corrections, error } = await (
    svc.from("property_fact_corrections") as any
  )
    .select("*")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false });

  if (error) return jsonError("Failed to load corrections", 500);

  return NextResponse.json({ ok: true, corrections: corrections ?? [] });
}

/**
 * POST /api/me/properties/[propertyId]/corrections
 * Body: { field_key, owner_submitted_value }
 */
export async function POST(
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
    .select("id, status, owner_user_id, created_by_user_id")
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
  const { field_key, owner_submitted_value, canonical_value } = body;

  const fieldDef = CORRECTABLE_FIELDS.find((f) => f.key === field_key);
  if (!fieldDef) return jsonError(`Unknown field: ${field_key}`, 400);

  if (
    owner_submitted_value === undefined ||
    owner_submitted_value === null ||
    String(owner_submitted_value).trim() === ""
  ) {
    return jsonError("owner_submitted_value is required", 400);
  }

  const { data: existing } = await (
    svc.from("property_fact_corrections") as any
  )
    .select("id, review_status")
    .eq("property_id", propertyId)
    .eq("field_key", field_key)
    .in("review_status", ["pending", "approved"])
    .maybeSingle();

  if (existing) {
    return jsonError(
      `A correction for "${fieldDef.label}" is already ${existing.review_status}. Withdraw or wait for review before submitting again.`,
      409,
    );
  }

  const { data: inserted, error: insertErr } = await (
    svc.from("property_fact_corrections") as any
  )
    .insert({
      property_id: propertyId,
      submitted_by: user.id,
      field_key,
      display_label: fieldDef.label,
      canonical_value: canonical_value != null ? String(canonical_value) : null,
      owner_submitted_value: String(owner_submitted_value).trim(),
      review_status: "pending",
    })
    .select()
    .single();

  if (insertErr) {
    return jsonError("Failed to submit correction", 500);
  }

  await (svc.from("property_edit_audit") as any).insert({
    property_id: propertyId,
    actor: user.id,
    action_type: "correction_submitted",
    field_key,
    before_value: canonical_value != null ? String(canonical_value) : null,
    after_value: String(owner_submitted_value).trim(),
    correction_id: inserted.id,
  });

  return NextResponse.json({ ok: true, correction: inserted }, { status: 201 });
}
