"use client";

import { useState, useCallback, useRef, useEffect } from "react";
function mountFractpathWidget(opts: {
  el: HTMLElement;
  mode: string;
  persona: string;
  snapshot: Record<string, unknown>;
  onSave?: (snap: Record<string, unknown>) => void;
}): void {
  opts.el.innerHTML =
    '<p style="color:#888;font-size:14px;">Calculator widget loading…</p>';
}

interface DealCalculatorEmbedProps {
  dealId: string;
  role?: string;
  currentSnapshotId?: string;
  snapshot?: Record<string, unknown>; // canonical snapshot from app
}

export function DealCalculatorEmbed({
  dealId,
  role = "OWNER",
  currentSnapshotId,
  snapshot,
}: DealCalculatorEmbedProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isCounterparty = role === "COUNTERPARTY";

  const handleCounterpartySave = useCallback(
    async (snapshot: Record<string, unknown>) => {
      setSaving(true);
      setError(null);

      try {
        const proposeRes = await fetch(
          `/api/deals/${dealId}/snapshot/propose`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ snapshot }),
          },
        );

        if (!proposeRes.ok) {
          const proposeBody = await proposeRes.json().catch(() => ({}));
          throw new Error(
            proposeBody.error ??
              `Snapshot propose failed (${proposeRes.status})`,
          );
        }

        const { snapshot_id } = await proposeRes.json();

        const counterRes = await fetch(`/api/deals/${dealId}/counter`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proposed_snapshot_id: snapshot_id,
            base_snapshot_id: currentSnapshotId ?? null,
          }),
        });

        if (!counterRes.ok) {
          const counterBody = await counterRes.json().catch(() => ({}));
          throw new Error(
            counterBody.error ??
              `Counter creation failed (${counterRes.status})`,
          );
        }

        window.location.href = `/deal/${dealId}`;
      } catch (err: any) {
        setError(err.message ?? "Failed to save snapshot");
        setSaving(false);
      }
    },
    [dealId, currentSnapshotId],
  );

  const roleLabel = isCounterparty ? "Counterparty" : "Owner only";

  // --- Mount the FractPath widget ---
  useEffect(() => {
    if (!containerRef.current || !snapshot) return;

    mountFractpathWidget({
      el: containerRef.current,
      mode: "app",
      persona: "buyer", // or dynamic depending on your app context
      snapshot,
      onSave: (snap) => {
        window.__fractpath_saveSnapshot?.(snap);
      },
    });
  }, [snapshot]);

  return (
    <section className="mt-6 rounded-md border p-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-base font-semibold">Scenario calculator</h2>
        <div className="text-xs text-muted-foreground">{roleLabel}</div>
      </div>

      {error && (
        <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      <div
        ref={containerRef}
        data-fractpath-calculator
        data-deal-id={dealId}
        className="mt-4 rounded-md border-2 border-dashed border-muted-foreground/25 p-8 text-center"
        style={{ minHeight: 480 }}
      >
        {/* The widget will mount here */}
      </div>

      {saving && (
        <p className="mt-3 text-sm font-medium">
          {isCounterparty
            ? "Submitting counter-proposal..."
            : "Saving snapshot..."}
        </p>
      )}
    </section>
  );
}

export type { DealCalculatorEmbedProps };
