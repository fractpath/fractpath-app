"use client";

import { useEffect, useState } from "react";

type Me =
  | { ok: true; user_id: string; email: string | null }
  | { ok: false; error: string };

export function AuthHeader() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/me", { credentials: "include" })
      .then((r) => r.json())
      .then((data: Me) => {
        if (!cancelled) setMe(data);
      })
      .catch(() => {
        if (!cancelled) setMe({ ok: false, error: "Unknown" });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (me?.ok) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 13, opacity: 0.85 }}>
          Signed in{me.email ? ` as ${me.email}` : ""}
        </span>

        <form method="post" action="/auth/logout">
          <button
            type="submit"
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.15)",
              cursor: "pointer",
              fontWeight: 600,
              background: "white",
            }}
          >
            Log out
          </button>
        </form>
      </div>
    );
  }

  // Logged out (or loading) → link to /login (NOT /auth/login)
  return (
    <a
      href="/login"
      style={{
        padding: "8px 10px",
        borderRadius: 10,
        border: "1px solid rgba(0,0,0,0.15)",
        textDecoration: "none",
        fontWeight: 600,
        color: "inherit",
      }}
    >
      Log in
    </a>
  );
}
