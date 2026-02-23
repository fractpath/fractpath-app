"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DealWidgetShell } from "@/components/deal/DealWidgetShell";

type AnyRecord = Record<string, unknown>;

type NewDealClientProps = {
  persona: string;
};

export function NewDealClient({ persona }: NewDealClientProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

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
        const res = await fetch("/api/deals/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inputs: parsed }),
        });

        const body = await res
          .json()
          .catch(() => ({ ok: false, error: "Invalid response" }));

        if (!res.ok || body.ok === false) {
          throw new Error(body.error ?? `Create failed (${res.status})`);
        }

        router.push(body.redirect_url ?? "/dashboard");
      } catch (err: any) {
        setError(err?.message ?? "Failed to create deal");
        setCreating(false);
      }
    },
    [router],
  );

  return (
    <>
      <h1 className="text-2xl font-semibold">Create a new deal</h1>
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
