import { NextResponse } from "next/server";
import { createSupabaseRouteClient, getRequestOrigin } from "@/app/lib/supabaseRoute";

export async function POST(request: Request) {
  const origin = getRequestOrigin(request);
  const response = NextResponse.redirect(new URL("/login", origin), { status: 303 });

  let supabase;
  try {
    supabase = await createSupabaseRouteClient(request, response);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server misconfigured" }, { status: 500 });
  }

  const { error } = await supabase.auth.signOut();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return response;
}
