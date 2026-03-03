"use client";

import { useState } from "react";

type Props = {
  dealId: string;
  initialInputs?: Record<string, unknown> | null;
  disabled?: boolean;
};

export function RecomputeSnapshotButton({ dealId, initialInputs, disabled }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleRecompute() {
    setState("loading");
    setErrorMsg("");

    try {
      const body: Record<string, unknown> = {};

      if (initialInputs && typeof initialInputs === "object") {
        body.inputs = initialInputs;
      } else {
        body.inputs = {};
      }

      try {
        const raw = localStorage.getItem(`fractpath:deal:${dealId}:header`);
        if (raw) {
          const h = JSON.parse(raw);
          if (h && typeof h === "object") {
            const header: Record<string, string> = {};
            if (typeof h.title === "string") header.title = h.title;
            if (typeof h.display_address === "string") header.display_address = h.display_address;
            if (typeof h.property_id === "string") header.property_id = h.property_id;
            if (typeof h.property_status === "string") header.property_status = h.property_status;
            if (typeof h.ownership_status === "string") header.ownership_status = h.ownership_status;
            body.header = header;
          }
        }
      } catch { /* ignore */ }

      const res = await fetch(`/api/deals/${dealId}/snapshot/compute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setState("error");
        setErrorMsg(data.error || "Recompute failed");
        return;
      }

      window.location.reload();
    } catch {
      setState("error");
      setErrorMsg("Network error. Please try again.");
    }
  }

  return (
    <div className="mt-4">
      <button
        onClick={handleRecompute}
        disabled={disabled || state === "loading"}
        className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {state === "loading" ? "Recomputing..." : "Recompute snapshot"}
      </button>

      {state === "error" && errorMsg ? (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {errorMsg}
        </div>
      ) : null}
    </div>
  );
}
