import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);

  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return jsonError(error.message, 500);

  return NextResponse.json({ ok: true, properties: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);

  const body = await req.json().catch(() => null);
  if (!body) return jsonError("Invalid JSON", 400);

  const address = String(body.address ?? "").trim();
  if (!address) return jsonError("Address is required", 422);

  const { data, error } = await supabase
    .from("properties")
    .insert({
      owner_user_id: user.id,
      address,
      status: "unverified",
      visibility: "private",
    })
    .select()
    .single();

  if (error) return jsonError(error.message, 500);

  return NextResponse.json({ ok: true, property: data }, { status: 201 });
}
