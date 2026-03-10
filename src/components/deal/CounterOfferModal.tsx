"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DealEditModal as EditModalMount } from "fractpath-calculator-widget";
import { normalizeDealTermsForWidget } from "@/lib/normalizeDealTermsForWidget";
import { usePageLoading } from "@/components/ui/PageLoadingOverlay";

type AnyRecord = Record<string, unknown>;

function safeRecord(v: unknown): AnyRecord | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as AnyRecord)
    : null;
}

function safeNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

type Props = {
  open: boolean;
  onClose: () => void;
  proposalId: string;
  termsSnapshot: AnyRecord;
};

export function CounterOfferModal({
  open,
  onClose,
  proposalId,
  termsSnapshot,
}: Props) {
  const router = useRouter();
  const pageLoading = usePageLoading();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const snap = useMemo(() => safeRecord(termsSnapshot), [termsSnapshot]);

  const modalInitial = useMemo(() => {
    const nestedInputs = safeRecord((snap as any)?.inputs);
    const sourceDealTerms =
      safeRecord((nestedInputs as any)?.deal_terms) ??
      safeRecord((snap as any)?.deal_terms) ??
      {};

    const sourceScenario =
      safeRecord((nestedInputs as any)?.scenario) ??
      safeRecord((snap as any)?.scenario) ??
      {};

    return {
      deal_terms: normalizeDealTermsForWidget(sourceDealTerms),
      scenario: {
        ...sourceScenario,
        exit_year: safeNumber((sourceScenario as any)?.exit_year) ?? 5,
      },
    };
  }, [snap]);

  const handleSaved = useCallback(
    async (saved: { deal_terms: AnyRecord; scenario: AnyRecord }) => {
      setBusy(true);
      setError(null);
      pageLoading.show("Sending counter-offer…");

      try {
        const counterTerms = {
          deal_terms: normalizeDealTermsForWidget(
            safeRecord(saved?.deal_terms) ?? {},
          ),
          scenario: safeRecord(saved?.scenario) ?? { exit_year: 5 },
        };

        const res = await fetch(`/api/proposals/${proposalId}/counter`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ terms_snapshot: counterTerms }),
        });

        const body = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(body?.error ?? `Counter failed (${res.status})`);
        }

        onClose();
        router.refresh();
      } catch (err: any) {
        setError(err?.message ?? "Network error");
      } finally {
        setBusy(false);
        pageLoading.hide();
      }
    },
    [proposalId, onClose, router, pageLoading],
  );

  if (!open) return null;

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">
        Adjust the economic terms below and send your counter-offer. Property
        identity and participants cannot be changed here.
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      {busy && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
          Sending counter-offer...
        </div>
      )}

      <EditModalMount
        initial={modalInitial as any}
        persona={"buyer" as any}
        onClose={onClose}
        onSaved={handleSaved as any}
      />
    </div>
  );
}
