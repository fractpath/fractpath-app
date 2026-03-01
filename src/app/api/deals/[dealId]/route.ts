import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ dealId: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) return jsonError("Auth error", 401);
  if (!user) return jsonError("Unauthorized", 401);

  const { dealId } = await context.params;

  const { data: deal, error: fetchError } = await supabase
    .from("deals")
    .select("id, status, accepted_at, executed_at, funded_at, closed_at")
    .eq("id", dealId)
    .maybeSingle();

  if (fetchError) {
    console.error("deal_get_error", fetchError.message);
    return jsonError("Failed to fetch deal", 500);
  }

  if (!deal) return jsonError("Deal not found", 404);

  return NextResponse.json(deal);
}
