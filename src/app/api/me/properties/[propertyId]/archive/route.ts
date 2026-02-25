import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ propertyId: string }> },
) {
  const { propertyId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);
  if (!propertyId) return jsonError("Missing propertyId", 400);

  const { data: existing } = await supabase
    .from("properties")
    .select("id, status, owner_user_id")
    .eq("id", propertyId)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!existing) return jsonError("Not found", 404);

  if (existing.status !== "unverified" && existing.status !== "verified") {
    return jsonError(
      `Cannot archive from "${existing.status}". Only unverified or verified properties can be archived.`,
      409,
    );
  }

  const fromStatus = existing.status;
  const svc = createServiceClient();

  const { data, error } = await (svc
    .from("properties") as any)
    .update({ status: "archived" })
    .eq("id", propertyId)
    .eq("owner_user_id", user.id)
    .select("id, status")
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("Update failed", 500);

  await (svc.from("property_status_audit") as any).insert({
    property_id: propertyId,
    from_status: fromStatus,
    to_status: "archived",
    changed_by: user.id,
    notes: null,
    actor_type: "human",
  });

  return NextResponse.json({ ok: true, property: data });
}
