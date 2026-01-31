"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        setIsLoading(false);
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Unable to sign in. Please try again.");
      setIsLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 400, margin: "80px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Sign in to continue exploring</h1>
      <p style={{ color: "#666", marginTop: 0, marginBottom: 24 }}>Welcome back</p>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            style={{ padding: 10, border: "1px solid #ccc", borderRadius: 6 }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="Your password"
            style={{ padding: 10, border: "1px solid #ccc", borderRadius: 6 }}
          />
        </label>

        {error && (
          <div style={{ color: "#c00", fontSize: 14 }}>{error}</div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          style={{
            padding: 12,
            borderRadius: 8,
            border: "none",
            background: "#111",
            color: "#fff",
            cursor: isLoading ? "not-allowed" : "pointer",
            fontWeight: 600,
          }}
        >
          {isLoading ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <div style={{ marginTop: 24, fontSize: 14 }}>
        <Link href="/reset-password" style={{ color: "#111" }}>
          Forgot your password?
        </Link>
      </div>

      <div style={{ marginTop: 12, fontSize: 14, color: "#666" }}>
        New here?{" "}
        <Link href="/signup" style={{ color: "#111", fontWeight: 500 }}>
          Create an account
        </Link>
      </div>
    </main>
  );
}
