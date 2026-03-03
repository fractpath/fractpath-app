"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DealHeader } from "@/components/deals/DealHeader";
import { DealWidgetShell } from "@/components/deal/DealWidgetShell";

type AnyRecord = Record<string, unknown>;

type NewDealClientProps = {
  persona: string;
};

export function NewDealClient({ persona }: NewDealClientProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [dealId, setDealId] = useState<string | null>(null);

  const defaultSeed = useMemo<AnyRecord>(
    () => ({
      inputs: { deal_terms: {}, scenario: {} },
      outputs: { results: null },
      compute_version: null,
      schema_version: "1",
    }),
    [],
  );

  const handleSave = useCallback(
    async (parsed: { deal_terms: AnyRecord; scenario: AnyRecord }) => {
      setCreating(true);
      setError(null);

      try {
        let header: AnyRecord | undefined;
        try {
          const raw = localStorage.getItem("fractpath:deal:new:header");
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

        const createPayload: AnyRecord = { inputs: parsed };
        if (header) createPayload.header = header;

        const res = await fetch("/api/deals/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(createPayload),
        });

        const body = await res
          .json()
          .catch(() => ({ ok: false, error: "Invalid response" }));

        if (!res.ok || body.ok === false) {
          throw new Error(body.error ?? `Create failed (${res.status})`);
        }

        if (body.deal_id) setDealId(body.deal_id);
        router.push(body.redirect_url ?? "/dashboard");
      } catch (err: any) {
        setError(err?.message ?? "Failed to create deal");
        setCreating(false);
      }
    },
    [router],
  );

  const tempDealId = dealId ?? "new";

  return (
    <>
      <DealHeader dealId={tempDealId} readOnly={false} />

      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold">New Deal</h1>
      </div>

      <p className="mt-1 text-sm text-muted-foreground">
        Configure your deal terms and scenario, then save to create.
      </p>

      {error ? (
        <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {creating ? (
        <div className="mt-6 rounded-lg border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Creating your deal...
          </p>
        </div>
      ) : (
        <div className="mt-6">
          <DealWidgetShell
            initialSnapshot={defaultSeed}
            canEdit={true}
            persona={persona}
            onSave={handleSave}
          />
        </div>
      )}
    </>
  );
}
