"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
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
        <main style={{ maxWidth: 480, margin: "80px auto", padding: "0 16px" }}>
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

  const token = useMemo(() => extractToken(searchParams), [searchParams]);

  const [state, setState] = useState<RedeemState>(() =>
    token ? { status: "loading" } : { status: "no-token" },
  );

  useEffect(() => {
    if (!token) return;

    const resumeToken = token;
    let cancelled = false;

    async function run() {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.auth.getUser();

        if (cancelled) return;

        if (error) {
          setState({
            status: "error",
            message: `Auth error: ${error.message}`,
            isAuth: true,
          });
          return;
        }

        const user = data?.user;

        // Not logged in -> route to login/signup with returnTo preserved
        if (!user) {
          // Preserve the draft token for 1 hour (used by server resume flow)
          document.cookie = `fractpath_draft_token=${encodeURIComponent(
            resumeToken,
          )};path=/;max-age=3600;SameSite=Lax`;

          // Optional: if we can fetch draft email, prefill it
          let draftEmail = "";
          try {
            const infoRes = await fetch(
              `/api/draft-tokens/info?token=${encodeURIComponent(resumeToken)}`,
              { cache: "no-store" },
            );
            if (infoRes.ok) {
              const info = await infoRes.json();
              draftEmail = info?.email || "";
            }
          } catch {}

          const returnTo = `/resume?token=${encodeURIComponent(resumeToken)}`;
          const emailParam = draftEmail
            ? `&email=${encodeURIComponent(draftEmail)}`
            : "";

          // Deterministic: always go to login (signup link is on the login page).
          // If you want auto-route to signup based on existence, do it via a server API later.
          setState({ status: "redirecting-login" });
          router.push(
            `/login?returnTo=${encodeURIComponent(returnTo)}${emailParam}`,
          );
          return;
        }

        // Logged in -> redeem/resume via server
        setState({ status: "redeeming" });

        const res = await fetch("/api/deals/resume", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: resumeToken }),
        });

        const json = await res.json().catch(() => ({}) as any);
        if (!res.ok || !json?.ok) {
          setState({
            status: "error",
            message:
              json?.error ??
              json?.message ??
              `Resume failed (HTTP ${res.status})`,
            httpStatus: res.status,
            requestId: json?.requestId,
          });
          return;
        }

        const dealId: string | undefined =
          json?.dealId ?? json?.deal_id ?? undefined;

        const redirectUrl: string =
          json?.redirectUrl ?? (dealId ? `/deal/${dealId}` : "/dashboard");

        setState({
          status: "success",
          dealId: dealId || "",
          redirectUrl,
        });

        router.replace(redirectUrl);
      } catch (e: any) {
        if (cancelled) return;
        setState({
          status: "error",
          message: e?.message ?? "Resume failed",
        });
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  return (
    <main style={{ maxWidth: 520, margin: "80px auto", padding: 16 }}>
      {state.status === "loading" && <p>Loading…</p>}

      {state.status === "no-token" && (
        <>
          <h1>Invalid link</h1>
          <p>This resume link is missing a token.</p>
        </>
      )}

      {state.status === "redirecting-login" && (
        <>
          <h1>Sign in required</h1>
          <p>Redirecting you to sign in…</p>
        </>
      )}

      {state.status === "redirecting-signup" && (
        <>
          <h1>Create your account</h1>
          <p>Redirecting you to sign up…</p>
        </>
      )}

      {state.status === "redeeming" && (
        <>
          <h1>Resuming…</h1>
          <p>Fetching your saved deal…</p>
        </>
      )}

      {state.status === "error" && (
        <>
          <h1>Couldn’t resume</h1>
          <p>{state.message}</p>
          {state.requestId && (
            <p style={{ opacity: 0.7 }}>Request ID: {state.requestId}</p>
          )}
        </>
      )}

      {state.status === "success" && (
        <>
          <h1>Success</h1>
          <p>Redirecting…</p>
        </>
      )}
    </main>
  );
}
