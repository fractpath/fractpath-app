"use client";

import { useState } from "react";
import { OwnerDecisionBanner } from "./OwnerDecisionBanner";
import { OwnerDecisionModal } from "./OwnerDecisionModal";

type Props = {
  threadId: string;
  threadStatus: string;
  proposalId: string | null;
  proposalStatus: string | null;
};

export function OwnerDecisionSection({
  threadId,
  threadStatus,
  proposalId,
  proposalStatus,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <OwnerDecisionBanner onReviewClick={() => setModalOpen(true)} />
      <OwnerDecisionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        threadId={threadId}
        threadStatus={threadStatus}
        proposalId={proposalId}
        proposalStatus={proposalStatus}
      />
    </>
  );
}
