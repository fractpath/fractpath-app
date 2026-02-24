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

    const resumeToken = token!

    let cancelled = false;

    async function run() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (cancelled) return;

        if (!user) {
          document.cookie = `fractpath_draft_token=${encodeURIComponent(
            resumeToken,
          )};path=/;max-age=3600;SameSite=Lax`;

          let draftEmail = "";
          try {
            const infoRes = await fetch(
              `/api/draft-tokens/info?token=${encodeURIComponent(resumeToken)}`,
              { cache: "no-store" },
            );
            if (infoRes.ok) {
              const info = await infoRes.json();
              draftEmail = info.email || "";
            }
          } catch {}

          const returnTo = `/resume?token=${encodeURIComponent(resumeToken)}`;
          const emailParam = draftEmail
            ? `&email=${encodeURIComponent(draftEmail)}`
            : "";

          let userExists = false;
          if (draftEmail) {
            try {
              const { data: existsData } = await supabase.auth
                .signInWithOtp({
                  email: draftEmail,
                  options: { shouldCreateUser: false },
                })
                .catch(() => ({ data: null as any }));

              userExists = !!existsData;
            } catch {
              userExists = false;
            }
          }

          if (cancelled) return;

          if (draftEmail && !userExists) {
            setState({ status: "redirecting-signup" });
            router.push(
              `/signup?returnTo=${encodeURIComponent(
                returnTo,
              )}${emailParam}&persona=homeowner`,
            );
          } else {
            setState({ status: "redirecting-login" });
            router.push(
              `/login?returnTo=${encodeURIComponent(returnTo)}${emailParam}`,
            );
          }
          return;
        }

        setState({ status: "redeeming" });

        const res = await fetch("/api/deals/resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ token: resumeToken }),
        });

        const data = await res.json().catch(() => ({}) as any);
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

    void run();

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

      {state.status === "redirecting-login" && <p>Redirecting to login…</p>}
      {state.status === "redirecting-signup" && <p>Redirecting to signup…</p>}
      {state.status === "redeeming" && <p>Finalizing your deal…</p>}

      {state.status === "error" && (
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Error</h1>
          <p style={{ marginTop: 8 }}>{state.message}</p>
        </div>
      )}
    </main>
  );
}
