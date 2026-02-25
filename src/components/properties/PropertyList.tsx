"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { Modal } from "@/components/ui/Modal";

type Property = {
  id: string;
  address: string;
  status: "unverified" | "verified" | "archived";
  visibility: "private" | "public";
};

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
      if (!res.ok) return t.error(json?.error || "Couldn’t load properties.");
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
        return t.error(json?.error || "Couldn’t archive that — try again.");
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
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-muted-foreground">No properties yet.</div>
      ) : (
        <ul className="space-y-2">
          {items.map((p) => (
            <li key={p.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{p.address}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.status} • {p.visibility}
                  </div>
                </div>
                <button
                  className="text-sm underline"
                  onClick={() => setArchiveId(p.id)}
                >
                  Archive
                </button>
              </div>
            </li>
          ))}
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
              This will mark the property as archived.
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
