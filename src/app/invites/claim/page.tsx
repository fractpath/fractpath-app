"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ClaimState =
  | { status: "loading" }
  | { status: "no-token" }
  | { status: "redirecting-login" }
  | { status: "redeeming" }
  | { status: "success"; dealId: string }
  | { status: "error"; message: string; code?: number };

function isAuthSessionMissing(err: any): boolean {
  const msg = String(err?.message || "");
  return msg.toLowerCase().includes("auth session missing");
}

export default function InviteClaimPage() {
  return (
    <Suspense
      fallback={
        <main style={{ maxWidth: 520, margin: "80px auto", padding: 16 }}>
          <p>Opening your invitation…</p>
        </main>
      }
    >
      <ClaimContent />
    </Suspense>
  );
}

function ClaimContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const claimOnceRef = useRef(false);

  const token = useMemo(() => {
    const rawQs = searchParams?.toString() ?? "";
    const params = new URLSearchParams(rawQs);
    return params.get("token") ?? params.get("t") ?? null;
  }, [searchParams]);

  const [state, setState] = useState<ClaimState>(() =>
    token ? { status: "loading" } : { status: "no-token" },
  );

  useEffect(() => {
    if (!token) return;

    const qs = searchParams?.toString() ?? "";
    const returnTo = qs ? `/invites/claim?${qs}` : "/invites/claim";

    let cancelled = false;

    (async () => {
      // 1) Auth check
      const { data, error } = await supabase.auth.getUser();
      if (cancelled) return;

      const user = data?.user ?? null;

      if (!user || isAuthSessionMissing(error)) {
        setState({ status: "redirecting-login" });
        router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
        return;
      }

      if (error && !isAuthSessionMissing(error)) {
        setState({ status: "error", message: `Auth error: ${error.message}` });
        return;
      }

      // 2) Redeem exactly once
      if (claimOnceRef.current) return;
      claimOnceRef.current = true;

      setState({ status: "redeeming" });

      try {
        const res = await fetch("/api/invites/redeem", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const payload = await res.json().catch(() => ({}) as any);

        if (!res.ok || !payload?.ok) {
          setState({
            status: "error",
            message:
              payload?.error ??
              payload?.message ??
              `Could not redeem invite (HTTP ${res.status})`,
            code: res.status,
          });
          return;
        }

        const dealId: string | null = payload.deal_id ?? null;
        if (!dealId) {
          setState({
            status: "error",
            message: "Invite redeemed but no deal was found. Please contact support.",
          });
          return;
        }

        setState({ status: "success", dealId });
        router.replace(`/deal/${dealId}`);
      } catch (e: any) {
        setState({ status: "error", message: e?.message ?? "Redeem failed" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, router, searchParams, supabase]);

  return (
    <main style={{ maxWidth: 520, margin: "80px auto", padding: 16 }}>
      {state.status === "loading" && (
        <p>Verifying your invitation…</p>
      )}

      {state.status === "no-token" && (
        <>
          <h1>Invalid invite link</h1>
          <p>
            This invite link is missing a token. Please check your email for the
            correct link.
          </p>
        </>
      )}

      {state.status === "redirecting-login" && (
        <>
          <h1>Sign in required</h1>
          <p>
            Redirecting you to sign in so we can verify your identity and link
            you to this deal…
          </p>
        </>
      )}

      {state.status === "redeeming" && (
        <>
          <h1>Binding your account…</h1>
          <p>One moment while we connect you to this deal.</p>
        </>
      )}

      {state.status === "success" && (
        <>
          <h1>Welcome</h1>
          <p>Redirecting you to the deal…</p>
        </>
      )}

      {state.status === "error" && (
        <>
          <h1>Could not open invite</h1>
          <p>{state.message}</p>
          {state.code === 410 && (
            <p style={{ opacity: 0.7 }}>
              This invite link has expired. Please ask the homeowner to resend
              the deal.
            </p>
          )}
          {state.code === 409 && (
            <p style={{ opacity: 0.7 }}>
              This invite has already been claimed by another account. If this
              is a mistake, please contact support.
            </p>
          )}
          <p style={{ marginTop: 24 }}>
            <a href="/dashboard">Go to your dashboard</a>
          </p>
        </>
      )}
    </main>
  );
}
