import { NextResponse } from "next/server";
import {
  createSupabaseRouteClient,
  getRequestOrigin,
} from "@/app/lib/supabaseRoute";

export const dynamic = "force-dynamic";

function sanitizeReturnTo(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;

  // Only allow relative paths to prevent open redirect.
  // Must start with "/" and must NOT start with "//".
  if (!s.startsWith("/") || s.startsWith("//")) return null;

  // Optional: basic length guard
  if (s.length > 2048) return null;

  return s;
}

export async function POST(req: Request) {
  const origin = getRequestOrigin(req);

  const ct = req.headers.get("content-type") || "";

  let email = "";
  let password = "";
  let returnToRaw: unknown = null;

  if (ct.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as any;
    email = String(body?.email || "").trim();
    password = String(body?.password || "");
    returnToRaw = body?.returnTo ?? null;
  } else {
    const form = await req.formData();
    email = String(form.get("email") || "").trim();
    password = String(form.get("password") || "");
    returnToRaw = form.get("returnTo");
  }

  const returnTo = sanitizeReturnTo(returnToRaw);

  if (!email || !password) {
    const url = new URL("/login?error=missing_fields", origin);
    if (returnTo) url.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(url, { status: 303 });
  }

  // Default success redirect is dashboard, unless returnTo is present.
  const successPath = returnTo || "/dashboard";
  const res = NextResponse.redirect(new URL(successPath, origin), { status: 303 });

  let supabase;
  try {
    supabase = await createSupabaseRouteClient(req, res);
  } catch (e: any) {
    const msg = encodeURIComponent(e?.message || "server_misconfigured");
    const url = new URL(`/login?error=${msg}`, origin);
    if (returnTo) url.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(url, { status: 303 });
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Keep it simple + safe: do not leak whether an account exists.
    const url = new URL("/login?error=invalid_credentials", origin);
    if (returnTo) url.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(url, { status: 303 });
  }

  return res;
}
