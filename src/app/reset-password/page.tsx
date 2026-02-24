"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
      });

      if (error) {
        setError(error.message);
        setIsLoading(false);
        return;
      }

      setSuccess(true);
      setIsLoading(false);
    } catch {
      setError("Unable to send reset link. Please try again.");
      setIsLoading(false);
    }
  }

  if (success) {
    return (
      <main style={{ maxWidth: 400, margin: "80px auto", padding: 16, fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>Check your email</h1>
        <p style={{ color: "#666" }}>
          We sent a password reset link to {email}
        </p>
        <div style={{ marginTop: 24 }}>
          <Link href="/login" style={{ color: "#111" }}>
            Back to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 400, margin: "80px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Reset your password</h1>
      <p style={{ color: "#666", marginTop: 0, marginBottom: 24 }}>
        Enter your email and we’ll send you a reset link
      </p>

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
          {isLoading ? "Sending..." : "Send reset link"}
        </button>
      </form>

      <div style={{ marginTop: 24, fontSize: 14 }}>
        <Link href="/login" style={{ color: "#111" }}>
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
