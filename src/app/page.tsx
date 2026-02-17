"use client";

import { useState } from "react";
import { AuthHeader } from "@/components/AuthHeader";

type CashStructure = "upfront" | "installments" | "both" | "exploring";
type SaleTimeline = "3-12-months" | "exploring";

type SubmitResponse =
  | { ok: true; dealId: string }
  | { ok: false; error: string };

export default function Home() {
  const [email, setEmail] = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  const [equityPct, setEquityPct] = useState("");
  const [cashStructure, setCashStructure] =
    useState<CashStructure>("exploring");
  const [saleTimeline, setSaleTimeline] = useState<SaleTimeline>("exploring");

  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setMessage("");

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email,
          homeAddress,
          estimatedEquityPercentageOwned: equityPct,
          preferredCashStructure: cashStructure,
          intendedSaleTimeline: saleTimeline,
        }),
      });

      // IMPORTANT: don't assume JSON (401 redirects / Next error pages can be HTML)
      const raw = await res.text();
      let data: SubmitResponse | null = null;

      try {
        data = raw ? (JSON.parse(raw) as SubmitResponse) : null;
      } catch {
        // leave as null; we'll surface status + snippet below
      }

      if (!res.ok) {
        const snippet = raw ? raw.slice(0, 200) : "";
        throw new Error(`HTTP ${res.status}${snippet ? `: ${snippet}` : ""}`);
      }

      if (!data) {
        throw new Error("Expected JSON response but got empty/non-JSON body.");
      }

      if (!data.ok) {
        throw new Error(data.error || "Unknown server error");
      }

      if (!data.dealId) {
        throw new Error("Deal was created but no deal ID was returned.");
      }

      setStatus("success");
      setMessage("Deal created. Redirecting...");
      window.location.assign(`/deal/${data.dealId}`);
    } catch (err: any) {
      console.error("SUBMIT_CLIENT_FAILED", err);
      setStatus("error");
      setMessage(
        err?.message
          ? `Submission failed: ${err.message}`
          : "Submission failed.",
      );
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 720 }}>
      <AuthHeader />

      <h1 style={{ fontSize: 20, fontWeight: 700, marginTop: 16 }}>
        Create a deal
      </h1>

      <form
        onSubmit={onSubmit}
        style={{ marginTop: 16, display: "grid", gap: 12 }}
      >
        <label style={{ display: "grid", gap: 6 }}>
          <div>Email</div>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div>Home address</div>
          <input
            value={homeAddress}
            onChange={(e) => setHomeAddress(e.target.value)}
            placeholder="123 Main St"
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div>Equity % owned</div>
          <input
            value={equityPct}
            onChange={(e) => setEquityPct(e.target.value)}
            placeholder="25"
            inputMode="numeric"
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div>Preferred cash structure</div>
          <select
            value={cashStructure}
            onChange={(e) => setCashStructure(e.target.value as CashStructure)}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          >
            <option value="exploring">Exploring</option>
            <option value="upfront">Upfront</option>
            <option value="installments">Installments</option>
            <option value="both">Both</option>
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div>Intended sale timeline</div>
          <select
            value={saleTimeline}
            onChange={(e) => setSaleTimeline(e.target.value as SaleTimeline)}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          >
            <option value="exploring">Exploring</option>
            <option value="3-12-months">3–12 months</option>
          </select>
        </label>

        <button
          type="submit"
          disabled={status === "submitting"}
          style={{
            padding: 12,
            borderRadius: 10,
            border: "1px solid #000",
            background: status === "submitting" ? "#eee" : "#fff",
            cursor: status === "submitting" ? "not-allowed" : "pointer",
            fontWeight: 600,
          }}
        >
          {status === "submitting" ? "Submitting..." : "Create deal"}
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
