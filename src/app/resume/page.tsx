"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type RedeemState =
  | { status: "loading" }
  | { status: "no-token" }
  | { status: "redirecting-login" }
  | { status: "redeeming" }
  | { status: "success"; dealId: string; redirectUrl: string }
  | { status: "error"; message: string };

export default function ResumePage() {
  return (
    <Suspense fallback={<main style={{ maxWidth: 480, margin: "80px auto", padding: "0 16px" }}><p>Loading...</p></main>}>
      <ResumeContent />
    </Suspense>
  );
}

function ResumeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
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
        setState({ status: "redirecting-login" });
        document.cookie = `fractpath_draft_token=${encodeURIComponent(token!)};path=/;max-age=3600;SameSite=Lax`;
        router.push("/login");
        return;
      }

      setState({ status: "redeeming" });

      try {
        const res = await fetch("/api/deals/resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (cancelled) return;

        if (!res.ok || !data.ok) {
          setState({
            status: "error",
            message: data.error || "Failed to resume scenario",
          });
          return;
        }

        document.cookie = "fractpath_draft_token=;path=/;max-age=0";

        setState({
          status: "success",
          dealId: data.deal_id,
          redirectUrl: data.redirect_url || `/deal/${data.deal_id}`,
        });
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
      {state.status === "loading" && <p>Loading...</p>}

      {state.status === "no-token" && (
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>
            Missing Token
          </h1>
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

      {state.status === "redeeming" && (
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>
            Setting Up Your Deal
          </h1>
          <p style={{ color: "#666", marginTop: 8 }}>
            Loading your scenario and creating your deal workspace...
          </p>
        </div>
      )}

      {state.status === "success" && (
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>
            Deal Created
          </h1>
          <p style={{ color: "#666", marginTop: 8 }}>
            Your scenario has been imported and your deal workspace is ready.
          </p>
          <button
            onClick={() => router.push(state.redirectUrl)}
            style={{
              marginTop: 16,
              padding: "10px 24px",
              background: "#111",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: "1rem",
            }}
          >
            Go to Deal
          </button>
        </div>
      )}

      {state.status === "error" && (
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#b91c1c" }}>
            Unable to Resume Scenario
          </h1>
          <p style={{ color: "#666", marginTop: 8 }}>{state.message}</p>
          <p style={{ color: "#999", marginTop: 16, fontSize: "0.875rem" }}>
            If you believe this is an error, please contact support with your
            token reference.
          </p>
        </div>
      )}
    </main>
  );
}
