import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  // NOTE: We cannot enforce "cannot archive if in active deal" yet because deals
  // do not reference properties via property_id. (See T0 discovery.)
  const { data, error } = await supabase
    .from("properties")
    .update({ status: "archived" })
    .eq("id", propertyId)
    .eq("owner_user_id", user.id)
    .select()
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("Not found", 404);

  return NextResponse.json({ ok: true, property: data });
}
