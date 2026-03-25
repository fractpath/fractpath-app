"use client";

import { Modal } from "@/components/ui/Modal";
import { ThreadActionPanel } from "@/components/threads/ThreadActionPanel";

type Props = {
  open: boolean;
  onClose: () => void;
  threadId: string;
  threadStatus: string;
  proposalId: string | null;
  proposalStatus: string | null;
};

export function OwnerDecisionModal({
  open,
  onClose,
  threadId,
  threadStatus,
  proposalId,
  proposalStatus,
}: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Review offer and decide"
    >
      <div className="space-y-4">
        <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
          <p>
            Accepting means you are agreeing in principle to the economic terms
            shown on this page.
          </p>
          <p>
            <span className="font-medium">Next steps:</span> FractPath will
            review the file, may request additional information, and will
            contact you with the next step in the process.
          </p>
          <p className="text-xs text-gray-500">
            You can still cancel before final contract execution.
          </p>
        </div>

        <ThreadActionPanel
          threadId={threadId}
          threadStatus={threadStatus}
          isOwner={true}
          proposalId={proposalId}
          proposalStatus={proposalStatus}
        />
      </div>
    </Modal>
  );
}
