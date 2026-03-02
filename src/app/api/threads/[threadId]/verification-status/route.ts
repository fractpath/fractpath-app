import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { threadId: string };

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(_req: Request, ctx: { params: Promise<Params> }) {
  const { threadId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) return jsonError(userErr.message, 401);
  if (!user) return jsonError("Unauthorized", 401);

  const { data: thread, error: threadErr } = await supabase
    .from("deal_threads")
    .select("id, property_id")
    .eq("id", threadId)
    .maybeSingle();

  if (threadErr) return jsonError(threadErr.message, 500);
  if (!thread) return jsonError("Thread not found", 404);

  const propertyId = (thread as any).property_id as string | null;
  if (!propertyId) {
    return NextResponse.json({
      property_id: null,
      property_status: null,
      ownership_status: null,
      claimed_by_user_id: null,
      accept_allowed: false,
      verify_url: null,
    });
  }

  const svc = createServiceClient();

  const { data: prop, error: propErr } = await (svc.from("properties") as any)
    .select("id, status, ownership_status, claimed_by_user_id")
    .eq("id", propertyId)
    .maybeSingle();

  if (propErr) return jsonError(propErr.message, 500);
  if (!prop) return jsonError("Property not found", 404);

  const property_status = prop.status as string | null;
  const ownership_status = prop.ownership_status as string | null;
  const claimed_by_user_id = prop.claimed_by_user_id as string | null;

  const accept_allowed = property_status === "verified";
  const verify_url = `/me/properties/${propertyId}`;

  return NextResponse.json({
    property_id: propertyId,
    property_status,
    ownership_status,
    claimed_by_user_id,
    accept_allowed,
    verify_url,
  });
}
