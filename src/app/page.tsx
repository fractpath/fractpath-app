"use client";

import { useState } from "react";

type CashStructure = "upfront" | "installments" | "both" | "exploring";
type SaleTimeline = "3-12-months" | "exploring";

export default function Home() {
  const [homeAddress, setHomeAddress] = useState("");
  const [equityPct, setEquityPct] = useState("");
  const [cashStructure, setCashStructure] = useState<CashStructure>("exploring");
  const [saleTimeline, setSaleTimeline] = useState<SaleTimeline>("exploring");

  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setMessage("");

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeAddress,
          estimatedEquityPercentageOwned: equityPct,
          preferredCashStructure: cashStructure,
          intendedSaleTimeline: saleTimeline,
        }),
      });

      const data = (await res.json()) as { ok: boolean; error?: string };

      if (!res.ok || !data.ok) {
        setStatus("error");
        setMessage(data.error || "Submission failed.");
        return;
      }

      setStatus("success");
      setMessage("Submitted. Thank you.");
    } catch {
      setStatus("error");
      setMessage("Submission failed.");
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>FractPath — Homeowner Intake</h1>
      <p style={{ marginTop: 0, color: "#444" }}>
        Minimal intake scaffold (Sprint 1). No persistence, no integrations.
      </p>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, marginTop: 24 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Home Address</span>
          <input
            value={homeAddress}
            onChange={(e) => setHomeAddress(e.target.value)}
            required
            placeholder="123 Main St, City, State ZIP"
            style={{ padding: 10, border: "1px solid #ccc", borderRadius: 6 }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Estimated Equity Percentage Owned</span>
          <input
            value={equityPct}
            onChange={(e) => setEquityPct(e.target.value)}
            required
            inputMode="decimal"
            placeholder="e.g., 65"
            style={{ padding: 10, border: "1px solid #ccc", borderRadius: 6 }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Preferred Cash Structure</span>
          <select
            value={cashStructure}
            onChange={(e) => setCashStructure(e.target.value as CashStructure)}
            style={{ padding: 10, border: "1px solid #ccc", borderRadius: 6 }}
          >
            <option value="upfront">upfront</option>
            <option value="installments">installments</option>
            <option value="both">both</option>
            <option value="exploring">exploring</option>
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Intended Sale Timeline</span>
          <select
            value={saleTimeline}
            onChange={(e) => setSaleTimeline(e.target.value as SaleTimeline)}
            style={{ padding: 10, border: "1px solid #ccc", borderRadius: 6 }}
          >
            <option value="3-12-months">3–12 months</option>
            <option value="exploring">just exploring</option>
          </select>
        </label>

        <button
          type="submit"
          disabled={status === "submitting"}
          style={{
            padding: 12,
            borderRadius: 8,
            border: "1px solid #111",
            background: status === "submitting" ? "#eee" : "#111",
            color: status === "submitting" ? "#111" : "#fff",
            cursor: status === "submitting" ? "not-allowed" : "pointer",
            fontWeight: 600,
          }}
        >
          {status === "submitting" ? "Submitting..." : "Submit"}
        </button>

        {status !== "idle" && (
          <div
            role="status"
            style={{
              padding: 12,
              borderRadius: 8,
              border: "1px solid #ccc",
              background: status === "success" ? "#f2fff2" : "#fff2f2",
            }}
          >
            {message}
          </div>
        )}
      </form>
    </main>
  );
}
