"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AddressTypeahead,
  type ResolvedProperty,
} from "@/components/threads/AddressTypeahead";
import { Modal } from "@/components/ui/Modal";

type Mode = "investor" | "owner";

/**
 * Context:
 * - "profile": default to OWNER segment
 * - "deal": default to INVESTOR segment
 */
type Props = {
  open: boolean;
  onClose: () => void;

  context: "profile" | "deal";

  onResolved: (r: ResolvedProperty & ResolveExtras) => void;

  initialMode?: Mode;
};

type ResolveExtras = {
  normalized_address?: string | null;
  claimed_by_user_id?: string | null;

  property_exists?: boolean | null;
  has_blocking_deal?: boolean | null;
  blocking_reason?: string | null;
};

function Segmented({
  value,
  onChange,
  disabled,
}: {
  value: Mode;
  onChange: (v: Mode) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex rounded-md border bg-white p-1 text-sm">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("investor")}
        className={`rounded px-3 py-1 ${
          value === "investor" ? "bg-muted font-medium" : "hover:bg-muted/50"
        }`}
      >
        Investor
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("owner")}
        className={`rounded px-3 py-1 ${
          value === "owner" ? "bg-muted font-medium" : "hover:bg-muted/50"
        }`}
      >
        Owner
      </button>
    </div>
  );
}

function statusCopy(r: ResolvedProperty & ResolveExtras) {
  if (r.has_blocking_deal) {
    return {
      tone: "error" as const,
      title: "This property already has an active opportunity",
      body:
        r.blocking_reason ??
        "There's already an active or pending agreement workflow on this property. A new offer can't be started until the existing agreement is closed and the payout is completed.",
    };
  }

  if (r.property_status === "verified") {
    return {
      tone: "success" as const,
      title: "Property verified",
      body: "This home is verified in FractPath and can receive offers. Next step: invite the homeowner to review and accept an offer.",
    };
  }

  if (r.property_exists) {
    if (r.ownership_status === "unclaimed") {
      return {
        tone: "info" as const,
        title: "Property found — owner not connected yet",
        body: "This address is already in FractPath, but no homeowner has claimed it yet. To proceed with an offer, the homeowner must join, claim the home, and complete verification.",
      };
    }

    if (r.ownership_status === "claimed" && r.property_status !== "verified") {
      return {
        tone: "info" as const,
        title: "Property claimed — verification pending",
        body: "A homeowner is connected to this address, but verification is not complete. Offers can be drafted, but nothing can be accepted until the homeowner completes verification.",
      };
    }

    return {
      tone: "info" as const,
      title: "Property found",
      body: "We found this address in FractPath. Next step depends on whether the homeowner is connected and verified.",
    };
  }

  return {
    tone: "success" as const,
    title: "Property added",
    body: "We added this address to FractPath. To accept an offer, the homeowner must join, claim the home, and complete verification. FractPath can help connect both parties.",
  };
}

export function PropertyCaptureModal({
  open,
  onClose,
  context,
  onResolved,
  initialMode,
}: Props) {
  const defaultMode: Mode =
    initialMode ?? (context === "profile" ? "owner" : "investor");

  const [mode, setMode] = useState<Mode>(defaultMode);
  const [resolved, setResolved] = useState<
    (ResolvedProperty & ResolveExtras) | null
  >(null);
  const [ownerNoteChecked, setOwnerNoteChecked] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(defaultMode);
    setResolved(null);
    setOwnerNoteChecked(false);
  }, [open, defaultMode]);

  const headline =
    context === "profile" ? "Add a property" : "Add a property to this deal";

  const investorMicrocopy = useMemo(() => {
    return (
      <div className="text-sm text-muted-foreground">
        You're adding an address to draft an offer.{" "}
        <span className="font-medium text-foreground">
          Nothing is binding until all parties sign a formal agreement.
        </span>{" "}
        To accept an offer, the homeowner must claim the home and complete
        verification.
      </div>
    );
  }, []);

  const ownerMicrocopy = useMemo(() => {
    return (
      <div className="text-sm text-muted-foreground">
        You're adding a home you own. To unlock full features, you'll complete a
        quick verification step after saving the address.
      </div>
    );
  }, []);

  const status = resolved ? statusCopy(resolved) : null;

  const canSubmit =
    !!resolved?.property_id && (mode !== "owner" || ownerNoteChecked);

  const footerContent = (
    <div className="flex items-center justify-between gap-3">
      <div className="text-xs text-muted-foreground">
        {resolved?.property_id ? (
          <>
            Property ID:{" "}
            <span className="font-mono">{resolved.property_id}</span>
          </>
        ) : (
          "Select an address to continue."
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted/50"
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          className="rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
          disabled={!canSubmit}
          onClick={() => {
            if (!resolved) return;
            onResolved(resolved);
            onClose();
          }}
          data-testid={
            context === "deal"
              ? "deal-add-property-submit"
              : "profile-add-property-submit"
          }
        >
          Add property
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={headline}
      description="Use the address search to select a canonical property record."
      size="lg"
      footer={footerContent}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Segmented value={mode} onChange={setMode} />
          <div className="text-xs text-muted-foreground">
            {mode === "investor" ? "Draft an offer" : "Claim & verify"}
          </div>
        </div>

        {mode === "investor" ? investorMicrocopy : ownerMicrocopy}

        <AddressTypeahead
          onResolved={(r) => {
            const merged: ResolvedProperty & ResolveExtras = {
              property_id: r.property_id,
              display_address: r.display_address,
              property_status: r.property_status ?? null,
              ownership_status: r.ownership_status ?? null,
              normalized_address: r.normalized_address ?? null,
              claimed_by_user_id: r.claimed_by_user_id ?? null,
              property_exists: r.property_exists ?? null,
              has_blocking_deal: r.has_blocking_deal ?? null,
              blocking_reason: r.blocking_reason ?? null,
            };
            setResolved(merged);
          }}
          inputTestId={
            context === "deal"
              ? "deal-address-input"
              : "profile-address-input"
          }
          placeholder="Search street address…"
          showLabel={false}
        />

        {mode === "owner" ? (
          <div className="rounded-md border bg-muted/20 p-3 text-sm">
            <div className="font-medium">Owner verification</div>
            <div className="mt-1 text-muted-foreground">
              After saving the address, you'll be guided to upload
              verification documents. (No offers can be accepted until
              verification is complete.)
            </div>

            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={ownerNoteChecked}
                onChange={(e) => setOwnerNoteChecked(e.target.checked)}
              />
              I understand verification is required.
            </label>
          </div>
        ) : null}

        {status ? (
          <div
            className={`rounded-md border p-3 text-sm ${
              status.tone === "success"
                ? "bg-green-50"
                : status.tone === "error"
                  ? "bg-red-50"
                  : "bg-blue-50"
            }`}
          >
            <div className="font-medium">{status.title}</div>
            <div className="mt-1 text-muted-foreground">{status.body}</div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
