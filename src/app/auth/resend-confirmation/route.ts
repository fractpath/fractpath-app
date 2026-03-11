import { NextResponse } from "next/server";
import {
  createSupabaseRouteClient,
  getRequestOrigin,
} from "@/app/lib/supabaseRoute";
import { getAppBaseUrlServer } from "@/lib/appBaseUrl";

export const dynamic = "force-dynamic";

const WINDOW_SEC = 60;
const throttle = new Map<string, number>();

function abs(req: Request, pathAndQuery: string) {
  const origin = getRequestOrigin(req);
  return new URL(pathAndQuery, origin);
}

function clientIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xrip = req.headers.get("x-real-ip");
  return xrip ? xrip.trim() : "unknown";
}

function throttleKey(req: Request, email: string) {
  return `ip=${clientIp(req)}|email=${email.toLowerCase()}`;
}

function checkThrottle(key: string, windowSec: number) {
  const now = Date.now();
  const until = throttle.get(key) || 0;
  if (until > now)
    return {
      ok: false as const,
      retryInSec: Math.ceil((until - now) / 1000),
    };
  throttle.set(key, now + windowSec * 1000);
  return { ok: true as const };
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const email = String(formData.get("email") || "").trim();
  const returnTo = String(formData.get("returnTo") || "").trim();

  if (!email) {
    return NextResponse.redirect(
      abs(req, "/verify-email?status=error&error=missing_email"),
      { status: 303 },
    );
  }

  const tk = throttleKey(req, email);
  const th = checkThrottle(tk, WINDOW_SEC);
  if (!th.ok) {
    return NextResponse.redirect(
      abs(
        req,
        `/verify-email?status=throttled&email=${encodeURIComponent(
          email,
        )}&retry_in=${th.retryInSec}${
          returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ""
        }`,
      ),
      { status: 303 },
    );
  }

  const res = NextResponse.redirect(
    abs(
      req,
      `/verify-email?status=resent&email=${encodeURIComponent(email)}${
        returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ""
      }`,
    ),
    { status: 303 },
  );

  const supabase = await createSupabaseRouteClient(req, res);
  const emailOrigin = getAppBaseUrlServer();
  const emailRedirectTo =
    returnTo && returnTo.startsWith("/")
      ? `${emailOrigin}/auth/finish?next=${encodeURIComponent(returnTo)}`
      : undefined;

  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: emailRedirectTo ? { emailRedirectTo } : undefined,
  });

  if (error) {
    const msg = encodeURIComponent(error.message || "resend_failed");
    return NextResponse.redirect(
      abs(
        req,
        `/verify-email?status=error&email=${encodeURIComponent(
          email,
        )}&error=${msg}${
          returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ""
        }`,
      ),
      { status: 303 },
    );
  }

  return res;
}
