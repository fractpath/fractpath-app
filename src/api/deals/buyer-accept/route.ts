import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v || String(v).trim() === "") {
    throw new Error("Missing env var: " + name);
  }
  return v;
}

export async function POST(req: Request) {
  try {
    const body: any = await req.json();
    const deal_id = body?.deal_id;
    const actor_user_id = body?.actor_user_id;

    if (!deal_id || !actor_user_id) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: deal_id, actor_user_id" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    );

    const { data, error } = await supabase.rpc("buyer_accept_proposal", {
      p_deal_id: deal_id,
      p_actor_user_id: actor_user_id
    });

    if (error) {
      return NextResponse.json({ ok: false, error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
