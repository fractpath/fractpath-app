"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type NewDealClientProps = {
  persona: string;
};

export function NewDealClient({ persona }: NewDealClientProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(true);

  useEffect(() => {
    try {
      localStorage.removeItem("fractpath:deal:new:header");
    } catch {}

    let cancelled = false;

    async function createDeal() {
      try {
        const res = await fetch("/api/deals/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });

        const body = await res
          .json()
          .catch(() => ({ ok: false, error: "Invalid response" }));

        if (cancelled) return;

        if (!res.ok || body.ok === false) {
          throw new Error(body.error ?? `Create failed (${res.status})`);
        }

        router.push(body.redirect_url ?? "/dashboard");
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? "Failed to create deal");
          setCreating(false);
        }
      }
    }

    createDeal();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">New Deal</h1>
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setCreating(true);
            window.location.reload();
          }}
          className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted/50"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="animate-pulse text-sm text-muted-foreground">
        Creating your deal...
      </div>
    </div>
  );
}
