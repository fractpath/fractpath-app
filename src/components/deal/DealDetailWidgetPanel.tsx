"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { normalizeDealTermsForWidget } from "@/lib/normalizeDealTermsForWidget";
import { DealWidgetShell } from "@/components/deal/DealWidgetShell";

type AnyRecord = Record<string, unknown>;

type DealDetailWidgetPanelProps = {
  dealId: string;
  initialSnapshot?: AnyRecord | null;
  inputs: AnyRecord | null;
  results: AnyRecord | null;
  computeVersion?: string | null;
  canEdit: boolean;
  persona?: string;
};

function safeRecord(v: unknown): AnyRecord | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as AnyRecord)
    : null;
}

export function DealDetailWidgetPanel({
  dealId,
  initialSnapshot,
  inputs,
  results,
  computeVersion,
  canEdit,
  persona = "homeowner",
}: DealDetailWidgetPanelProps) {
  const router = useRouter();

  const seedSnapshot = useMemo(() => {
    const snap = safeRecord(initialSnapshot);
    if (snap) return snap;

    const inRec = safeRecord(inputs);
    const outRec = safeRecord(results);
    if (!inRec && !outRec) return null;

    let normalizedInputs: AnyRecord | null = inRec;
    if (
      inRec &&
      safeRecord((inRec as any).deal_terms) &&
      safeRecord((inRec as any).scenario)
    ) {
      const dealTerms = (inRec as any).deal_terms as AnyRecord;
      const scenario = (inRec as any).scenario as AnyRecord;
      normalizedInputs = {
        ...(inRec as any),
        deal_terms: normalizeDealTermsForWidget(dealTerms),
        scenario,
      };
    }

    return {
      inputs: normalizedInputs ?? null,
      outputs: { results: outRec ?? null },
      compute_version: computeVersion ?? null,
      schema_version: (initialSnapshot as any)?.schema_version ?? null,
    } as AnyRecord;
  }, [initialSnapshot, inputs, results, computeVersion]);

  const handleSave = useCallback(
    async (parsed: { deal_terms: AnyRecord; scenario: AnyRecord }) => {
      let header: AnyRecord | undefined;
      try {
        const raw = localStorage.getItem(`fractpath:deal:${dealId}:header`);
        if (raw) {
          const h = JSON.parse(raw);
          if (h && typeof h === "object") {
            header = {};
            if (typeof h.title === "string") header.title = h.title;
            if (typeof h.display_address === "string") header.display_address = h.display_address;
            if (typeof h.property_id === "string") header.property_id = h.property_id;
            if (typeof h.property_status === "string") header.property_status = h.property_status;
            if (typeof h.ownership_status === "string") header.ownership_status = h.ownership_status;
          }
        }
      } catch { /* ignore */ }

      const payload: AnyRecord = { inputs: parsed };
      if (header) payload.header = header;

      const res = await fetch(`/api/deals/${dealId}/snapshot/compute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await res
        .json()
        .catch(() => ({ ok: false, error: "Invalid response" }));
      if (!res.ok || body.ok === false) {
        throw new Error(body.error ?? `Save failed (${res.status})`);
      }

      router.refresh();
    },
    [dealId, router],
  );

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Scenario Details</h2>
        {!canEdit ? (
          <span className="text-xs text-muted-foreground">Owner only</span>
        ) : null}
      </div>

      <DealWidgetShell
        initialSnapshot={seedSnapshot}
        canEdit={canEdit}
        persona={persona}
        onSave={canEdit ? handleSave : undefined}
      />
    </section>
  );
}
