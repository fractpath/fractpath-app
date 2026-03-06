"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";

type Props = {
  open: boolean;
  onClose: () => void;
  dealId: string;
};

export function ArchiveDealModal({ open, onClose, dealId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleArchive() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/deals/${dealId}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = await res.json().catch(() => ({ ok: false, error: "Invalid response" }));
      if (!res.ok || body.ok !== true) {
        throw new Error(body.error ?? `Archive failed (${res.status})`);
      }
      onClose();
      router.push("/dashboard");
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

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
          Archiving removes this deal from your dashboard and revokes your access.
          Records are retained for compliance. This cannot be undone from your account.
        </p>
        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
        <button
          type="button"
          disabled={loading}
          onClick={handleArchive}
          className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {loading ? "Archiving…" : "Archive"}
        </button>
      </div>
    </Modal>
  );
}
