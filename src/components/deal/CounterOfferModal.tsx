"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DealEditModal } from "fractpath-calculator-widget";
import { normalizeDealTermsForWidget } from "@/lib/normalizeDealTermsForWidget";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modalInitial = useMemo(() => {
    const rawDealTerms = safeRecord(termsSnapshot?.deal_terms) ?? {};
    const rawScenario = safeRecord(termsSnapshot?.scenario) ?? {};

    const dealTerms = normalizeDealTermsForWidget(rawDealTerms);

    return {
      deal_terms: dealTerms,
      scenario: {
        ...rawScenario,
        exit_year: safeNumber(rawScenario?.exit_year) ?? 5,
      },
    };
  }, [termsSnapshot]);

  const handleSaved = useCallback(
    async (saved: { deal_terms: AnyRecord; scenario: AnyRecord }) => {
      setBusy(true);
      setError(null);
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
      }
    },
    [proposalId, onClose, router],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-lg border bg-white p-6 shadow-lg dark:bg-gray-950">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Counter-Offer</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            &#x2715;
          </button>
        </div>

        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Adjust the economic terms below and send your counter-offer.
          Property identity and participants cannot be changed.
        </p>

        {error && (
          <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        )}

        {busy && (
          <div className="mb-3 flex items-center gap-2 text-sm text-gray-600">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
            Sending counter-offer...
          </div>
        )}

        <DealEditModal
          initial={modalInitial as any}
          persona="buyer"
          onClose={onClose}
          onSaved={handleSaved as any}
        />
      </div>
    </div>
  );
}
