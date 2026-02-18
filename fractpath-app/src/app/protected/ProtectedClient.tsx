// src/app/protected/ProtectedClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type MeOk = { ok: true; user_id: string; email: string | null };
type MeErr = { ok: false; error?: unknown };

type State =
  | { status: "loading" }
  | { status: "authed"; user: MeOk }
  | { status: "unauthed"; code: number }
  | { status: "error"; message: string };

export default function ProtectedClient() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/me", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
          headers: { accept: "application/json" },
        });

        if (cancelled) return;

        if (res.status === 401) {
          setState({ status: "unauthed", code: 401 });
          return;
        }

        const json = (await res.json()) as MeOk | MeErr;

        if (res.status === 200 && (json as MeOk).ok === true) {
          setState({ status: "authed", user: json as MeOk });
          return;
        }

        setState({
          status: "error",
          message: `Unexpected response: ${res.status}`,
        });
      } catch (e) {
        if (cancelled) return;
        setState({
          status: "error",
          message: e instanceof Error ? e.message : "Unknown error",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>Protected</h1>

      {state.status === "loading" && <p>Loading…</p>}

      {state.status === "unauthed" && (
        <>
          <p style={{ marginBottom: 12 }}>You&apos;re not logged in</p>
          <p>
            Go to <Link href="/login">/login</Link>
          </p>
        </>
      )}

      {state.status === "authed" && (
        <>
          <p>
            <strong>User ID:</strong> {state.user.user_id}
          </p>
          <p>
            <strong>Email:</strong> {state.user.email ?? "(no email)"}
          </p>
        </>
      )}

      {state.status === "error" && (
        <>
          <p style={{ marginBottom: 12 }}>
            Could not load session info from <code>/api/me</code>.
          </p>
          <p style={{ opacity: 0.8 }}>{state.message}</p>
          <p>
            Go to <Link href="/login">/login</Link>
          </p>
        </>
      )}
    </main>
  );
}
