import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ proposalId: string }> },
) {
  const supabase = await createClient();
  const { proposalId } = await ctx.params;

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) return json(401, { error: "Unauthorized" });
  const userId = auth?.user?.id;
  if (!userId) return json(401, { error: "Unauthorized" });

  const { data: proposal, error: propErr } = await supabase
    .from("deal_proposals")
    .select("id, thread_id, status, created_by_user_id")
    .eq("id", proposalId)
    .maybeSingle();

  if (propErr) return json(500, { error: propErr.message });
  if (!proposal) return json(404, { error: "Not found" });

  if ((proposal as any).created_by_user_id !== userId) {
    return json(403, { error: "Only creator may submit" });
  }

  if ((proposal as any).status !== "draft") {
    return json(400, { error: "Only draft may be submitted" });
  }

  // MVP: only one submitted proposal per thread at a time
  const { data: existing, error: exErr } = await supabase
    .from("deal_proposals")
    .select("id")
    .eq("thread_id", (proposal as any).thread_id)
    .eq("status", "submitted")
    .limit(1);

  if (exErr) return json(500, { error: exErr.message });
  if (existing && existing.length > 0) {
    return json(409, {
      error: "A submitted proposal already exists for this thread",
    });
  }

  const { data: updated, error: updErr } = await supabase
    .from("deal_proposals")
    .update({ status: "submitted" })
    .eq("id", proposalId)
    .select("*")
    .single();

  if (updErr) return json(500, { error: updErr.message });

  return json(200, { ok: true, proposal: updated });
}
