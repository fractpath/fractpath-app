"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { Modal } from "@/components/ui/Modal";

type PropertyStatus = "unverified" | "under_review" | "verified" | "archived";

type Property = {
  id: string;
  address: string;
  status: PropertyStatus;
  visibility: "private" | "public";
};

const STATUS_BADGE: Record<PropertyStatus, { label: string; className: string; hint: string }> = {
  unverified: {
    label: "Unverified",
    className: "bg-yellow-100 text-yellow-800",
    hint: "Not yet reviewed by FractPath",
  },
  under_review: {
    label: "Under review",
    className: "bg-blue-100 text-blue-800",
    hint: "Being reviewed",
  },
  verified: {
    label: "Verified \u2713",
    className: "bg-green-100 text-green-800",
    hint: "Approved for participation",
  },
  archived: {
    label: "Archived",
    className: "bg-gray-100 text-gray-600",
    hint: "No longer active",
  },
};

function canArchive(status: PropertyStatus): boolean {
  return status === "unverified" || status === "verified";
}

export function PropertyList() {
  const t = useToast();
  const [items, setItems] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/me/properties");
      const json = await res.json().catch(() => null);
      if (!res.ok) return t.error(json?.error || "Couldn't load properties.");
      setItems(json?.properties ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function archiveNow(id: string) {
    if (archiving) return;
    setArchiving(true);
    try {
      const res = await fetch(`/api/me/properties/${id}/archive`, {
        method: "POST",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok)
        return t.error(json?.error || "Couldn't archive that — try again.");
      t.success("Archived.");
      setArchiveId(null);
      await load();
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-muted-foreground">No properties yet.</div>
      ) : (
        <ul className="space-y-2">
          {items.map((p) => {
            const badge = STATUS_BADGE[p.status] ?? STATUS_BADGE.unverified;
            return (
              <li key={p.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{p.address}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {badge.hint}
                      </span>
                    </div>
                  </div>
                  {canArchive(p.status) && (
                    <button
                      className="shrink-0 text-sm underline"
                      onClick={() => setArchiveId(p.id)}
                    >
                      Archive
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {archiveId && (
        <Modal
          open={true}
          onClose={() => setArchiveId(null)}
          title="Archive property?"
        >
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              This will mark the property as archived. It cannot be undone.
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border px-3 py-2 text-sm"
                onClick={() => setArchiveId(null)}
              >
                Cancel
              </button>
              <LoadingButton
                loading={archiving}
                onClick={() => archiveId && archiveNow(archiveId)}
              >
                Archive
              </LoadingButton>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
