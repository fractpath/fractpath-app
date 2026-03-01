"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type RedeemState =
  | { status: "loading" }
  | { status: "no-token" }
  | { status: "redirecting-login" }
  | { status: "redeeming" }
  | { status: "success"; dealId: string }
  | { status: "error"; message: string; requestId?: string };

function getToken(params: URLSearchParams): string | null {
  return params.get("t") ?? params.get("token") ?? params.get("share_token");
}

function isAuthSessionMissing(err: any): boolean {
  const msg = String(err?.message || "");
  // Supabase v2 commonly returns: "Auth session missing!"
  return msg.toLowerCase().includes("auth session missing");
}

export default function SharePage() {
  return (
    <Suspense
      fallback={
        <main style={{ maxWidth: 520, margin: "80px auto", padding: 16 }}>
          <p>Opening shared deal…</p>
        </main>
      }
    >
      <ShareContent />
    </Suspense>
  );
}

function ShareContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const redeemOnceRef = useRef(false);

  const token = useMemo(() => {
    const rawQs = searchParams?.toString() ?? "";
    const urlParams = new URLSearchParams(rawQs);
    return getToken(urlParams);
  }, [searchParams]);

  const [state, setState] = useState<RedeemState>(() =>
    token ? { status: "loading" } : { status: "no-token" },
  );

  useEffect(() => {
    if (!token) return;

    const qs = searchParams?.toString() ?? "";
    const returnTo = qs ? `/share?${qs}` : "/share";

    let cancelled = false;

    (async () => {
      // 1) Auth check
      const { data, error } = await supabase.auth.getUser();
      if (cancelled) return;

      const user = data?.user ?? null;

      // IMPORTANT: In Supabase v2, unauthenticated often returns error "Auth session missing!"
      // Treat that as "not logged in", not a hard error.
      if (!user) {
        setState({ status: "redirecting-login" });
        router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
        return;
      }

      // If we *do* have a user but also got an error, surface it (rare, but real).
      if (error && !isAuthSessionMissing(error)) {
        setState({ status: "error", message: `Auth error: ${error.message}` });
        return;
      }

      // 2) Redeem exactly once
      if (redeemOnceRef.current) return;
      redeemOnceRef.current = true;

      try {
        setState({ status: "redeeming" });

        const res = await fetch("/api/deals/share/redeem", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const json = await res.json().catch(() => ({}) as any);
        if (!res.ok || !json?.ok || !json?.dealId) {
          const requestId = json?.requestId;
          const msg =
            json?.error ??
            json?.message ??
            `Redeem failed (HTTP ${res.status})`;
          setState({ status: "error", message: msg, requestId });
          return;
        }

        const dealId: string = json.dealId;
        setState({ status: "success", dealId });

        // 3) Clean token from URL; canonical shared-mode deal view
        router.replace(`/deal/${dealId}?mode=shared`);
      } catch (e: any) {
        setState({
          status: "error",
          message: e?.message ?? "Redeem failed",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, router, searchParams, supabase]);

  return (
    <main style={{ maxWidth: 520, margin: "80px auto", padding: 16 }}>
      {state.status === "loading" && <p>Loading…</p>}

      {state.status === "no-token" && (
        <>
          <h1>Invalid link</h1>
          <p>This share link is missing a token.</p>
          <p style={{ opacity: 0.7 }}>
            Expected a URL like <code>/share?t=...</code>
          </p>
        </>
      )}

      {state.status === "redirecting-login" && (
        <>
          <h1>Sign in required</h1>
          <p>Redirecting you to sign in…</p>
        </>
      )}

      {state.status === "redeeming" && (
        <>
          <h1>Preparing your deal…</h1>
          <p>Redeeming the share token…</p>
        </>
      )}

      {state.status === "error" && (
        <>
          <h1>Couldn’t open shared deal</h1>
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
