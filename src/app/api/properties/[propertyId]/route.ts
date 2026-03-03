import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ propertyId: string }> },
) {
  const supabase = await createClient();
  const { propertyId } = await ctx.params;

  if (!UUID_RE.test(propertyId)) return json(400, { error: "Invalid propertyId" });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json(401, { error: "Unauthorized" });

  const svc = createServiceClient();

  const { data: property, error } = await (svc.from("properties") as any)
    .select("id, owner_user_id, status, ownership_status, normalized_address, address_line1, city, state, postal_code")
    .eq("id", propertyId)
    .maybeSingle();

  if (error || !property) return json(404, { error: "Property not found" });

  return json(200, {
    ok: true,
    property: {
      id: property.id,
      status: property.status,
      owner_user_id: property.owner_user_id,
      ownership_status: property.ownership_status,
    },
  });
}
