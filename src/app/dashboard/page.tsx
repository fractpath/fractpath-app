"use client";

import { useEffect, useState } from "react";

type Persona = "homeowner" | "buyer" | "realtor";

interface UserData {
  email: string;
  role: Persona | null;
  created_at: string | null;
}

const PERSONA_WELCOME: Record<Persona, { tagline: string; description: string }> = {
  homeowner: {
    tagline: "Welcome, Homeowner",
    description: "You're exploring a new way to unlock equity without a loan.",
  },
  buyer: {
    tagline: "Welcome, Future Homeowner",
    description: "You're modeling a pathway to ownership through shared equity.",
  },
  realtor: {
    tagline: "Welcome, Partner",
    description: "You're participating as a referral partner and co-pilot.",
  },
};

const NEXT_STEPS: Record<Persona, string[]> = {
  homeowner: [
    "Schedule an intro call with our team",
    "Complete property appraisal coordination",
    "Connect with our title partner",
  ],
  buyer: [
    "Refine your terms and preferences",
    "Get matched with homeowner opportunities",
    "Review and finalize your pathway",
  ],
  realtor: [
    "Complete beta partner onboarding",
    "Set up your referral profile",
    "Access co-pilot resources",
  ],
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<UserData | null>(null);

  useEffect(() => {
    const draftCookie = document.cookie
      .split("; ")
      .find((c) => c.startsWith("fractpath_draft_token="));
    if (draftCookie) {
      const token = decodeURIComponent(draftCookie.split("=")[1]);
      if (token) {
        window.location.href = `/resume?token=${encodeURIComponent(token)}`;
        return;
      }
    }

    (async () => {
      try {
        const res = await fetch("/api/me", { credentials: "include" });
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!res.ok) {
          setError("Failed to load user data");
          setLoading(false);
          return;
        }
        const data = await res.json();
        setUser({
          email: data.email || "",
          role: data.role || data.user_metadata?.role || null,
          created_at: data.created_at || null,
        });
      } catch (e) {
        setError("Failed to connect");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <main style={{ maxWidth: 720, margin: "48px auto", padding: "0 16px" }}>
        <p>Loading...</p>
      </main>
    );
  }

  if (error || !user) {
    return (
      <main style={{ maxWidth: 720, margin: "48px auto", padding: "0 16px" }}>
        <p style={{ color: "#c00" }}>{error || "Unable to load dashboard"}</p>
        <a href="/login">Return to login</a>
      </main>
    );
  }

  const role: Persona = user.role || "homeowner";
  const welcome = PERSONA_WELCOME[role];
  const steps = NEXT_STEPS[role];

  return (
    <main style={{ maxWidth: 720, margin: "48px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ marginBottom: 32, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>{welcome.tagline}</h1>
          <p style={{ margin: "8px 0 0", opacity: 0.7 }}>{welcome.description}</p>
        </div>
        <form method="post" action="/auth/logout" style={{ margin: 0 }}>
          <button
            type="submit"
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.2)",
              background: "transparent",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Sign out
          </button>
        </form>
      </header>

      <div style={{ display: "grid", gap: 24 }}>
        <section style={{
          border: "1px solid rgba(0,0,0,0.1)",
          borderRadius: 12,
          padding: 20,
          background: "rgba(0,0,0,0.02)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Your Scenario</h2>
            <span style={{
              background: "#e8f5e9",
              color: "#2e7d32",
              padding: "4px 10px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
            }}>
              Scenario saved
            </span>
          </div>
          <p style={{ margin: 0, opacity: 0.8, lineHeight: 1.6 }}>
            We've saved your scenario. A FractPath team member will help refine it with you.
          </p>
          <p style={{ margin: "12px 0 0", fontSize: 13, opacity: 0.6 }}>
            Your scenario details are securely stored and ready for review.
          </p>
        </section>

        <section style={{
          border: "1px solid rgba(0,0,0,0.1)",
          borderRadius: 12,
          padding: 20,
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 16px" }}>What happens next</h2>
          <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2 }}>
            {steps.map((step, i) => (
              <li key={i} style={{ opacity: 0.85 }}>{step}</li>
            ))}
          </ol>
        </section>

        <section style={{
          border: "1px solid rgba(0,0,0,0.1)",
          borderRadius: 12,
          padding: 20,
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 12px" }}>Need help?</h2>
          <p style={{ margin: 0, opacity: 0.8 }}>
            Our team is here to guide you through every step.
          </p>
          <a
            href="mailto:support@fractpath.com"
            style={{
              display: "inline-block",
              marginTop: 12,
              padding: "10px 20px",
              background: "#111",
              color: "#fff",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Contact FractPath
          </a>
        </section>

        <footer style={{
          marginTop: 16,
          padding: "16px 0",
          borderTop: "1px solid rgba(0,0,0,0.08)",
          fontSize: 12,
          opacity: 0.5,
          textAlign: "center",
        }}>
          <p style={{ margin: 0 }}>
            Signed in as {user.email}
          </p>
          <p style={{ margin: "8px 0 0" }}>
            Your data is protected with industry-standard encryption.
          </p>
        </footer>
      </div>
    </main>
  );
}
