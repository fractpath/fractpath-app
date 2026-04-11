"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";

type VisibilityPreference = "private" | "public";
type ProposalInterestStatus = "not_interested" | "interested" | "open";

type Props = {
  propertyId: string;
  currentVisibility: VisibilityPreference;
  currentProposalStatus: ProposalInterestStatus;
  onClose: () => void;
  onSaved: (updates: {
    visibility_preference: VisibilityPreference;
    proposal_interest_status: ProposalInterestStatus;
  }) => void;
};

const VISIBILITY_OPTIONS: { value: VisibilityPreference; label: string; description: string }[] = [
  {
    value: "private",
    label: "Private",
    description: "Only you and FractPath staff can view this property.",
  },
  {
    value: "public",
    label: "Public",
    description: "Verified buyers can discover this property on the marketplace.",
  },
];

const PROPOSAL_OPTIONS: { value: ProposalInterestStatus; label: string; description: string }[] = [
  {
    value: "not_interested",
    label: "Not interested",
    description: "Do not send me proposals at this time.",
  },
  {
    value: "interested",
    label: "Interested",
    description: "I am open to receiving structured proposals from FractPath.",
  },
  {
    value: "open",
    label: "Open to offers",
    description: "Actively exploring my options — please prioritize outreach.",
  },
];

export function PropertySettingsModal({
  propertyId,
  currentVisibility,
  currentProposalStatus,
  onClose,
  onSaved,
}: Props) {
  const [visibility, setVisibility] = useState<VisibilityPreference>(currentVisibility);
  const [proposalStatus, setProposalStatus] = useState<ProposalInterestStatus>(currentProposalStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty =
    visibility !== currentVisibility || proposalStatus !== currentProposalStatus;

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/me/properties/${propertyId}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visibility_preference: visibility,
        proposal_interest_status: proposalStatus,
      }),
    });
    if (res.ok) {
      onSaved({
        visibility_preference: visibility,
        proposal_interest_status: proposalStatus,
      });
      onClose();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to save settings. Please try again.");
    }
    setSaving(false);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Property settings"
      description="Control how this property appears and whether you receive proposals."
      size="md"
      primaryLabel="Save changes"
      primaryLoading={saving}
      primaryDisabled={!isDirty}
      onPrimary={handleSave}
      secondaryLabel="Cancel"
      onSecondary={onClose}
    >
      <div className="space-y-5">
        {/* ── Visibility ────────────────────────────────────────────────────── */}
        <fieldset>
          <legend className="text-sm font-semibold mb-2">Listing visibility</legend>
          <div className="space-y-2">
            {VISIBILITY_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  visibility === opt.value
                    ? "border-foreground bg-muted/50"
                    : "hover:bg-muted/30"
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  value={opt.value}
                  checked={visibility === opt.value}
                  onChange={() => setVisibility(opt.value)}
                  className="mt-0.5 accent-foreground"
                />
                <div>
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {opt.description}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </fieldset>

        {/* ── Proposal interest ──────────────────────────────────────────────── */}
        <fieldset>
          <legend className="text-sm font-semibold mb-2">Proposal preference</legend>
          <div className="space-y-2">
            {PROPOSAL_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  proposalStatus === opt.value
                    ? "border-foreground bg-muted/50"
                    : "hover:bg-muted/30"
                }`}
              >
                <input
                  type="radio"
                  name="proposalStatus"
                  value={opt.value}
                  checked={proposalStatus === opt.value}
                  onChange={() => setProposalStatus(opt.value)}
                  className="mt-0.5 accent-foreground"
                />
                <div>
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {opt.description}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </fieldset>

        {/* ── Error ─────────────────────────────────────────────────────────── */}
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
