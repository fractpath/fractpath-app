import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return jsonError("Unauthorized", 401);

  const { data, error } = await (supabase.from("deal_threads") as any)
    .select("id, property_id, status, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("threads_list_error", error);
    return jsonError(error.message, 500);
  }

  return NextResponse.json({ ok: true, threads: data ?? [] });
}
