"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Scenario = {
  id: string;
  created_at: string;
  scenario_summary: string | null;
  source: string | null;
};

type ApiResponse =
  | { ok: true; scenarios: Scenario[] }
  | { ok: false; error: string };

export default function MyScenariosPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/scenario?limit=20", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });

        if (res.status === 401) {
          if (!cancelled) {
            setScenarios([]);
            setError("unauthorized");
            setLoading(false);
          }
          return;
        }

        const json = (await res.json()) as ApiResponse;

        if (!res.ok || json.ok === false) {
          throw new Error(
            json.ok === false ? json.error : `HTTP ${res.status}`,
          );
        }

        if (!cancelled) {
          setScenarios(json.scenarios ?? []);
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "unknown error");
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={{ padding: 24, maxWidth: 840 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>My Scenarios</h1>
      <p style={{ marginTop: 8, opacity: 0.8 }}>
        Read-only list of your most recent saved scenario summaries.
      </p>

      {loading ? (
        <p style={{ marginTop: 16 }}>Loading…</p>
      ) : error === "unauthorized" ? (
        <p style={{ marginTop: 16 }}>
          You’re not signed in. Please <Link href="/login">log in</Link> and
          refresh.
        </p>
      ) : error ? (
        <p style={{ marginTop: 16 }}>Error: {error}</p>
      ) : scenarios.length === 0 ? (
        <p style={{ marginTop: 16 }}>No scenarios found yet.</p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            marginTop: 16,
            display: "grid",
            gap: 12,
          }}
        >
          {scenarios.map((s) => (
            <li
              key={s.id}
              style={{
                border: "1px solid rgba(0,0,0,0.12)",
                borderRadius: 12,
                padding: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  {new Date(s.created_at).toLocaleString()}
                </div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  {s.source ? `source: ${s.source}` : ""}
                </div>
              </div>

              <div
                style={{
                  marginTop: 8,
                  fontSize: 14,
                  whiteSpace: "pre-wrap",
                }}
              >
                {s.scenario_summary ?? (
                  <span style={{ opacity: 0.7 }}>(no summary)</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
