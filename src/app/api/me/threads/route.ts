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

  console.log("[DEBUG /api/me/threads] user.id =", user.id);

  const { createServiceClient } = await import("@/lib/supabase/service");
  const svc = createServiceClient();
  const { data: allThreads } = await (svc.from("deal_threads") as any)
    .select("id, created_by_user_id, buyer_user_id, owner_user_id, status");
  console.log("[DEBUG /api/me/threads] all threads (svc):", JSON.stringify(allThreads));

  const { data: allParts } = await (svc.from("deal_thread_participants") as any)
    .select("thread_id, user_id, role, status");
  console.log("[DEBUG /api/me/threads] all participants (svc):", JSON.stringify(allParts));

  const { data, error } = await (supabase.from("deal_threads") as any)
    .select("id, property_id, status, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);

  console.log("[DEBUG /api/me/threads] RLS-filtered result:", JSON.stringify(data), "error:", error);

  if (error) {
    console.error("threads_list_error", error);
    return jsonError(error.message, 500);
  }

  return NextResponse.json({ ok: true, threads: data ?? [] });
}
