import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Prefer a single canonical site origin (NEXT_PUBLIC_SITE_URL) so auth redirects
 * don't accidentally point to localhost or preview hosts.
 */
export function getRequestOrigin(req: Request): string {
  const configured = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    ""
  ).trim();

  if (configured) {
    // normalize: strip trailing slashes
    return configured.replace(/\/+$/, "");
  }

  // Fallback to request headers (useful for local dev if env not set)
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") || "http";
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  return `${proto}://${host}`;
}

// Minimal cookie getter for route handlers using request headers.
function getCookieFromHeader(req: Request, name: string): string | undefined {
  const raw = req.headers.get("cookie") || "";
  // Basic parse, ok for Supabase cookies.
  const parts = raw.split(/;\s*/g);
  for (const p of parts) {
    if (p.startsWith(name + "=")) return p.slice(name.length + 1);
  }
  return undefined;
}

export async function createSupabaseRouteClient(
  request: Request,
  response: NextResponse,
) {
  // Required in this Next.js environment to avoid Promise cookies() behavior.
  await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return getCookieFromHeader(request, name);
      },
      set(name: string, value: string, options: any) {
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: any) {
        response.cookies.set({ name, value: "", ...options, maxAge: 0 });
      },
    },
  });
}
