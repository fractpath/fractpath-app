"use client";

import { useSession } from "@/lib/useSession";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function AuthHeader() {
  const { user, isLoading, error } = useSession();
  const router = useRouter();

  async function handleSignOut() {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.refresh();
    } catch {
      // Ignore if not configured
    }
  }

  if (isLoading) {
    return <div style={{ fontSize: 14, color: "#666" }}>Loading...</div>;
  }

  if (error) {
    return null;
  }

  if (user) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 14 }}>
        <span style={{ color: "#666" }}>{user.email}</span>
        <button
          onClick={handleSignOut}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid #ccc",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <Link
      href="/login"
      style={{
        padding: "6px 12px",
        borderRadius: 6,
        border: "1px solid #ccc",
        background: "#fff",
        textDecoration: "none",
        color: "#111",
        fontSize: 14,
      }}
    >
      Sign in
    </Link>
  );
}
