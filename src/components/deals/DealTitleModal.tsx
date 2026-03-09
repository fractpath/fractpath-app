"use client";

import { useEffect, useState } from "react";

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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-md bg-white shadow-xl">
        <div className="flex items-center justify-between border-b p-4">
          <div className="text-base font-semibold">Edit deal title</div>
          <button
            className="rounded-md border px-2 py-1 text-sm"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="p-4">
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
        </div>

        <div className="flex items-center justify-end gap-2 border-t p-4">
          <button
            className="rounded-md border px-3 py-2 text-sm"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
            onClick={() => {
              onSave(title);
              onClose();
            }}
            data-testid="deal-title-modal-save"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
