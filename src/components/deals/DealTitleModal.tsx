"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";

export function DealTitleModal({
  open,
  onClose,
  initialTitle,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  initialTitle: string;
  onSave: (title: string) => void;
}) {
  const [title, setTitle] = useState(initialTitle);

  useEffect(() => {
    if (!open) return;
    setTitle(initialTitle);
  }, [open, initialTitle]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit deal title"
      primaryLabel="Save"
      onPrimary={() => {
        onSave(title);
        onClose();
      }}
      secondaryLabel="Cancel"
    >
      <label className="mb-1 block text-sm font-medium text-gray-700">
        Deal title
      </label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded-md border px-3 py-2 text-sm"
        placeholder="Name this deal…"
        data-testid="deal-title-modal-input"
      />
    </Modal>
  );
}
