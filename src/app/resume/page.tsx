"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type RedeemState =
  | { status: "loading" }
  | { status: "no-token" }
  | { status: "redirecting-login" }
  | { status: "redirecting-signup" }
  | { status: "redeeming" }
  | { status: "success"; dealId: string; redirectUrl: string }
  | {
      status: "error";
      message: string;
      httpStatus?: number;
      requestId?: string;
      isAuth?: boolean;
    };

function extractToken(params: URLSearchParams): string | null {
  return params.get("token") ?? params.get("resume_token") ?? params.get("t");
}

export default function ResumePage() {
  return (
    <Suspense
      fallback={
        <main
          style={{ maxWidth: 480, margin: "80px auto", padding: "0 16px" }}
        >
          <p>Resuming your deal…</p>
        </main>
      }
    >
      <ResumeContent />
    </Suspense>
  );
}

function ResumeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = extractToken(searchParams);
  const [state, setState] = useState<RedeemState>({ status: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ status: "no-token" });
      return;
    }

    let cancelled = false;

    async function run() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!user) {
        document.cookie = `fractpath_draft_token=${encodeURIComponent(token!)};path=/;max-age=3600;SameSite=Lax`;

        let draftEmail = "";
        try {
          const infoRes = await fetch(`/api/draft-tokens/info?token=${encodeURIComponent(token!)}`, {
            cache: "no-store",
          });
          if (infoRes.ok) {
            const info = await infoRes.json();
            draftEmail = info.email || "";
          }
        } catch {}

        const returnTo = `/resume?token=${encodeURIComponent(token!)}`;
        const emailParam = draftEmail ? `&email=${encodeURIComponent(draftEmail)}` : "";

        const { data: existsData } = draftEmail
          ? await supabase.auth.signInWithOtp({ email: draftEmail, options: { shouldCreateUser: false } }).catch(() => ({ data: null }))
          : { data: null };

        const userExists = !!existsData;

        if (cancelled) return;

        if (draftEmail && !userExists) {
          setState({ status: "redirecting-signup" });
          router.push(`/signup?returnTo=${encodeURIComponent(returnTo)}${emailParam}&persona=homeowner`);
        } else {
          setState({ status: "redirecting-login" });
          router.push(`/login?returnTo=${encodeURIComponent(returnTo)}${emailParam}`);
        }
        return;
      }

      setState({ status: "redeeming" });

      try {
        const res = await fetch("/api/deals/resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ token }),
        });

        const data = await res.json().catch(() => ({}));
        const requestId =
          res.headers.get("x-request-id") ??
          res.headers.get("x-amzn-requestid") ??
          undefined;

        if (cancelled) return;

        if (!res.ok || !data.ok) {
          const isAuth = res.status === 401;
          setState({
            status: "error",
            message: data.error || "Failed to resume scenario",
            httpStatus: res.status,
            requestId,
            isAuth,
          });
          return;
        }

        document.cookie =
          "fractpath_draft_token=;path=/;max-age=0;SameSite=Lax";

        const redirectUrl = data.redirect_url || `/deal/${data.deal_id}`;

        setState({
          status: "success",
          dealId: data.deal_id,
          redirectUrl,
        });

        router.replace(redirectUrl);
      } catch {
        if (!cancelled) {
          setState({
            status: "error",
            message: "Network error. Please try again.",
          });
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  return (
    <main style={{ maxWidth: 480, margin: "80px auto", padding: "0 16px" }}>
      {state.status === "loading" && <p>Resuming your deal…</p>}

      {state.status === "no-token" && (
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Missing Token</h1>
          <p style={{ color: "#666", marginTop: 8 }}>
            No draft token was provided. Please use the link from your scenario
            email to continue.
          </p>
        </div>
      )}

      {state.status === "redirecting-login" && (
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>
            Sign In Required
          </h1>
          <p style={{ color: "#666", marginTop: 8 }}>
            Redirecting you to sign in. Your scenario will be waiting for you
            after login.
          </p>
        </div>
      )}

      {state.status === "redirecting-signup" && (
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>
            Create Your Account
          </h1>
          <p style={{ color: "#666", marginTop: 8 }}>
            Redirecting you to create an account. Your scenario will be ready
            after registration.
          </p>
        </div>
      )}

      {state.status === "redeeming" && (
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>
            Resuming your deal…
          </h1>
          <p style={{ color: "#666", marginTop: 8 }}>
            Loading your scenario and creating your deal workspace...
          </p>
        </div>
      )}

      {state.status === "success" && (
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Redirecting…</h1>
          <p style={{ color: "#666", marginTop: 8 }}>
            Your deal workspace is ready. Taking you there now.
          </p>
        </div>
      )}

      {state.status === "error" && (
        <div>
          <h1
            style={{ fontSize: "1.5rem", fontWeight: 700, color: "#b91c1c" }}
          >
            Unable to Resume Scenario
          </h1>
          <p style={{ color: "#666", marginTop: 8 }}>{state.message}</p>

          {state.isAuth && (
            <div
              style={{
                marginTop: 16,
                padding: "12px 16px",
                background: "#fef3c7",
                borderRadius: 6,
                border: "1px solid #f59e0b",
              }}
            >
              <p style={{ margin: 0, fontSize: "0.875rem", color: "#92400e" }}>
                Your session has expired or you are not signed in.{" "}
                <a
                  href={`/login?returnTo=${encodeURIComponent(`/resume?token=${token}`)}`}
                  style={{ color: "#92400e", fontWeight: 600 }}
                >
                  Sign in to continue.
                </a>
              </p>
            </div>
          )}

          {(state.httpStatus || state.requestId) && (
            <div
              style={{
                marginTop: 12,
                padding: "8px 12px",
                background: "#f3f4f6",
                borderRadius: 4,
                fontFamily: "monospace",
                fontSize: "0.75rem",
                color: "#6b7280",
              }}
            >
              {state.httpStatus && <div>HTTP {state.httpStatus}</div>}
              {state.message && <div>{state.message}</div>}
              {state.requestId && <div>Request ID: {state.requestId}</div>}
            </div>
          )}

          <p style={{ color: "#999", marginTop: 16, fontSize: "0.875rem" }}>
            If you believe this is an error, please contact support with your
            token reference.
          </p>
        </div>
      )}
    </main>
  );
}
