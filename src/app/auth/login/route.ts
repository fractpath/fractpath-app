import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";

function pickFirst(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v : "";
}

function sanitizeReturnTo(rt: string): string {
  // Same-origin only; allow absolute paths with query.
  // Examples: "/share?t=...", "/dashboard", "/deal/abc?mode=shared"
  if (typeof rt !== "string") return "/dashboard";
  if (!rt.startsWith("/")) return "/dashboard";
  if (rt.startsWith("//")) return "/dashboard";
  return rt;
}

function redirect303Relative(path: string) {
  // CRITICAL: Use a RELATIVE Location so we never jump to 0.0.0.0 / localhost.
  // Also 303 converts POST -> GET on the follow-up request.
  return new NextResponse(null, {
    status: 303,
    headers: { Location: path },
  });
}

export async function POST(req: Request) {
  const form = await req.formData();

  const email = pickFirst(form.get("email"));
  const password = pickFirst(form.get("password"));
  const returnTo = sanitizeReturnTo(pickFirst(form.get("returnTo")));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    const errPath = `/login?returnTo=${encodeURIComponent(returnTo)}&error=missing_supabase_env`;
    return redirect303Relative(errPath);
  }

  // Build the redirect response FIRST so cookies can be attached to it
  const res = redirect303Relative(returnTo);

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

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const errPath =
      `/login?returnTo=${encodeURIComponent(returnTo)}` +
      `&error=auth_failed&errorMessage=${encodeURIComponent(error.message)}`;
    return redirect303Relative(errPath);
  }

  return res;
}
