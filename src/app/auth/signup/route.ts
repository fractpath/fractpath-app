import { NextResponse } from "next/server";
import { getRequestOrigin } from "@/app/lib/supabaseRoute";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const WINDOW_SEC = 60;
const throttle = new Map<string, number>();

const VALID_PERSONAS = ["homeowner", "buyer", "realtor"] as const;
type Persona = (typeof VALID_PERSONAS)[number];

function isValidPersona(p: string | null): p is Persona {
  return p !== null && VALID_PERSONAS.includes(p as Persona);
}

function clientIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xrip = req.headers.get("x-real-ip");
  return xrip ? xrip.trim() : "unknown";
}

function throttleKey(req: Request, email: string) {
  return "ip=" + clientIp(req) + "|email=" + email.toLowerCase();
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

export const dynamic = "force-dynamic";
export const revalidate = 0;

const execFileAsync = promisify(execFile);
const SIGNUP_HARD_TIMEOUT_MS = 20000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(label)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function abs(req: Request, pathAndQuery: string) {
  // ✅ Correct on Replit + prod: external origin from forwarded headers
  const origin = getRequestOrigin(req);
  return new URL(pathAndQuery, origin);
}

export async function POST(req: Request) {
  const form = await req.formData();
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");
  const personaRaw = String(form.get("persona") || "").toLowerCase();
  const persona = isValidPersona(personaRaw) ? personaRaw : null;

  if (!email || !password) {
    return NextResponse.redirect(abs(req, "/signup?error=missing_fields"), 303);
  }

  if (!persona) {
    return NextResponse.redirect(abs(req, "/signup?error=please_select_role"), 303);
  }

  const tk = throttleKey(req, email);
  const th = checkThrottle(tk, WINDOW_SEC);
  if (!th.ok) {
    return NextResponse.redirect(
      abs(
        req,
        "/verify-email?status=throttled&email=" + encodeURIComponent(email) + "&retry_in=" + String(th.retryInSec)
      ),
      303
    );
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

  if (!supabaseUrl || !anonKey) {
    return NextResponse.redirect(
      abs(req, "/verify-email?status=error&msg=missing_supabase_env"),
      303
    );
  }

  const origin = getRequestOrigin(req);
  const base = supabaseUrl.replace(/\/+$/, "");
  const redirectTo = origin + "/auth/callback";
  const endpoint =
    base + "/auth/v1/signup?redirect_to=" + encodeURIComponent(redirectTo);

  const payload = JSON.stringify({
    email,
    password,
    options: {
      data: {
        role: persona,
        source: "marketing",
      },
    },
  });

  try {
    const { stdout } = await withTimeout(execFileAsync("curl", [
      "-sS",
      "--http1.1",
      "-4",
      "--connect-timeout",
      "5",
      "--max-time",
      "8",
      "--retry",
      "1",
      "--retry-all-errors",
      "--retry-max-time",
      "10",
      "-X",
      "POST",
      endpoint,
      "-H",
      "Content-Type: application/json",
      "-H",
      `apikey: ${anonKey}`,
      "-H",
      `Authorization: Bearer ${anonKey}`,
      "-H",
      "Expect:",
      "--data",
      payload,
    ]), SIGNUP_HARD_TIMEOUT_MS, "signup_hard_timeout");

    let msg: string | null = null;
    try {
      const j: any = JSON.parse(stdout || "{}");
      msg =
        j?.msg ||
        j?.message ||
        j?.error_description ||
        (typeof j?.error === "string" ? j.error : null);
    } catch {}

    if (msg) {
      return NextResponse.redirect(
        abs(req, "/verify-email?status=error&msg=" + encodeURIComponent(msg)),
        303
      );
    }

    return NextResponse.redirect(abs(req, "/verify-email?status=sent"), 303);
  } catch (e: any) {
    const msg = String(e?.message || "");
    const reason = encodeURIComponent(msg.includes("(28)") ? "signup_curl_timeout" : "signup_curl_failed");
    return NextResponse.redirect(
      abs(req, "/verify-email?status=timeout&reason=" + reason),
      303
    );
  }
}
