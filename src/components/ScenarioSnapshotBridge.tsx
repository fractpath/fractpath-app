"use client";

import { useEffect } from "react";

type FullDealSnapshotV1 = {
  contract_version: string;
  schema_version: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  input_hash?: string;
  output_hash?: string;
  [key: string]: unknown;
};

export function ScenarioSnapshotBridge({ dealId }: { dealId: string }) {
  useEffect(() => {
    // Define the global hook the widget will call
    (window as any).__fractpath_saveSnapshot = async (snapshot: FullDealSnapshotV1) => {
      const res = await fetch(`/api/deals/${dealId}/snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });

      const text = await res.text();
      let body: any = null;
      try { body = JSON.parse(text); } catch {}

      if (!res.ok) {
        throw new Error(body?.error || `Snapshot save failed (${res.status})`);
      }
      return body;
    };

    return () => {
      // Cleanup so navigation between deals doesn't keep the wrong dealId
      try {
        delete (window as any).__fractpath_saveSnapshot;
      } catch {}
    };
  }, [dealId]);

  return null;
}
