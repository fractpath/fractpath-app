import { NextResponse } from "next/server";
import {
  createSupabaseRouteClient,
  getRequestOrigin,
} from "@/app/lib/supabaseRoute";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const origin = getRequestOrigin(req);

  const ct = req.headers.get("content-type") || "";

  let email = "";
  let password = "";

  if (ct.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as any;
    email = String(body?.email || "").trim();
    password = String(body?.password || "");
  } else {
    const form = await req.formData();
    email = String(form.get("email") || "").trim();
    password = String(form.get("password") || "");
  }

  if (!email || !password) {
    return NextResponse.redirect(new URL("/login?error=missing_fields", origin), {
      status: 303,
    });
  }

  // Default success redirect response; cookie writes will bind here.
  const res = NextResponse.redirect(new URL("/dashboard", origin), { status: 303 });

  let supabase;
  try {
    supabase = await createSupabaseRouteClient(req, res);
  } catch (e: any) {
    const msg = encodeURIComponent(e?.message || "server_misconfigured");
    return NextResponse.redirect(new URL(`/login?error=${msg}`, origin), {
      status: 303,
    });
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Keep it simple + safe: do not leak whether an account exists.
    return NextResponse.redirect(
      new URL("/login?error=invalid_credentials", origin),
      { status: 303 }
    );
  }

  return res;
}
