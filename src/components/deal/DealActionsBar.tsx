"use client";

import { useState } from "react";
import { SubmitOfferModal } from "@/components/deal/SubmitOfferModal";
import { ShareDealModal } from "@/components/deal/ShareDealModal";
import { ArchiveDealModal } from "@/components/deal/ArchiveDealModal";

type Props = {
  dealId: string;
  propertyId: string | null;
  locked: boolean;
  readOnly: boolean;
};

export function DealActionsBar({ dealId, propertyId, locked, readOnly }: Props) {
  const [openSubmit, setOpenSubmit] = useState(false);
  const [openShare, setOpenShare] = useState(false);
  const [openArchive, setOpenArchive] = useState(false);

  const isDisabled = readOnly || locked;
  const canSubmit = !!propertyId && !isDisabled;

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpenSubmit(true)}
          disabled={!canSubmit}
          className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
          data-testid="deal-action-submit"
          title={
            locked
              ? "Offer already pending"
              : !propertyId
                ? "Add a property first"
                : undefined
          }
        >
          Submit offer
        </button>

        <button
          type="button"
          onClick={() => setOpenShare(true)}
          disabled={isDisabled}
          className="rounded-md border bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          data-testid="deal-action-share"
        >
          Share
        </button>

        <button
          type="button"
          onClick={() => setOpenArchive(true)}
          className="rounded-md border bg-white px-3 py-1.5 text-sm font-medium"
          data-testid="deal-action-archive"
        >
          Archive
        </button>
      </div>

      <SubmitOfferModal
        open={openSubmit}
        onClose={() => setOpenSubmit(false)}
        dealId={dealId}
        propertyId={propertyId}
      />

      <ShareDealModal
        open={openShare}
        onClose={() => setOpenShare(false)}
        dealId={dealId}
      />

      <ArchiveDealModal
        open={openArchive}
        onClose={() => setOpenArchive(false)}
      />
    </>
  );
}
