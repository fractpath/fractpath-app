export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) {
    return NextResponse.json({ error: userErr.message }, { status: 500 });
  }
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const grantsRes = await supabase
    .from("deal_access_grants")
    .select("deal_id, role, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const grants = grantsRes.data ?? [];
  const ownerDealIds = grants.filter((g) => g.role === "OWNER").map((g) => g.deal_id);

  const dealsRes =
    grants.length > 0
      ? await supabase.from("deals").select("id, created_at").in("id", grants.map((g) => g.deal_id))
      : { data: [], error: null as any };

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    grantsError: grantsRes.error?.message ?? null,
    dealsError: dealsRes.error?.message ?? null,
    grantCount: grants.length,
    ownerCount: ownerDealIds.length,
    grants: grants.slice(0, 25),
    deals: (dealsRes.data ?? []).slice(0, 25),
  });
}
