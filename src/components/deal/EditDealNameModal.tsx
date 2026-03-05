"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";

type Props = {
  open: boolean;
  onClose: () => void;
  dealId: string;
  currentTitle: string;
  onSaved: (newTitle: string) => void;
};

export function EditDealNameModal({
  open,
  onClose,
  dealId,
  currentTitle,
  onSaved,
}: Props) {
  const [value, setValue] = useState(currentTitle);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpen() {
    setValue(currentTitle);
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/deals/${dealId}/header`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: value.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? `Save failed (${res.status})`);
        return;
      }
      onSaved(value.trim());
      onClose();
    } catch {
      setError("Network error — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit Deal Name"
      primaryLabel={saving ? "Saving..." : "Save"}
      primaryLoading={saving}
      primaryDisabled={!value.trim()}
      onPrimary={handleSave}
      secondaryLabel="Cancel"
      onSecondary={onClose}
    >
      <div className="space-y-3">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Deal name..."
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1"
          autoFocus
          onFocus={() => handleOpen()}
        />
        {error && (
          <div className="text-xs text-red-600">{error}</div>
        )}
      </div>
    </Modal>
  );
}
