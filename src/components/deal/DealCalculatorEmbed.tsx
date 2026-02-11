"use client";

import { useState, useCallback, useEffect, useRef } from "react";

interface DealCalculatorEmbedProps {
  dealId: string;
  role?: string;
  currentSnapshotId?: string;
}

export type SaveSnapshotFn = (snapshot: Record<string, unknown>) => Promise<void>;

export function DealCalculatorEmbed({ dealId, role = "OWNER", currentSnapshotId }: DealCalculatorEmbedProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isCounterparty = role === "COUNTERPARTY";

  const handleSave: SaveSnapshotFn = useCallback(
    async (snapshot: Record<string, unknown>) => {
      setSaving(true);
      setError(null);

      try {
        if (isCounterparty) {
          const proposeRes = await fetch(`/api/deals/${dealId}/snapshot/propose`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ snapshot }),
          });

          if (!proposeRes.ok) {
            const proposeBody = await proposeRes.json().catch(() => ({}));
            throw new Error(proposeBody.error ?? `Snapshot propose failed (${proposeRes.status})`);
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
            throw new Error(counterBody.error ?? `Counter creation failed (${counterRes.status})`);
          }
        } else {
          const res = await fetch(`/api/deals/${dealId}/snapshot`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ snapshot }),
          });

          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error ?? `Save failed (${res.status})`);
          }
        }

        window.location.href = `/deal/${dealId}`;
      } catch (err: any) {
        setError(err.message ?? "Failed to save snapshot");
        setSaving(false);
      }
    },
    [dealId, isCounterparty, currentSnapshotId],
  );

  useEffect(() => {
    const w = window as any;
    w.__fractpath_saveSnapshot = handleSave;
    w.__fractpath_dealId = dealId;

    if (containerRef.current) {
      containerRef.current.dispatchEvent(
        new CustomEvent("fractpath:calculator-ready", {
          bubbles: true,
          detail: { dealId, save: handleSave },
        }),
      );
    }

    return () => {
      delete w.__fractpath_saveSnapshot;
      delete w.__fractpath_dealId;
    };
  }, [handleSave, dealId]);

  const roleLabel = isCounterparty ? "Counterparty" : "Owner only";

  return (
    <section className="mt-6 rounded-md border p-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-base font-semibold">Scenario calculator</h2>
        <div className="text-xs text-muted-foreground">{roleLabel}</div>
      </div>

      {error ? (
        <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div
        ref={containerRef}
        data-fractpath-calculator
        data-deal-id={dealId}
        className="mt-4 rounded-md border-2 border-dashed border-muted-foreground/25 p-8 text-center"
      >
        <p className="text-sm text-muted-foreground">
          Calculator widget integration point
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          The FractPath calculator widget will be embedded here. It will call{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
            window.__fractpath_saveSnapshot(snapshot)
          </code>{" "}
          when the user finalises a scenario.
          {isCounterparty ? (
            <span className="block mt-1">
              Submitting will create a counter-proposal for this deal.
            </span>
          ) : null}
        </p>
        {saving ? (
          <p className="mt-3 text-sm font-medium">
            {isCounterparty ? "Submitting counter-proposal…" : "Saving snapshot…"}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export type { DealCalculatorEmbedProps };
