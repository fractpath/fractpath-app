// src/app/lib/supabaseRoute.ts
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import type { NextResponse } from "next/server";

/**
 * External origin helper (Replit/proxy-safe).
 * Prefers x-forwarded-* headers so we generate URLs on the same host the browser is using.
 */
export function getRequestOrigin(req: Request): string {
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host =
    req.headers.get("x-forwarded-host") ||
    req.headers.get("host") ||
    "localhost:5000";
  return `${proto}://${host}`;
}

/**
 * Fallback for contexts where you don't have a Request object.
 * Avoid relying on NEXT_PUBLIC_SITE_URL for browser redirects in dev; it can poison origin on Replit.
 */
export function getSiteOrigin(req?: Request): string {
  if (req) return getRequestOrigin(req);
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    "http://localhost:5000"
  );
}

export function absUrl(path: string, req?: Request): string {
  const origin = getSiteOrigin(req);
  if (!path.startsWith("/"))
    throw new Error(`absUrl path must start with "/": ${path}`);
  return new URL(path, origin).toString();
}

/**
 * Route-handler Supabase client that reads cookies from the incoming Request
 * and writes cookies onto the provided NextResponse.
 *
 * Usage:
 *   const res = NextResponse.redirect(..., { status: 303 })
 *   const supabase = await createSupabaseRouteClient(req, res)
 */
export async function createSupabaseRouteClient(
  req: Request,
  res: NextResponse,
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return (
          req.headers
            .get("cookie")
            ?.split(";")
            .map((c) => c.trim())
            .find((c) => c.startsWith(`${name}=`))
            ?.split("=")
            .slice(1)
            .join("=") ?? undefined
        );
      },
      set(name: string, value: string, options: CookieOptions) {
        res.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        res.cookies.set({ name, value: "", ...options, maxAge: 0 });
      },
    },
  });

  return supabase;
}
