import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

async function requireAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const role = user.user_metadata?.role ?? null;
  if (role !== "admin") return null;
  return user;
}

/** GET /api/admin/properties/[propertyId]/corrections — list all corrections */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ propertyId: string }> },
) {
  const { propertyId } = await ctx.params;

  const supabase = await createClient();
  const user = await requireAdmin(supabase);
  if (!user) return jsonError("Unauthorized", 401);

  const svc = createServiceClient();

  const { data: corrections, error } = await (
    svc.from("property_fact_corrections") as any
  )
    .select("*")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false });

  if (error) return jsonError("Failed to load corrections", 500);

  return NextResponse.json({ ok: true, corrections: corrections ?? [] });
}
