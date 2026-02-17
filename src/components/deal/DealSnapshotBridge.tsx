"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { normalizeWidgetPayload } from "@/lib/normalizeWidgetPayload";

type BridgeStatus = "idle" | "saving" | "success" | "error" | "disabled";

type SaveResult = {
  ok: true;
  snapshot_id: string;
  deal_id: string;
  computed_at: string;
} | {
  ok: false;
  error: string;
  code?: string;
};

interface DealSnapshotBridgeProps {
  dealId: string;
  enabled: boolean;
}

export function DealSnapshotBridge({ dealId, enabled }: DealSnapshotBridgeProps) {
  const [status, setStatus] = useState<BridgeStatus>(enabled ? "idle" : "disabled");
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSaveAt, setLastSaveAt] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);
  const dealIdRef = useRef(dealId);
  dealIdRef.current = dealId;

  const handleSave = useCallback(async (payload: unknown): Promise<SaveResult> => {
    const currentDealId = dealIdRef.current;
    setStatus("saving");
    setLastError(null);

    try {
      const normalized = normalizeWidgetPayload(payload);

      const res = await fetch(`/api/deals/${currentDealId}/snapshot/compute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: normalized }),
      });

      const body = await res.json().catch(() => ({ ok: false, error: "Invalid server response" }));

      if (!res.ok || body.ok === false) {
        const errorMsg = body.error ?? `Save failed (${res.status})`;
        setStatus("error");
        setLastError(errorMsg);
        return { ok: false, error: errorMsg, code: String(res.status) };
      }

      const result: SaveResult = {
        ok: true,
        snapshot_id: body.snapshot_id ?? "",
        deal_id: currentDealId,
        computed_at: body.computed_at ?? new Date().toISOString(),
      };

      setStatus("success");
      setLastSaveAt(result.computed_at);
      setLastError(null);

      return result;
    } catch (err: any) {
      const errorMsg = err.message ?? "Network error";
      setStatus("error");
      setLastError(errorMsg);
      return { ok: false, error: errorMsg, code: "NETWORK_ERROR" };
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setStatus("disabled");
      return;
    }

    setStatus("idle");

    const w = window as any;
    w.__fractpath_saveSnapshot = handleSave;
    w.__fractpath_dealId = dealId;

    return () => {
      delete w.__fractpath_saveSnapshot;
      delete w.__fractpath_dealId;
    };
  }, [enabled, handleSave, dealId]);

  const handleSimulate = useCallback(async () => {
    setSimulating(true);
    try {
      const result = await handleSave({
        deal_terms: {
          property_value: 500000,
          upfront_payment: 50000,
          monthly_payment: 0,
          number_of_payments: 0,
          payback_window_start_year: 3,
          payback_window_end_year: 7,
          timing_factor_early: 0.5,
          timing_factor_late: 1.5,
          floor_multiple: 1.0,
          ceiling_multiple: 3.0,
          downside_mode: "HARD_FLOOR",
          contract_maturity_years: 10,
          liquidity_trigger_year: 5,
          minimum_hold_years: 2,
          platform_fee: 0,
          servicing_fee_monthly: 0,
          exit_fee_pct: 0,
        },
        scenario: {
          annual_appreciation: 0.03,
          closing_cost_pct: 0.06,
          exit_year: 5,
        },
      });
      if (result.ok) {
        setTimeout(() => window.location.reload(), 800);
      }
    } finally {
      setSimulating(false);
    }
  }, [handleSave]);

  const isDev = process.env.NODE_ENV !== "production";

  const statusColor =
    status === "success" ? "text-green-700 dark:text-green-400" :
    status === "error" ? "text-red-700 dark:text-red-400" :
    status === "saving" ? "text-amber-700 dark:text-amber-400" :
    status === "disabled" ? "text-muted-foreground" :
    "text-muted-foreground";

  const statusLabel =
    status === "success" ? "connected (last save OK)" :
    status === "error" ? "error" :
    status === "saving" ? "saving..." :
    status === "disabled" ? "disabled (read-only)" :
    "connected";

  return (
    <section className="mt-4 rounded-md border border-dashed p-3">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-sm font-medium">Widget bridge status</h3>
        <span className={`text-xs font-medium ${statusColor}`}>
          Bridge: {statusLabel}
        </span>
      </div>

      {lastError ? (
        <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-800 dark:bg-red-950 dark:text-red-200">
          {lastError}
        </div>
      ) : null}

      {lastSaveAt ? (
        <div className="mt-1 text-xs text-muted-foreground">
          Last save: {new Date(lastSaveAt).toLocaleString()}
        </div>
      ) : null}

      {!enabled ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Read-only mode: cannot save snapshots.
        </p>
      ) : null}

      {enabled && isDev ? (
        <button
          type="button"
          onClick={handleSimulate}
          disabled={simulating || status === "saving"}
          className="mt-2 rounded-md bg-muted px-3 py-1.5 text-xs font-medium hover:bg-muted/80 disabled:opacity-50"
        >
          {simulating ? "Simulating..." : "Simulate widget save"}
        </button>
      ) : null}
    </section>
  );
}
