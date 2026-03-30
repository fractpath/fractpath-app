"use client";

import { useState } from "react";
import { CounterOfferModal } from "./CounterOfferModal";

type AnyRecord = Record<string, unknown>;

type Props = {
  proposalId: string;
  currentTerms: AnyRecord | null;
};

export function VoidOwnerCounterSection({ proposalId, currentTerms }: Props) {
  const [counterOpen, setCounterOpen] = useState(false);

  return (
    <div className="space-y-4" data-testid="void-counter-section">
      <div
        className="rounded-md border border-red-300 bg-red-50 p-4 dark:border-red-700 dark:bg-red-950"
        data-testid="void-counter-banner"
      >
        <p className="text-sm font-semibold text-red-900 dark:text-red-100">
          Accepted terms are void — propose revised terms to continue
        </p>
        <p className="text-xs text-red-800 dark:text-red-200 mt-1.5">
          The enhanced valuation confirmed these deal terms exceed the eligible
          threshold. Those terms are no longer executable. You can propose
          revised terms below to restart the negotiation on a new basis.
          The other party will be notified and can review your revised offer.
        </p>
      </div>

      {!counterOpen && (
        <div>
          <button
            type="button"
            onClick={() => setCounterOpen(true)}
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
            data-testid="void-propose-revised-terms"
          >
            Propose revised terms
          </button>
        </div>
      )}

      {counterOpen && currentTerms && (
        <CounterOfferModal
          open={counterOpen}
          onClose={() => setCounterOpen(false)}
          proposalId={proposalId}
          termsSnapshot={currentTerms}
        />
      )}

      {counterOpen && !currentTerms && (
        <p className="text-sm text-muted-foreground">
          No prior terms snapshot available. Use the deal widget to add terms
          first, then return here to propose.
        </p>
      )}
    </div>
  );
}
