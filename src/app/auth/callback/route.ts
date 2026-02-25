import { NextResponse } from "next/server";
import {
  createSupabaseRouteClient,
  getRequestOrigin,
} from "@/app/lib/supabaseRoute";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function abs(origin: string, pathAndQuery: string) {
  const u = new URL(origin);
  const parts = pathAndQuery.split("?");
  u.pathname = parts[0] || "/";
  u.search = parts.length > 1 ? "?" + parts.slice(1).join("?") : "";
  return u;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const err = requestUrl.searchParams.get("error");
  const errDesc = requestUrl.searchParams.get("error_description");

  // Optional return target (defaults to dashboard)
  const next = requestUrl.searchParams.get("next") || "/dashboard";

  const origin = getRequestOrigin(request);

  if (err) {
    const msg = encodeURIComponent(errDesc || err);
    return NextResponse.redirect(
      abs(origin, "/login?error=oauth_error&msg=" + msg),
      303,
    );
  }

  if (!code) {
    return NextResponse.redirect(abs(origin, "/login?error=missing_code"), 303);
  }

  const response = NextResponse.redirect(abs(origin, next), 303);

  let supabase;
  try {
    supabase = await createSupabaseRouteClient(request, response);
  } catch {
    return NextResponse.redirect(
      abs(origin, "/login?error=server_misconfigured"),
      303,
    );
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(abs(origin, "/login?error=auth_failed"), 303);
  }

  return response;
}
