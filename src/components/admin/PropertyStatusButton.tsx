"use client";

import { useState } from "react";

type Props = {
  propertyId: string;
  currentStatus: string;
  targetStatus: string;
  label: string;
};

export function PropertyStatusButton({
  propertyId,
  currentStatus,
  targetStatus,
  label,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (currentStatus === targetStatus) return null;

  async function handleClick() {
    if (loading || done) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/properties/${propertyId}/set-status`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: targetStatus }),
        },
      );
      if (res.ok) {
        setDone(true);
        window.location.reload();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading || done}
      className="text-xs px-2 py-1 rounded border hover:bg-muted disabled:opacity-50"
    >
      {loading ? "…" : done ? "Done" : label}
    </button>
  );
}
