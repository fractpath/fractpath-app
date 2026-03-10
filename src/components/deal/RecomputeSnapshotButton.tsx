"use client";

import { useState } from "react";
import { usePageLoading } from "@/components/ui/PageLoadingOverlay";

type Props = {
  dealId: string;
  initialInputs?: Record<string, unknown> | null;
  disabled?: boolean;
};

export function RecomputeSnapshotButton({ dealId, initialInputs, disabled }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const pageLoading = usePageLoading();

  async function handleRecompute() {
    setState("loading");
    setErrorMsg("");
    pageLoading.show("Rendering snapshot…");

    try {
      const body: Record<string, unknown> = {};

      if (initialInputs && typeof initialInputs === "object") {
        body.inputs = initialInputs;
      } else {
        body.inputs = {};
      }

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
    } finally {
      pageLoading.hide();
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
