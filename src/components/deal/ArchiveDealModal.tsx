"use client";

import { Modal } from "@/components/ui/Modal";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function ArchiveDealModal({ open, onClose }: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Archive this deal?"
      secondaryLabel="Cancel"
      onSecondary={onClose}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          This hides it from your dashboard but we retain records for compliance.
        </p>
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background opacity-50 cursor-not-allowed"
          title="Archive functionality is coming soon"
        >
          Archive
        </button>
        <p className="text-xs text-muted-foreground">
          Archive functionality is coming soon.
        </p>
      </div>
    </Modal>
  );
}
