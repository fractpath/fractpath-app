"use client";

import { DraftDealProjectionPanel } from "@/components/deal/DraftDealProjectionPanel";
import { AcceptedDealStatusPanel } from "@/components/deal/AcceptedDealStatusPanel";

type AnyRecord = Record<string, unknown>;

type DealDetailWidgetPanelProps = {
  dealId: string;
  initialSnapshot?: AnyRecord | null;
  inputs: AnyRecord | null;
  results: AnyRecord | null;
  computeVersion?: string | null;
  canEdit: boolean;
  persona?: string;
  /**
   * True when the deal thread is in "accepted" or "closed" state.
   * Renders the accepted-deal status panel instead of the draft projection panel.
   */
  isAccepted?: boolean;
  /**
   * Canonical workflow stage from the server-side lifecycle engine.
   * Forwarded to AcceptedDealStatusPanel for plain-language status labeling.
   */
  canonicalStage?: string | null;
  /**
   * ISO timestamp of the acceptance event.
   * Derived server-side from deal_events (OFFER_ACCEPTED → DEAL_ACCEPTED).
   * Null when no acceptance event is recorded.
   * Forwarded to AcceptedDealStatusPanel for contract year / time-based status.
   */
  acceptedAt?: string | null;
};

/**
 * Lifecycle-gated dispatcher.
 *
 * Lifecycle rule (plain English):
 *   - isAccepted=false → draft / pre-accepted → DraftDealProjectionPanel
 *   - isAccepted=true  → accepted / active    → AcceptedDealStatusPanel
 *
 * The isAccepted flag is computed by the page from thread status:
 *   ["accepted", "closed"].includes(threadStatus)
 */
export function DealDetailWidgetPanel({
  dealId,
  initialSnapshot,
  inputs,
  results,
  computeVersion,
  canEdit,
  persona = "homeowner",
  isAccepted = false,
  canonicalStage = null,
  acceptedAt = null,
}: DealDetailWidgetPanelProps) {
  if (isAccepted) {
    return (
      <AcceptedDealStatusPanel
        dealId={dealId}
        initialSnapshot={initialSnapshot}
        inputs={inputs}
        results={results}
        computeVersion={computeVersion}
        persona={persona}
        canonicalStage={canonicalStage}
        acceptedAt={acceptedAt}
      />
    );
  }

  return (
    <DraftDealProjectionPanel
      dealId={dealId}
      initialSnapshot={initialSnapshot}
      inputs={inputs}
      results={results}
      computeVersion={computeVersion}
      canEdit={canEdit}
      persona={persona}
    />
  );
}
