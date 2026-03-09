import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ propertyId: string }> },
) {
  const supabase = await createClient();
  const { propertyId } = await ctx.params;

  // Auth
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) return json(401, { error: "Unauthorized" });
  const userId = auth?.user?.id;
  if (!userId) return json(401, { error: "Unauthorized" });

  if (!UUID_RE.test(propertyId)) {
    return json(422, { error: "propertyId must be a valid UUID" });
  }

  // Minimal thread list scoped to property
  // NOTE: We rely on RLS to restrict rows to authorized users (buyer/owner/participant).
  // We do not use service_role here.
  const { data: threads, error: tErr } = await supabase
    .from("deal_threads")
    .select(
      "id, property_id, status, created_at, updated_at, buyer_user_id, owner_user_id",
    )
    .eq("property_id", propertyId)
    .order("updated_at", { ascending: false });

  if (tErr) return json(500, { error: tErr.message });

  // Optional defense-in-depth filter:
  // If your deal_threads SELECT policy is broader than intended, this removes obvious non-matches.
  // If RLS is already strict (as you stated), this will be a no-op.
  const filtered = (threads ?? []).filter((t: any) => {
    return t.buyer_user_id === userId || t.owner_user_id === userId;
  });

  // If you expect participant-only access (non buyer/owner) later, remove the filter above.
  // For Sprint 12 current model (buyer+owner principals), this is safest.

  return json(200, { ok: true, property_id: propertyId, threads: filtered });
}
