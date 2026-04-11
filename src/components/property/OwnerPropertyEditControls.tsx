"use client";

import { useState } from "react";
import { PropertySettingsModal } from "@/components/property/PropertySettingsModal";
import { SuggestPropertyDetailUpdateModal } from "@/components/property/SuggestPropertyDetailUpdateModal";
import type { PropertyFactCorrection } from "@/lib/property/photos";

type VisibilityPreference = "private" | "public";
type ProposalInterestStatus = "not_interested" | "interested" | "open";

type Props = {
  propertyId: string;
  currentVisibility: VisibilityPreference;
  currentProposalStatus: ProposalInterestStatus;
  initialCorrections: PropertyFactCorrection[];
  canonicalValues: Record<string, string | number | null>;
  propertyStatus: string;
};

const VISIBILITY_LABEL: Record<VisibilityPreference, string> = {
  private: "Private",
  public: "Public",
};

const PROPOSAL_LABEL: Record<ProposalInterestStatus, string> = {
  not_interested: "Not receiving proposals",
  interested: "Interested in proposals",
  open: "Open to offers",
};

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
      />
    </svg>
  );
}

export function OwnerPropertyEditControls({
  propertyId,
  currentVisibility,
  currentProposalStatus,
  initialCorrections,
  canonicalValues,
  propertyStatus,
}: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [visibility, setVisibility] =
    useState<VisibilityPreference>(currentVisibility);
  const [proposalStatus, setProposalStatus] =
    useState<ProposalInterestStatus>(currentProposalStatus);
  const [corrections, setCorrections] =
    useState<PropertyFactCorrection[]>(initialCorrections);

  const pendingCount = corrections.filter(
    (c) => c.review_status === "pending",
  ).length;
  const isArchived = propertyStatus === "archived";

  return (
    <>
      <div className="rounded-xl border bg-muted/20 px-4 py-3 flex flex-wrap items-center gap-4">
        {/* Visibility / proposal summary */}
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Visibility:</span>
            <span className="font-medium">{VISIBILITY_LABEL[visibility]}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">Proposals:</span>
            <span className="font-medium">{PROPOSAL_LABEL[proposalStatus]}</span>
          </div>
          {pendingCount > 0 && (
            <p className="text-xs text-amber-700">
              {pendingCount} correction suggestion
              {pendingCount !== 1 ? "s" : ""} pending review
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-none">
          <button
            type="button"
            disabled={isArchived}
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <SettingsIcon className="w-4 h-4" />
            Settings
          </button>

          <button
            type="button"
            disabled={isArchived}
            onClick={() => setCorrectionOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PencilIcon className="w-4 h-4" />
            Suggest correction
          </button>
        </div>
      </div>

      {settingsOpen && (
        <PropertySettingsModal
          propertyId={propertyId}
          currentVisibility={visibility}
          currentProposalStatus={proposalStatus}
          onClose={() => setSettingsOpen(false)}
          onSaved={(updates) => {
            setVisibility(updates.visibility_preference);
            setProposalStatus(updates.proposal_interest_status);
          }}
        />
      )}

      {correctionOpen && (
        <SuggestPropertyDetailUpdateModal
          propertyId={propertyId}
          existingCorrections={corrections}
          canonicalValues={canonicalValues}
          onClose={() => setCorrectionOpen(false)}
          onSubmitted={(c) => setCorrections((prev) => [c, ...prev])}
        />
      )}
    </>
  );
}
